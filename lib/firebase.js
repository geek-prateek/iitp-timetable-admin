import admin from 'firebase-admin';

if (!admin.apps.length) {
  // We only need the projectId to verify ID tokens (it fetches public certs from Google)
  admin.initializeApp({
    projectId: 'iitp-timetable'
  });
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
