import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PWAInstallBanner
 * Captures the browser's `beforeinstallprompt` event and shows a branded
 * bottom banner. Dismiss is persisted in localStorage so it only reappears
 * after 30 days. Already-installed apps (standalone mode) never show it.
 */
const PWAInstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already installed → standalone display mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    // User dismissed recently (30-day cooldown)
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 30 * 24 * 60 * 60 * 1000) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Slight delay so the page has settled before showing
      setTimeout(() => setShow(true), 2500);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Track when the app is actually installed
    window.addEventListener('appinstalled', () => {
      setShow(false);
      setInstalled(true);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'accepted') setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-banner-dismissed', String(Date.now()));
    setShow(false);
  };

  // Brief "installed!" confirmation toast-style
  if (installed) {
    return (
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-violet-600 text-white text-sm font-semibold rounded-2xl shadow-xl flex items-center gap-2 whitespace-nowrap"
      >
        <span>✓</span> Zaltix HRMS installed!
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="install-banner"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto"
        >
          <div className="bg-violet-950 border border-violet-700/60 rounded-2xl px-4 py-3.5 shadow-2xl flex items-center gap-3">
            {/* Logo badge */}
            <div className="w-11 h-11 bg-golden-500 rounded-xl flex items-center justify-center font-extrabold text-white text-sm tracking-wide flex-shrink-0 shadow-lg">
              ZS
            </div>

            {/* Copy */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">Install Zaltix HRMS</p>
              <p className="text-violet-300 text-xs mt-0.5 leading-snug">
                Add to home screen for quick, offline access
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleInstall}
                className="px-3.5 py-1.5 bg-golden-500 hover:bg-golden-400 text-white text-xs font-bold rounded-xl transition-colors shadow"
              >
                Install
              </motion.button>
              <button
                onClick={handleDismiss}
                aria-label="Dismiss install banner"
                className="w-7 h-7 flex items-center justify-center text-violet-400 hover:text-white transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAInstallBanner;
