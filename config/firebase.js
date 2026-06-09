const admin = require('firebase-admin');

let initialized = false;

/**
 * Returns the Firebase Admin instance, or null if not configured.
 * Set FIREBASE_SERVICE_ACCOUNT env var to a base64-encoded service account JSON.
 *
 * How to get it:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   Then encode: base64 -i serviceAccountKey.json | tr -d '\n'
 *   Paste the result as FIREBASE_SERVICE_ACCOUNT in backend/.env
 */
const getFirebaseAdmin = () => {
  if (initialized) return admin;

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!encoded) return null;

  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    initialized = true;
    return admin;
  } catch (err) {
    console.error('[Firebase] Init failed:', err.message);
    return null;
  }
};

module.exports = { getFirebaseAdmin };
