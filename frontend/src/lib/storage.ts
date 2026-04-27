// Namespaced localStorage wrapper. Every key is stored under the `cmc.` prefix
// so the dashboard never collides with other apps' keys, and a future "wipe
// everything we own" routine can scan for that prefix safely.
//
// All methods are silent on error: a quota exceeded write or unavailable
// storage (e.g. private mode in some browsers) returns void / null instead of
// throwing. Callers can treat storage as best-effort cache.

const PREFIX = 'cmc.'

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(PREFIX + key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  set<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // QuotaExceededError or unavailable storage — silent no-op
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(PREFIX + key)
    } catch {
      // ignore
    }
  },
}
