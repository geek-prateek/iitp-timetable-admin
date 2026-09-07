import { list, put } from "@vercel/blob";
import { isAuthenticated } from "../lib/auth.js";

const PATHNAME = "iitp-timetable/resources.json";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store"
    }
  });
}

async function readResources() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return [];

  const result = await list({ prefix: PATHNAME, limit: 1 });
  const current = result.blobs.find(blob => blob.pathname === PATHNAME);
  if (!current) return [];

  const blobResponse = await fetch(current.url, { cache: "no-store" });
  if (!blobResponse.ok) return [];
  return blobResponse.json();
}

export async function GET(request) {
  try {
    let resources = await readResources();
    if (!isAuthenticated(request)) {
      resources = resources.filter(r => r.approved);
    }
    return response(resources);
  } catch (error) {
    return response({ error: error.message }, 500);
  }
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return response({ error: "Vercel Blob storage is not connected." }, 503);
  }

  try {
    const payload = await request.json();

    // Admin saving full list
    if (isAuthenticated(request) && Array.isArray(payload)) {
      await put(PATHNAME, JSON.stringify(payload), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      });
      return response(payload);
    }

    // Public user adding a single resource
    if (!payload.title || !payload.url || !payload.type) {
      return response({ error: "Title, url, and type are required." }, 400);
    }

    const resources = await readResources();

    // Create entry requiring approval
    const entry = {
      id: Date.now().toString(),
      title: String(payload.title).trim(),
      url: String(payload.url).trim(),
      type: String(payload.type).trim(),
      subject: String(payload.subject || "General").trim(),
      addedBy: String(payload.addedBy || "Anonymous").trim(),
      createdAt: new Date().toISOString(),
      approved: false
    };

    // Prepend to array
    resources.unshift(entry);

    // Save
    await put(PATHNAME, JSON.stringify(resources), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });

    // Public API only returns approved resources to them
    return response(resources.filter(r => r.approved));
  } catch (error) {
    return response({ error: error.message || "Could not publish resource." }, 500);
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
