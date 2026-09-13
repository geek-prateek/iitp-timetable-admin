import clientPromise from "../lib/mongodb.js";
import { isAuthenticated } from "../lib/auth.js";

const DB_NAME = "timetable_db";
const COLLECTION_NAME = "store";
const DOCUMENT_ID = "resources";

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
  if (!process.env.MONGODB_URI) return [];

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const current = await db.collection(COLLECTION_NAME).findOne({ _id: DOCUMENT_ID });
    
    if (!current || !current.data) return [];
    return current.data;
  } catch (error) {
    console.error("MongoDB read error:", error);
    return [];
  }
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
  if (!process.env.MONGODB_URI) {
    return response({ error: "MongoDB is not connected." }, 503);
  }

  try {
    const payload = await request.json();
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    // Admin saving full list
    if (isAuthenticated(request) && Array.isArray(payload)) {
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: DOCUMENT_ID },
        { $set: { data: payload } },
        { upsert: true }
      );
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
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: DOCUMENT_ID },
      { $set: { data: resources } },
      { upsert: true }
    );

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
