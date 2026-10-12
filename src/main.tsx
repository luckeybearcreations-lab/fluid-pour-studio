
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
