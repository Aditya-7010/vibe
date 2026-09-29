import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

/**
 * Native-only setup (Android/iOS via Capacitor). All of this is skipped
 * entirely when the site runs in a regular browser, so it's safe to ship
 * on the same codebase as the website — Capacitor.isNativePlatform() is
 * false there and nothing below ever fires.
 */
async function setupNative() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;

  const { App: CapApp } = await import('@capacitor/app');
  const { StatusBar, Style } = await import('@capacitor/status-bar');

  // Match the status bar to the app's dark theme instead of the OS default.
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0b0a14' });
  } catch {
    /* not fatal — some devices/OS versions restrict this */
  }

  // The hardware/gesture back button has no meaning to a WebView by
  // default: with nothing listening, Android just exits the app instead
  // of going back a screen. This makes it behave like a normal Android
  // app — back navigates within the app, and only exits once there's
  // nowhere left to go (i.e. on the landing/dashboard screen).
  CapApp.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      CapApp.exitApp();
    }
  });
}

setupNative();
