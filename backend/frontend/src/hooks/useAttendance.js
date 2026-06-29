import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getGPS = () =>
  new Promise((res, rej) => {
    if (!navigator.geolocation)
      return rej(Object.assign(new Error('Geolocation not supported'), { code: 0 }));
    navigator.geolocation.getCurrentPosition(res, rej, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });

const GPS_ERRORS = {
  0: 'Geolocation not supported on this device.',
  1: 'Location access denied. Please enable location services.',
  2: 'Location unavailable. Try again.',
  3: 'Location request timed out. Try again.',
};

/**
 * useAttendance(onRefresh)
 *
 * Returns { loading, locationModal, setLocationModal, handleCheckIn, handleCheckOut, confirmAction }
 * Render <LocationCheckModal modal={locationModal} onConfirm={confirmAction} onCancel={() => setLocationModal(null)} loading={loading} />
 * in the component.
 */
export const useAttendance = (onRefresh) => {
  const [loading, setLoading]           = useState(false);
  const [locationModal, setLocationModal] = useState(null);

  // Fetch GPS + office-info in parallel every time the modal opens.
  // This avoids a race condition in production where the cached office-info ref
  // may not yet be populated by the time the user clicks Check In.
  const _openModal = useCallback(async (type) => {
    setLoading(true);
    try {
      const [pos, officeRes] = await Promise.all([
        getGPS(),
        api.get('/attendance/office-info').catch(() => ({ data: null })),
      ]);
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const office  = officeRes.data;
      const distance = office?.enabled
        ? haversine(userLat, userLng, office.lat, office.lng)
        : null;
      setLocationModal({ type, userLat, userLng, office, distance });
    } catch (err) {
      toast.error(GPS_ERRORS[err.code] ?? err.message ?? 'Could not get location');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheckIn  = useCallback(() => _openModal('checkin'),  [_openModal]);
  const handleCheckOut = useCallback(() => _openModal('checkout'), [_openModal]);

  const confirmAction = useCallback(async () => {
    if (!locationModal) return;
    const { type, userLat, userLng } = locationModal;
    setLocationModal(null);
    setLoading(true);
    try {
      if (type === 'checkin') {
        await api.post('/attendance/check-in', { lat: userLat, lng: userLng });
        toast.success('Checked in successfully!');
      } else {
        await api.post('/attendance/check-out', { lat: userLat, lng: userLng });
        toast.success('Checked out successfully!');
      }
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || `${type === 'checkin' ? 'Check-in' : 'Check-out'} failed`);
    } finally {
      setLoading(false);
    }
  }, [locationModal, onRefresh]);

  return { loading, locationModal, setLocationModal, handleCheckIn, handleCheckOut, confirmAction };
};
