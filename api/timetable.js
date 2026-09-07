import { list, put } from "@vercel/blob";
import fallback from "../data/default-timetable.json" with { type: "json" };
import { isAuthenticated, passwordIsConfigured } from "../lib/auth.js";

const PATHNAME = "iitp-timetable/current.json";

function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function validate(data) {
  if (!data || typeof data !== "object") return "Payload must be an object.";

  for (const key of ["PROGRAMS", "COURSES", "SCHEDULE", "DAYS", "TIMES", "HOLIDAYS", "ASSIGNMENTS"]) {
    if (!Array.isArray(data[key])) return `${key} must be an array.`;
  }

  const courseIds = new Set();
  for (const course of data.COURSES) {
    if (!course.id || !course.name || !course.shortName || !course.code || !course.type) {
      return "Every course needs an id, name, short name, code, and type.";
    }
    if (courseIds.has(course.id)) return `Duplicate course id: ${course.id}`;
    courseIds.add(course.id);
  }

  for (const item of data.SCHEDULE) {
    if (!data.DAYS.includes(item.day)) return `Unknown day: ${item.day}`;
    if (!data.TIMES.includes(item.time)) return `Unknown time slot: ${item.time}`;
    if (!courseIds.has(item.course)) return `Unknown course in schedule: ${item.course}`;
  }

  for (const program of data.PROGRAMS) {
    if (!program.id || !program.name || !Array.isArray(program.electives)) {
      return "Every program needs an id, name, and electives array.";
    }
    const missing = program.electives.find(id => !courseIds.has(id));
    if (missing) return `Program ${program.name} references unknown course: ${missing}`;
  }

  return "";
}

async function readPublishedData() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return fallback;

  const result = await list({ prefix: PATHNAME, limit: 1 });
  const current = result.blobs.find(blob => blob.pathname === PATHNAME);
  if (!current) return fallback;

  const blobResponse = await fetch(current.url, { cache: "no-store" });
  if (!blobResponse.ok) throw new Error("Published timetable could not be read.");
  return blobResponse.json();
}

export async function GET() {
  try {
    return response(await readPublishedData());
  } catch (error) {
    return response({ error: error.message }, 500);
  }
}

export async function POST(request) {
  if (!passwordIsConfigured()) return response({ error: "ADMIN_PASSWORD is not configured." }, 503);
  if (!isAuthenticated(request)) return response({ error: "Authentication required." }, 401);
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return response({ error: "Vercel Blob storage is not connected." }, 503);

  try {
    const data = await request.json();
    const validationError = validate(data);
    if (validationError) return response({ error: validationError }, 400);

    const published = {
      ...data,
      version: Number(data.version || 0) + 1,
      updatedAt: new Date().toISOString()
    };

    await put(PATHNAME, JSON.stringify(published), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });

    return response(published);
  } catch (error) {
    return response({ error: error.message || "Could not publish timetable." }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
