/**
 * Client-side Web Push subscription helpers.
 *
 * Flow: parent taps "Enable notifications" → we request permission → subscribe
 * via the browser's push service using our VAPID public key → POST the
 * subscription (endpoint + p256dh + auth) to /api/custom/push-subscribe.
 *
 * iOS 16.4+ requires the app to be installed to the home screen (PWA) before
 * push subscription will work. Chrome / Android don't need install.
 */
import { pb, callCustom } from '../pb'

export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'unsubscribed'
  | 'subscribed'

/** Ask the server for the VAPID public key. Cached in-module after the first call. */
let cachedVapid: string | null = null
async function fetchVapidKey(): Promise<string> {
  if (cachedVapid) return cachedVapid
  const res = await pb.send<{ key: string }>('/api/custom/push-vapid-key', { method: 'GET' })
  cachedVapid = res.key || ''
  return cachedVapid
}

/** VAPID public keys arrive as URL-safe base64; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isPWAInstalled(): boolean {
  // iOS: only Web Push in installed-PWA context. Chrome Android is looser.
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari sets this on installed home-screen apps.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return standalone
}

function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) && !('MSStream' in window)
}

export async function getPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  // iOS Safari (< 16.4 OR not installed as PWA) → the API exists but subscribing
  // will fail with "InvalidStateError". Best signal we can give the parent is
  // "needs-install".
  if (isIOS() && !isPWAInstalled()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'subscribed' : 'unsubscribed'
}

export async function subscribeToPush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (isIOS() && !isPWAInstalled()) return 'needs-install'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'unsubscribed'

  const reg = await navigator.serviceWorker.ready
  const key = await fetchVapidKey()
  if (!key) throw new Error('Server has no VAPID public key configured yet.')

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    })
  }
  const json = sub.toJSON() as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  await callCustom('push-subscribe', {
    endpoint: json.endpoint || '',
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
    userAgent: navigator.userAgent,
  })
  return 'subscribed'
}

export async function unsubscribeFromPush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    try {
      await callCustom('push-unsubscribe', { endpoint: sub.endpoint })
    } catch {
      /* ignore server errors */
    }
    await sub.unsubscribe()
  }
  return 'unsubscribed'
}
