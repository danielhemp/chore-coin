import PocketBase from 'pocketbase'

/**
 * PocketBase client — one instance shared across the app.
 * VITE_PB_URL should point to the PocketBase base URL.
 * - In dev: e.g. http://localhost:8090
 * - In prod: e.g. https://chores-api.family.tld  OR /  when nginx reverse-proxies
 *   /api on the same origin as the app.
 */
const url = import.meta.env.VITE_PB_URL || '/'
export const pb = new PocketBase(url)

// Disable the SDK's auto-cancellation of duplicate concurrent requests.
// It's meant for search-input debouncing but fires whenever multiple hooks
// hit the same collection at the same tick (e.g. two KidTiles mounting
// together on the dashboard), silently erroring the earlier request with
// "The request was autocancelled." A family app has no need for it.
pb.autoCancellation(false)

// Keep the JWT valid across page reloads (PB persists it to localStorage by default).
export const LOCAL_TZ = import.meta.env.VITE_LOCAL_TIMEZONE || 'America/Chicago'

/** Helper for calling our custom /api/custom/* endpoints. */
export async function callCustom<T = unknown>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  return pb.send<T>(`/api/custom/${path}`, {
    method: 'POST',
    body: body ?? {},
  })
}
