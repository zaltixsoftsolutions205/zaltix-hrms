import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { requestPushToken, onForegroundMessage } from '../utils/firebase';
import api from '../utils/api';

let tokenRegistered = false;

const usePushNotifications = (user) => {
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    if (tokenRegistered) return;

    const register = async () => {
      try {
        const token = await requestPushToken();
        if (!token) return;
        const oldToken = localStorage.getItem('fcmToken');
        await api.post('/notifications/push-token', { token, oldToken: oldToken || null });
        tokenRegistered = true;
        localStorage.setItem('fcmToken', token);
      } catch (err) {
        console.warn('[FCM] Token registration failed:', err?.message || err);
      }
    };

    register();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    unsubRef.current = onForegroundMessage((payload) => {
      const title = payload.notification?.title || 'Zaltix HRMS';
      const body  = payload.notification?.body  || '';
      const link  = payload.data?.link;

      const msg = [title, body, link ? 'Tap to view →' : ''].filter(Boolean).join('\n');

      toast(msg, {
        duration: 6000,
        onClick: () => { if (link) window.location.href = link; },
      });
    });

    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [user]);
};

export default usePushNotifications;
