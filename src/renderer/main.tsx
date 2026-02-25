import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// apply initial dark/light class before React mounts to avoid flash
(function initializeTheme() {
  try {
    const stored = window.localStorage.getItem('tt.theme.mode');
    let mode: 'light' | 'dark' | 'system' = 'system';
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      mode = stored;
    }
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.dataset.theme = resolved;
  } catch (e) {
    // ignore
  }
})();

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(<App />);
}
