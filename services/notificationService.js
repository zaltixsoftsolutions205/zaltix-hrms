const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendMail } = require('../config/mail');
const { getFirebaseAdmin } = require('../config/firebase');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Email templates for fallback notifications
const emailBody = (title, message, link) => `
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#f5f3ff;padding:20px">
<div style="max-width:500px;margin:auto;background:#fff;border-radius:12px;border:1px solid #ddd6fe;overflow:hidden">
  <div style="background:#4c1d95;padding:20px 24px">
    <h2 style="color:#fff;margin:0;font-size:18px">Zaltix HRMS</h2>
  </div>
  <div style="padding:24px">
    <h3 style="color:#4c1d95;margin:0 0 8px">${title}</h3>
    <p style="color:#374151;margin:0 0 20px">${message}</p>
    ${link ? `<a href="${FRONTEND_URL}${link}" style="background:#d97706;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Details</a>` : ''}
  </div>
  <div style="padding:12px 24px;background:#f5f3ff;color:#7c3aed;font-size:11px">
    You received this because push notifications are not enabled on your device.
  </div>
</div></body></html>`;

/**
 * Send a notification to a single user.
 * Channels (in order): in-app DB → FCM push → email fallback
 */
const notify = async (recipientId, { title, message, type = 'general', link = '', dedupKey = null, dedupWindowMs = 0 }) => {
  if (!recipientId) return null;

  // Dedup check — if dedupKey provided, skip if same notification sent within the window
  if (dedupKey && dedupWindowMs > 0) {
    const since = new Date(Date.now() - dedupWindowMs);
    const existing = await Notification.findOne({ recipient: recipientId, dedupKey, createdAt: { $gte: since } });
    if (existing) return existing;
  }

  // 1. In-app (MongoDB)
  const notification = await Notification.create({ recipient: recipientId, title, message, type, link, dedupKey });

  // 2. FCM Push
  const [user, unreadCount] = await Promise.all([
    User.findById(recipientId).select('pushTokens email name').lean(),
    Notification.countDocuments({ recipient: recipientId, isRead: false }),
  ]);
  if (!user) return notification;

  const hasPushTokens = user.pushTokens && user.pushTokens.length > 0;
  console.log('[FCM] notify type:', type, '| hasPushTokens:', hasPushTokens, '| recipient:', recipientId);

  if (hasPushTokens) {
    const firebaseAdmin = getFirebaseAdmin();
    if (firebaseAdmin) {
      const messaging = firebaseAdmin.messaging();
      const invalidTokens = [];
      const fullLink = link ? `${FRONTEND_URL}${link}` : FRONTEND_URL;

      console.log('[FCM] Sending to', user.pushTokens.length, 'token(s) for user', recipientId);
      await Promise.allSettled(
        user.pushTokens.map(async (token) => {
          try {
            await messaging.send({
              token,
              notification: { title, body: message },
              data: { link: link || '', unreadCount: String(unreadCount) },
              webpush: {
                notification: {
                  icon: `${FRONTEND_URL}/pwa-192x192.png`,
                  badge: `${FRONTEND_URL}/pwa-192x192.png`,
                  requireInteraction: false,
                  data: { link: link || '' },
                },
                fcmOptions: { link: fullLink },
              },
            });
            console.log('[FCM] Sent successfully to token:', token.substring(0, 20) + '...');
          } catch (err) {
            console.error('[FCM] Send failed:', err.code, err.message);
            const invalid = [
              'messaging/invalid-registration-token',
              'messaging/registration-token-not-registered',
            ];
            if (invalid.includes(err.code)) invalidTokens.push(token);
          }
        })
      );

      if (invalidTokens.length > 0) {
        await User.findByIdAndUpdate(recipientId, { $pull: { pushTokens: { $in: invalidTokens } } });
      }
    }
  } else if (user.email && ['leave', 'task', 'payslip', 'document'].includes(type)) {
    // 3. Email fallback — only for important notification types
    try {
      await sendMail({
        to: user.email,
        subject: `[Zaltix] ${title}`,
        html: emailBody(title, message, link),
      });
    } catch (_) {}
  }

  return notification;
};

/**
 * Send the same notification to multiple users.
 */
const notifyMany = async (recipientIds, payload) => {
  if (!recipientIds || recipientIds.length === 0) return [];
  return Promise.all(recipientIds.map((id) => notify(id, payload).catch(() => null)));
};

module.exports = { notify, notifyMany };
