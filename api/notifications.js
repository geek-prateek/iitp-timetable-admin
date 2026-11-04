import clientPromise from "../lib/mongodb.js";
import { isAuthenticated, passwordIsConfigured } from "../lib/auth.js";
import { sendAnnouncementNotification, subscribeDeviceToken } from "../lib/firebase.js";

const DB_NAME = "timetable_db";
const TOKENS_COLLECTION = "fcm_tokens";
const TIMETABLE_COLLECTION = "store";
const DOCUMENT_ID = "current_timetable";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "cache-control": "no-store"
    }
  });
}

export async function GET(request) {
  if (!isAuthenticated(request)) {
    return response({ error: "Unauthorized." }, 401);
  }

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const count = await db.collection(TOKENS_COLLECTION).countDocuments();
    return response({ subscriberCount: count });
  } catch (error) {
    return response({ subscriberCount: 0, error: error.message });
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = payload.action || "subscribe";

    // 1. Device Token Registration (Public for all student devices)
    if (action === "subscribe") {
      const { token, email } = payload;
      if (!token || typeof token !== "string") {
        return response({ error: "Valid FCM token is required." }, 400);
      }

      // Subscribe token to FCM announcements topic
      const subResult = await subscribeDeviceToken(token);

      // Save/update token in MongoDB for subscriber count and records
      if (process.env.MONGODB_URI) {
        try {
          const client = await clientPromise;
          const db = client.db(DB_NAME);
          await db.collection(TOKENS_COLLECTION).updateOne(
            { token },
            {
              $set: {
                token,
                email: email || null,
                lastSeenAt: new Date()
              },
              $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
          );
        } catch (dbErr) {
          console.error("Failed to store token in MongoDB:", dbErr);
        }
      }

      return response({
        success: true,
        topicSubscribed: subResult.success,
        topicError: subResult.error || null
      });
    }

    // 2. Direct Announcement Broadcast (Admin Only)
    if (action === "broadcast") {
      if (!passwordIsConfigured()) {
        return response({ error: "ADMIN_PASSWORD is not configured." }, 503);
      }
      if (!isAuthenticated(request)) {
        return response({ error: "Authentication required." }, 401);
      }

      const { message, title = "📢 IIT Patna Announcement" } = payload;
      if (!message || !message.trim()) {
        return response({ error: "Announcement message cannot be empty." }, 400);
      }

      // Send Push Notification
      const pushResult = await sendAnnouncementNotification(message, title);

      // Also sync it to the timetable notification banner in MongoDB
      if (process.env.MONGODB_URI) {
        try {
          const client = await clientPromise;
          const db = client.db(DB_NAME);
          await db.collection(TIMETABLE_COLLECTION).updateOne(
            { _id: DOCUMENT_ID },
            {
              $set: {
                "data.notification": message.trim(),
                "data.updatedAt": new Date().toISOString()
              }
            }
          );
        } catch (dbErr) {
          console.error("Failed to sync banner to MongoDB:", dbErr);
        }
      }

      return response({
        success: pushResult.success,
        messageId: pushResult.messageId || null,
        error: pushResult.error || null
      });
    }

    return response({ error: "Invalid action." }, 400);
  } catch (error) {
    console.error("Notification API Error:", error);
    return response({ error: error.message || "Failed to process request." }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}
