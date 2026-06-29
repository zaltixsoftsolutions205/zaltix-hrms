// Firebase Messaging Service Worker — handles background push notifications
// This file is served as-is from /public and must NOT be processed by Vite.
//
// IMPORTANT: Fill in your Firebase project config below.
// Get it from: Firebase Console → Project Settings → General → SDK setup
//
// Do NOT use import.meta.env here — this file has no Vite processing.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── FILL IN YOUR FIREBASE CONFIG ────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            'AIzaSyBDQeoJ1kLYOHSXzg13Gnxam2zHrKji60U',
  authDomain:        'zaltix-hrms.firebaseapp.com',
  projectId:         'zaltix-hrms',
  storageBucket:     'zaltix-hrms.firebasestorage.app',
  messagingSenderId: '687615686524',
  appId:             '1:687615686524:web:60ff26519a85d0154a96f9',
});
// ────────────────────────────────────────────────────────────────────────────

const messaging = firebase.messaging();

// Track badge count in SW scope
let swBadgeCount = 0;

// Handle background messages (app is closed or in another tab)
// When onBackgroundMessage is registered, Firebase SDK suppresses auto-display —
// we must always call showNotification ourselves.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Zaltix HRMS';
  const body  = payload.notification?.body  || payload.data?.body  || '';
  const link  = payload.data?.link || '/';

  // Update badge count always (even when foreground handles the toast)
  swBadgeCount = payload.data?.unreadCount ? parseInt(payload.data.unreadCount) : swBadgeCount + 1;
  if ('setAppBadge' in self.navigator) {
    self.navigator.setAppBadge(swBadgeCount).catch(() => {});
  }

  // Skip browser notification if the app is already open and focused —
  // the foreground onMessage handler shows a toast instead, preventing duplicates.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const appOpen = windowClients.some(
        c => c.url.includes(self.location.origin) && c.visibilityState === 'visible'
      );
      if (appOpen) return; // foreground toast will handle it
      return self.registration.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'hrms-notif',
        requireInteraction: false,
        data: { link },
      });
    })
  );
});

// Navigate to the relevant page when notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  swBadgeCount = 0;
  if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {});
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If HRMS is already open, focus that window and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(self.location.origin + link);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(self.location.origin + link);
      }
    })
  );
});
