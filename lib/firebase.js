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
