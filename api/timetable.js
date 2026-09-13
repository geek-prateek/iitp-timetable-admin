import clientPromise from "../lib/mongodb.js";
import fallback from "../data/default-timetable.json" with { type: "json" };
import { isAuthenticated, passwordIsConfigured } from "../lib/auth.js";
import { verifyFirebaseToken } from "../lib/firebase.js";

const DB_NAME = "timetable_db";
const COLLECTION_NAME = "store";
const DOCUMENT_ID = "current_timetable";

function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
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
  if (!process.env.MONGODB_URI) return fallback;

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const current = await db.collection(COLLECTION_NAME).findOne({ _id: DOCUMENT_ID });
    
    if (!current || !current.data) return fallback;
    return current.data;
  } catch (error) {
    console.error("MongoDB read error:", error);
    return fallback;
  }
}

export async function GET(request) {
  try {
    // Admins editing the panel should always be allowed
    const isAdmin = isAuthenticated(request);
    
    if (!isAdmin) {
      // For the public frontend, verify Firebase Token and domain
      const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
      if (!decoded || !decoded.email || !decoded.email.endsWith("@iitp.ac.in")) {
        return response({ error: "Unauthorized. @iitp.ac.in authentication required." }, 401);
      }
    }

    return response(await readPublishedData());
  } catch (error) {
    return response({ error: error.message }, 500);
  }
}

export async function POST(request) {
  if (!passwordIsConfigured()) return response({ error: "ADMIN_PASSWORD is not configured." }, 503);
  if (!isAuthenticated(request)) return response({ error: "Authentication required." }, 401);
  if (!process.env.MONGODB_URI) return response({ error: "MongoDB is not connected." }, 503);

  try {
    const data = await request.json();
    const validationError = validate(data);
    if (validationError) return response({ error: validationError }, 400);

    const published = {
      ...data,
      version: Number(data.version || 0) + 1,
      updatedAt: new Date().toISOString()
    };

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: DOCUMENT_ID },
      { $set: { data: published } },
      { upsert: true }
    );

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
