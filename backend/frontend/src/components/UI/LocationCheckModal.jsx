import { motion } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const LocationCheckModal = ({ modal, onConfirm, onCancel, loading }) => {
  if (!modal) return null;

  const { type, userLat, userLng, office, distance } = modal;
  const withinRange = office?.enabled ? distance <= office.radius : true;
  const isCheckin = type === 'checkin';
  // Block both check-in and check-out outside office radius
  const confirmDisabled = loading || (!withinRange && office?.enabled);

  // Map image proxied through backend — avoids Google API key referrer restrictions
  const mapUrl = office?.enabled && userLat != null && userLng != null
    ? `${API_BASE}/attendance/map-image?userLat=${userLat}&userLng=${userLng}`
    : null;

  const gmapsLink =
    `https://www.google.com/maps/dir/${userLat},${userLng}/${office?.lat ?? ''},${office?.lng ?? ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        {/* Header */}
        <div className={`px-5 py-4 text-white ${isCheckin ? 'bg-gradient-to-r from-violet-700 to-violet-600' : 'bg-gradient-to-r from-red-600 to-red-500'}`}>
          <h3 className="font-bold text-base">
            {isCheckin ? '📍 Confirm Check-In' : '📍 Confirm Check-Out'}
          </h3>
          <p className="text-xs text-white/75 mt-0.5">Verifying your location against the office</p>
        </div>

        {/* Map image */}
        {mapUrl ? (
          <div className="relative bg-gray-100">
            <img
              src={mapUrl}
              alt="Location map"
              className="w-full object-cover"
              style={{ height: 180 }}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div className="absolute bottom-2 left-2 flex gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
                <span className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" /> Office
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
                <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" /> You
              </span>
            </div>
          </div>
        ) : (
          <div className="h-14 flex items-center justify-center bg-violet-50 border-b border-violet-100">
            <p className="text-xs text-violet-400">Map preview not available</p>
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          {/* Distance indicator */}
          {office?.enabled && distance !== null ? (
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${
              withinRange
                ? 'bg-violet-50 border-violet-100'
                : 'bg-gray-100 border-gray-100'
            }`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                withinRange ? 'bg-violet-100' : 'bg-gray-100'
              }`}>
                {withinRange ? (
                  <svg className="w-5 h-5 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold leading-tight ${withinRange ? 'text-violet-700' : 'text-gray-900'}`}>
                  {withinRange
                    ? 'Within office range ✓'
                    : `Outside office range — ${isCheckin ? 'check-in' : 'check-out'} blocked`}
                </p>
                <p className={`text-xs mt-0.5 ${withinRange ? 'text-violet-600' : 'text-gray-900'}`}>
                  {distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(2)} km`} from office · allowed within {office.radius}m
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
              <p className="text-sm font-medium text-violet-700">Location obtained</p>
              <p className="text-xs text-violet-500 mt-0.5">{userLat?.toFixed(5)}, {userLng?.toFixed(5)}</p>
            </div>
          )}

          {/* Directions link when blocked (both check-in and check-out) */}
          {!withinRange && office?.enabled && (
            <a
              href={gmapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 hover:underline"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Get directions to office →
            </a>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl border border-violet-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                isCheckin
                  ? 'bg-violet-600 hover:bg-violet-700'
                  : 'bg-gray-200 hover:bg-gray-200'
              }`}
            >
              {loading
                ? 'Processing...'
                : isCheckin
                  ? 'Check In'
                  : 'Check Out'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LocationCheckModal;
