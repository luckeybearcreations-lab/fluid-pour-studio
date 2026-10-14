
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { isNativeApp } from './lib/native'

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);

// The Android app ships its files inside the app, so it needs no offline cache.
if ('serviceWorker' in navigator && !isNativeApp()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
