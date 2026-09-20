import admin from 'firebase-admin';
import { isAuthenticated } from "../lib/auth.js";
import "../lib/firebase.js"; // Ensures admin is initialized with credentials

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS, DELETE",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store"
    }
  });
}

export async function GET(request) {
  if (!isAuthenticated(request)) {
    return response({ error: "Unauthorized." }, 401);
  }

  try {
    const db = admin.firestore();
    const snapshot = await db.collection("class_groups").get();
    const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return response(groups);
  } catch (error) {
    console.error("Firestore read error:", error);
    return response({ error: "Could not read from Firestore. Is FIREBASE_SERVICE_ACCOUNT configured?" }, 500);
  }
}

export async function POST(request) {
  if (!isAuthenticated(request)) {
    return response({ error: "Unauthorized." }, 401);
  }

  try {
    const payload = await request.json();
    const { id, link } = payload;

    if (!id || !link) {
      return response({ error: "Missing id or link." }, 400);
    }

    if (!/^https:\/\/teams\.microsoft\.com\/.+/i.test(link)) {
      return response({ error: "Must be a valid Microsoft Teams link." }, 400);
    }

    const db = admin.firestore();
    await db.collection("class_groups").doc(id).update({
      link: link
    });

    return response({ success: true });
  } catch (error) {
    console.error("Firestore update error:", error);
    return response({ error: error.message }, 500);
  }
}

export async function DELETE(request) {
  if (!isAuthenticated(request)) {
    return response({ error: "Unauthorized." }, 401);
  }

  try {
    const payload = await request.json();
    const { id } = payload;

    if (!id) {
      return response({ error: "Missing id." }, 400);
    }

    const db = admin.firestore();
    await db.collection("class_groups").doc(id).delete();

    return response({ success: true });
  } catch (error) {
    console.error("Firestore delete error:", error);
    return response({ error: error.message }, 500);
  }
}
