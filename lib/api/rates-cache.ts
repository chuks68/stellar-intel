import { recordRatesCacheHit, recordRatesCacheMiss } from '../metrics';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 15 * 1000; // 15 seconds

/**
 * Looks up rates in the cache, emitting hit/miss metrics.
 * If forceRefresh is true, invalidates cache entry and returns null.
 */
export function getCachedRates(corridorId: string, amount: string, forceRefresh = false): any | null {
  const key = `${corridorId}:${amount}`;
  if (forceRefresh) {
    cache.delete(key);
    recordRatesCacheMiss();
    return null;
  }

  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    recordRatesCacheHit();
    return entry.data;
  }

  recordRatesCacheMiss();
  return null;
}

/**
 * Caches rates for a corridor and amount with a 15-second TTL.
 */
export function setCachedRates(corridorId: string, amount: string, data: any): void {
  const key = `${corridorId}:${amount}`;
  cache.set(key, {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Clears the in-memory rates cache and resets metrics (intended for tests).
 */
export function clearRatesCache(): void {
  cache.clear();
}
