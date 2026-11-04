import admin from 'firebase-admin';

if (!admin.apps.length) {
  const initConfig = { projectId: 'iitp-timetable' };
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      initConfig.credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
    }
  }
  
  admin.initializeApp(initConfig);
}

export const verifyFirebaseToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return null;
  }
};

export const subscribeDeviceToken = async (token) => {
  if (!token) return { success: false, error: 'Missing token' };
  try {
    const res = await admin.messaging().subscribeToTopic([token], 'announcements');
    return { success: true, ...res };
  } catch (error) {
    console.error('Error subscribing token to topic:', error);
    return { success: false, error: error.message };
  }
};

export const unsubscribeDeviceToken = async (token) => {
  if (!token) return { success: false, error: 'Missing token' };
  try {
    const res = await admin.messaging().unsubscribeFromTopic([token], 'announcements');
    return { success: true, ...res };
  } catch (error) {
    console.error('Error unsubscribing token from topic:', error);
    return { success: false, error: error.message };
  }
};

export const sendAnnouncementNotification = async (messageText, title = "📢 IIT Patna Announcement") => {
  if (!messageText || !messageText.trim()) {
    return { success: false, reason: "Message is empty" };
  }

  const payload = {
    topic: 'announcements',
    notification: {
      title: title,
      body: messageText.trim()
    },
    webpush: {
      notification: {
        title: title,
        body: messageText.trim(),
        icon: 'https://iitp-mtech-ai-dse-timetable.vercel.app/assets/iitp-seal.png',
        badge: 'https://iitp-mtech-ai-dse-timetable.vercel.app/assets/app-icon.svg',
        tag: 'iitp-announcement',
        renotify: true,
        requireInteraction: true
      },
      fcmOptions: {
        link: 'https://iitp-mtech-ai-dse-timetable.vercel.app/'
      }
    },
    data: {
      type: 'announcement',
      title: title,
      message: messageText.trim(),
      url: 'https://iitp-mtech-ai-dse-timetable.vercel.app/'
    }
  };

  try {
    const response = await admin.messaging().send(payload);
    console.log("Successfully sent announcement notification:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    return { success: false, error: error.message };
  }
};

