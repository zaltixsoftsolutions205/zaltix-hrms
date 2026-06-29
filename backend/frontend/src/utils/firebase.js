import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase project config — fill these in from:
// Firebase Console → Project Settings → General → Your apps → SDK setup & configuration
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// VAPID public key — from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = 'BK9zJR3RHczVO8VMzyUXmjgk1--5hzkBgYqlrotjtnWEmW4yXGBXNeb1SdzqMmvCJiRO21ccYAMpuCqK5x_qVl4';

const isConfigured = () =>
  Object.values(firebaseConfig).every((v) => v && v !== 'undefined' && v !== 'null');

let messaging = null;

const getFirebaseMessaging = () => {
  if (!isConfigured()) return null;
  if (messaging) return messaging;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
};

/**
 * Request notification permission and return the FCM push token.
 * Returns null if permission is denied or Firebase is not configured.
 */
export const requestPushToken = async () => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  const msg = getFirebaseMessaging();
  if (!msg) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    // Register firebase-messaging-sw.js (separate from workbox sw.js)
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });
    await swReg.update();

    const token = await getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    return token || null;
  } catch (err) {
    console.warn('[FCM] Token error:', err.message);
    return null;
  }
};

/**
 * Listen for foreground push messages (app is open).
 * Returns an unsubscribe function.
 */
export const onForegroundMessage = (callback) => {
  const msg = getFirebaseMessaging();
  if (!msg) return () => {};
  return onMessage(msg, callback);
};
