// Server-side event deduplication utility
// Using a Map for O(1) lookups with expiration timestamps
const globalWithDedup = global as typeof globalThis & {
  __recent_events?: Map<string, number>;
};

const recentEvents = globalWithDedup.__recent_events || new Map<string, number>();

if (process.env.NODE_ENV !== 'production') {
  globalWithDedup.__recent_events = recentEvents;
}

// Periodic cleanup every 30 seconds to keep memory lean
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, expiry] of recentEvents.entries()) {
      if (now > expiry) {
        recentEvents.delete(id);
      }
    }
  }, 30000);
}

/**
 * Checks if an event ID is a duplicate.
 * 
 * @param eventId The unique identifier for the event
 * @param ttlMs Time to live in milliseconds (default 5000)
 * @returns true if duplicate, false otherwise
 */
export function isDuplicate(eventId: string | undefined, ttlMs: number = 5000): boolean {
  if (!eventId) return false;

  const now = Date.now();
  const existingExpiry = recentEvents.get(eventId);

  if (existingExpiry && now < existingExpiry) {
    return true;
  }

  recentEvents.set(eventId, now + ttlMs);
  return false;
}
