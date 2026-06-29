import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

setTimeout(() => {
  const splash = document.getElementById('splash');
  if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 450); }
}, 500);

// Add a CSS hook when running as a PWA (standalone) so we can tweak sizes/alignments
function applyPwaClass() {
  try {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) document.documentElement.classList.add('is-pwa');
    else document.documentElement.classList.remove('is-pwa');
  } catch (e) { /* ignore */ }
}
applyPwaClass();
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', applyPwaClass);
