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
    const groups = snapshot.docs.map(doc => {
      const d = doc.data();
      let createdAtFormatted = "";
      if (d.createdAt) {
        if (typeof d.createdAt.toDate === "function") {
          createdAtFormatted = d.createdAt.toDate().toISOString();
        } else if (d.createdAt._seconds) {
          createdAtFormatted = new Date(d.createdAt._seconds * 1000).toISOString();
        } else if (typeof d.createdAt === "string") {
          createdAtFormatted = d.createdAt;
        }
      }
      return {
        id: doc.id,
        ...d,
        createdAtFormatted
      };
    });
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
    const link = (payload.link || "").trim();

    if (!link) {
      return response({ error: "Missing link." }, 400);
    }

    if (!/^https:\/\/teams\.microsoft\.com\/.+/i.test(link)) {
      return response({ error: "Must be a valid Microsoft Teams link (starting with https://teams.microsoft.com/)." }, 400);
    }

    const db = admin.firestore();

    // Updating existing group link
    if (payload.id) {
      await db.collection("class_groups").doc(payload.id).set({
        link: link,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "Admin"
      }, { merge: true });
      return response({ success: true, id: payload.id });
    }

    // Creating a new class group
    const degree = (payload.degree || "").trim();
    const specialization = (payload.specialization || "").trim();
    const session = (payload.session || "2026-27").trim();

    if (!degree || !specialization) {
      return response({ error: "Degree and Specialization are required." }, 400);
    }

    const createSlug = (text) => (text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const docId = `teams_${createSlug(degree)}_${createSlug(specialization)}`;

    const newGroup = {
      degree,
      specialization,
      session,
      link,
      createdBy: "Admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("class_groups").doc(docId).set(newGroup, { merge: true });

    return response({ success: true, id: docId, ...newGroup });
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
