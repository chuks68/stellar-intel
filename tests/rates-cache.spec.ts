import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearRatesCache } from '@/lib/api/rates-cache';
import { resetMetrics, getMetricsSnapshot } from '@/lib/metrics';

// Mock server rates fetcher so we don't trigger real network calls in tests.
const fetchCorridorRatesMock = vi.fn().mockResolvedValue({
  corridorId: 'usdc-ngn',
  rates: [
    {
      anchorId: 'cowrie',
      anchorName: 'Cowrie Exchange',
      corridorId: 'usdc-ngn',
      fee: 2,
      feeType: 'flat',
      exchangeRate: 1580,
      totalReceived: 153660,
      source: 'sep24-fee',
      updatedAt: new Date(),
    },
  ],
  pending: [],
  bestRateId: 'cowrie',
  errors: [],
});

vi.mock('@/lib/stellar/server-rates', () => ({
  fetchCorridorRates: (...args: any[]) => fetchCorridorRatesMock(...args),
}));

import { GET as getRates } from '@/app/api/rates/[corridor]/route';
import { GET as getMetrics } from '@/app/api/metrics/route';

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe('Rates Endpoint Caching & Hit/Miss Observability', () => {
  beforeEach(() => {
    clearRatesCache();
    resetMetrics();
    fetchCorridorRatesMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records miss on first request and caches the result for subsequent hits', async () => {
    // 1. Initial Request (Miss)
    const req1 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100');
    const res1 = await getRates(req1, { params: { corridor: 'usdc-ngn' } });
    expect(res1.status).toBe(200);
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(1);

    let metrics = getMetricsSnapshot();
    expect(metrics.ratesCache.hits).toBe(0);
    expect(metrics.ratesCache.misses).toBe(1);

    // 2. Second Request (Hit)
    const req2 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100');
    const res2 = await getRates(req2, { params: { corridor: 'usdc-ngn' } });
    expect(res2.status).toBe(200);
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(1); // Not called again

    metrics = getMetricsSnapshot();
    expect(metrics.ratesCache.hits).toBe(1);
    expect(metrics.ratesCache.misses).toBe(1);

    // 3. Exposes the metrics correctly via /api/metrics GET handler
    const metricsRes = await getMetrics(new NextRequest('http://localhost/api/metrics'));
    expect(metricsRes.status).toBe(200);
    const metricsBody = await metricsRes.json();
    expect(metricsBody.ratesCache.hits).toBe(1);
    expect(metricsBody.ratesCache.misses).toBe(1);
  });

  it('bypasses and invalidates the cache when forceRefresh query parameter is true', async () => {
    // 1. Populate Cache (Miss)
    const req1 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100');
    await getRates(req1, { params: { corridor: 'usdc-ngn' } });
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(1);

    // 2. Request with forceRefresh=true (Miss)
    const req2 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100&forceRefresh=true');
    await getRates(req2, { params: { corridor: 'usdc-ngn' } });
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(2); // Fetched again

    const metrics = getMetricsSnapshot();
    expect(metrics.ratesCache.hits).toBe(0);
    expect(metrics.ratesCache.misses).toBe(2);
  });

  it('bypasses and invalidates the cache when Cache-Control header has no-cache or no-store', async () => {
    // 1. Populate Cache (Miss)
    const req1 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100');
    await getRates(req1, { params: { corridor: 'usdc-ngn' } });
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(1);

    // 2. Request with Cache-Control: no-cache (Miss)
    const req2 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100', {
      'cache-control': 'no-cache',
    });
    await getRates(req2, { params: { corridor: 'usdc-ngn' } });
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(2);

    // 3. Request with Cache-Control: no-store (Miss)
    const req3 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100', {
      'cache-control': 'no-store',
    });
    await getRates(req3, { params: { corridor: 'usdc-ngn' } });
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(3);

    // 4. Request with Pragma: no-cache (Miss)
    const req4 = makeRequest('http://localhost/api/rates/usdc-ngn?amount=100', {
      pragma: 'no-cache',
    });
    await getRates(req4, { params: { corridor: 'usdc-ngn' } });
    expect(fetchCorridorRatesMock).toHaveBeenCalledTimes(4);

    const metrics = getMetricsSnapshot();
    expect(metrics.ratesCache.hits).toBe(0);
    expect(metrics.ratesCache.misses).toBe(4);
  });
});
