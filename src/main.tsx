import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import './index.css'

// Detect standalone / installed-webapp / Assistive Access Simple Web contexts
// and add a class on <html> so CSS can hide our own top chrome (which is
// redundant when iOS is already framing the app). Three ways to trigger it:
//   1. matchMedia('(display-mode: standalone)') — home-screen PWA launch
//   2. window.navigator.standalone === true — legacy iOS home-screen webapp
//   3. ?kiosk=1 in the URL — manual override for cases where the above two
//      don't fire (iOS 26 Assistive Access Simple Web wraps the site in a
//      WKWebView which may not report standalone). Add ?kiosk=1 to the URL
//      you configure as the Simple Web target.
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true ||
  new URLSearchParams(window.location.search).get('kiosk') === '1'
if (isStandalone) {
  document.documentElement.classList.add('installed-webapp')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
