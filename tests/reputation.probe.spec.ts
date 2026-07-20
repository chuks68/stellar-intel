import { describe, it, expect } from 'vitest';
import {
  InMemoryProbeStore,
  probeAnchor,
  runProbe,
  reachabilityScore,
  averageLatencyMs,
  classifyFailure,
  InMemoryDriftStore,
  detectQuoteDrift,
  probeQuoteDrift,
  probeQuoteLatency,
  probeAllAnchorQuotes,
  quoteLatencyPercentiles,
  type TomlProbeResult,
  type AnchorQuote,
  type RateProbeResult,
  type QuoteProbeResult,
} from '@/lib/reputation/probe';
import type { Anchor } from '@/types';

/** Deterministic clock: returns `start`, then advances by `step` each call. */
function steppingClock(start = 1000, step = 120): () => number {
  let t = start;
  return () => {
    const value = t;
    t += step;
    return value;
  };
}

const ok = async (): Promise<TomlProbeResult> => ({ ok: true });
const down = async (): Promise<TomlProbeResult> => ({ ok: false, error: 'HTTP 521' });
const throws = async (): Promise<TomlProbeResult> => {
  throw new Error('ENOTFOUND');
};

describe('reputation probe', () => {
  it('records a reachable sample with measured latency', async () => {
    const store = new InMemoryProbeStore();
    const sample = await probeAnchor('up.example', store, {
      fetchToml: ok,
      now: steppingClock(1000, 120),
    });

    expect(sample.reachable).toBe(true);
    expect(sample.latencyMs).toBe(120);
    expect(sample.at).toBe(1120);
    expect(store.samples('up.example')).toHaveLength(1);
  });

  it('records an unreachable sample when the toml fetch fails', async () => {
    const store = new InMemoryProbeStore();
    const sample = await probeAnchor('down.example', store, { fetchToml: down });

    expect(sample.reachable).toBe(false);
    expect(sample.error).toBe('HTTP 521');
    expect(store.samples('down.example')).toHaveLength(1);
  });

  it('records unreachable (does not throw) when the fetch helper throws', async () => {
    const store = new InMemoryProbeStore();
    const sample = await probeAnchor('dns-fail.example', store, { fetchToml: throws });

    expect(sample.reachable).toBe(false);
    expect(sample.error).toContain('ENOTFOUND');
  });

  it('runProbe writes one sample per anchor', async () => {
    const store = new InMemoryProbeStore();
    const samples = await runProbe(['a.example', 'b.example'], store, { fetchToml: ok });

    expect(samples).toHaveLength(2);
    expect(store.samples()).toHaveLength(2);
    expect(store.samples('a.example')).toHaveLength(1);
  });

  it('scores a fully-down anchor below a fully-up one', async () => {
    const store = new InMemoryProbeStore();
    await probeAnchor('up.example', store, { fetchToml: ok });
    await probeAnchor('down.example', store, { fetchToml: down });

    expect(reachabilityScore('up.example', store)).toBe(1);
    expect(reachabilityScore('down.example', store)).toBe(0);
    expect(reachabilityScore('down.example', store)!).toBeLessThan(
      reachabilityScore('up.example', store)!
    );
  });

  it('a down probe lowers an anchor reachability score', async () => {
    const store = new InMemoryProbeStore();
    let healthy = true;
    const fetchToml = async (): Promise<TomlProbeResult> =>
      healthy ? { ok: true } : { ok: false, error: 'origin down' };

    // Three healthy probes -> perfect score.
    await probeAnchor('anchor.example', store, { fetchToml });
    await probeAnchor('anchor.example', store, { fetchToml });
    await probeAnchor('anchor.example', store, { fetchToml });
    const before = reachabilityScore('anchor.example', store)!;
    expect(before).toBe(1);

    // The anchor goes down: one failed probe drops the score.
    healthy = false;
    await probeAnchor('anchor.example', store, { fetchToml });
    const after = reachabilityScore('anchor.example', store)!;

    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(0.75, 5);
  });

  it('averages latency over reachable samples only', async () => {
    const store = new InMemoryProbeStore();
    // Two reachable probes at 120ms each via the stepping clock.
    const now = steppingClock(0, 120);
    await probeAnchor('a.example', store, { fetchToml: ok, now });
    await probeAnchor('a.example', store, { fetchToml: ok, now });
    // An unreachable probe must not pollute the latency average.
    await probeAnchor('a.example', store, { fetchToml: down, now });

    expect(averageLatencyMs('a.example', store)).toBe(120);
  });

  it('returns null reachability when an anchor has no samples', () => {
    const store = new InMemoryProbeStore();
    expect(reachabilityScore('unknown.example', store)).toBeNull();
    expect(averageLatencyMs('unknown.example', store)).toBeNull();
  });

  it('classifies DNS failures', () => {
    expect(classifyFailure('getaddrinfo ENOTFOUND example.com')).toBe('dns');
    expect(classifyFailure('ENOTINFO lookup failed')).toBe('dns');
    expect(classifyFailure('EAI_AGAIN temporary failure')).toBe('dns');
  });

  it('classifies TLS failures', () => {
    expect(classifyFailure('UNABLE_TO_VERIFY_LEAF_SIGNATURE')).toBe('tls');
    expect(classifyFailure('self signed certificate in chain')).toBe('tls');
    expect(classifyFailure('ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION')).toBe('tls');
  });

  it('classifies timeout failures', () => {
    expect(classifyFailure('The operation was aborted')).toBe('timeout');
    expect(classifyFailure('connect ETIMEDOUT 1.2.3.4:443')).toBe('timeout');
    expect(classifyFailure('request timeout after 5000ms')).toBe('timeout');
  });

  it('classifies HTTP failures', () => {
    expect(classifyFailure('HTTP 521 origin down')).toBe('http');
    expect(classifyFailure('request failed with status 500')).toBe('http');
  });

  it('classifies unknown failures', () => {
    expect(classifyFailure('something weird happened')).toBe('unknown');
  });

  it('records failureType on unreachable samples', async () => {
    const store = new InMemoryProbeStore();
    const dnsFail = async (): Promise<TomlProbeResult> => {
      throw new Error('getaddrinfo ENOTFOUND example.com');
    };
    const sample = await probeAnchor('dns-fail.example', store, { fetchToml: dnsFail });

    expect(sample.reachable).toBe(false);
    expect(sample.failureType).toBe('dns');
  });

  it('records null failureType on reachable samples', async () => {
    const store = new InMemoryProbeStore();
    const sample = await probeAnchor('up.example', store, { fetchToml: ok });

    expect(sample.reachable).toBe(true);
    expect(sample.failureType).toBeNull();
  });
});

function testAnchor(over: Partial<Anchor> = {}): Anchor {
  return {
    id: 'test-anchor',
    name: 'Test Anchor',
    homeDomain: 'anchor.example',
    corridors: ['usdc-ngn'],
    assetCode: 'USDC',
    assetIssuer: 'GISSUER',
    seps: ['sep10', 'sep38'],
    ...over,
  };
}

describe('quote-drift probe', () => {
  it('flags a fixture anchor quoting 10% off-median; others within threshold are not', () => {
    const quotes: AnchorQuote[] = [
      { anchorId: 'a', rate: 1500 },
      { anchorId: 'b', rate: 1500 },
      { anchorId: 'c', rate: 1500 },
      { anchorId: 'drifted', rate: 1650 }, // 10% above median
    ];

    const samples = detectQuoteDrift(quotes, 'usdc-ngn');
    const drifted = samples.find((s) => s.anchorId === 'drifted')!;
    const notDrifted = samples.filter((s) => s.anchorId !== 'drifted');

    expect(drifted.flagged).toBe(true);
    expect(drifted.deviationPercent).toBeCloseTo(10, 5);
    expect(drifted.medianRate).toBe(1500);
    for (const sample of notDrifted) {
      expect(sample.flagged).toBe(false);
      expect(sample.deviationPercent).toBeCloseTo(0, 5);
    }
  });

  it('does not flag a quote within the configured threshold', () => {
    const quotes: AnchorQuote[] = [
      { anchorId: 'a', rate: 1000 },
      { anchorId: 'b', rate: 1000 },
      { anchorId: 'close', rate: 1020 }, // 2% above median, default threshold is 3%
    ];

    const samples = detectQuoteDrift(quotes, 'usdc-ngn');
    const close = samples.find((s) => s.anchorId === 'close')!;

    expect(close.flagged).toBe(false);
    expect(close.deviationPercent).toBeCloseTo(2, 5);
  });

  it('honors a custom threshold', () => {
    const quotes: AnchorQuote[] = [
      { anchorId: 'a', rate: 100 },
      { anchorId: 'b', rate: 100 },
      { anchorId: 'c', rate: 104 }, // 4% above median
    ];

    expect(detectQuoteDrift(quotes, 'usdc-ngn', 5).find((s) => s.anchorId === 'c')!.flagged).toBe(
      false
    );
    expect(detectQuoteDrift(quotes, 'usdc-ngn', 3).find((s) => s.anchorId === 'c')!.flagged).toBe(
      true
    );
  });

  it('flags a quote below the median the same as one above it', () => {
    const quotes: AnchorQuote[] = [
      { anchorId: 'a', rate: 1000 },
      { anchorId: 'b', rate: 1000 },
      { anchorId: 'low', rate: 850 }, // 15% below median
    ];

    const low = detectQuoteDrift(quotes, 'usdc-ngn').find((s) => s.anchorId === 'low')!;
    expect(low.flagged).toBe(true);
    expect(low.deviationPercent).toBeCloseTo(-15, 5);
  });

  it('probeQuoteDrift fetches every anchor, records samples, and never excludes a flagged anchor', async () => {
    const store = new InMemoryDriftStore();
    const anchors = [
      testAnchor({ id: 'a' }),
      testAnchor({ id: 'b' }),
      testAnchor({ id: 'c' }),
      testAnchor({ id: 'drifted' }),
    ];
    const rates: Record<string, number> = { a: 1500, b: 1500, c: 1500, drifted: 1650 };
    const fetchRate = async (anchor: Anchor): Promise<RateProbeResult> => ({
      ok: true,
      rate: rates[anchor.id]!,
    });

    const samples = await probeQuoteDrift(anchors, 'usdc-ngn', '100', store, { fetchRate });

    expect(samples).toHaveLength(4);
    expect(store.samples()).toHaveLength(4);
    const drifted = samples.find((s) => s.anchorId === 'drifted')!;
    expect(drifted.flagged).toBe(true);
    // Flagging never removes the anchor from the recorded comparison set.
    expect(store.samples('drifted')).toHaveLength(1);
  });

  it('skips unreachable anchors from the median/comparison and does not record them', async () => {
    const store = new InMemoryDriftStore();
    const anchors = [testAnchor({ id: 'a' }), testAnchor({ id: 'down' }), testAnchor({ id: 'b' })];
    const fetchRate = async (anchor: Anchor): Promise<RateProbeResult> =>
      anchor.id === 'down' ? { ok: false, error: 'HTTP 521' } : { ok: true, rate: 1500 };

    const samples = await probeQuoteDrift(anchors, 'usdc-ngn', '100', store, { fetchRate });

    expect(samples).toHaveLength(2);
    expect(samples.find((s) => s.anchorId === 'down')).toBeUndefined();
  });

  it('returns an empty result set when no anchor produces a usable quote', async () => {
    const store = new InMemoryDriftStore();
    const anchors = [testAnchor({ id: 'a' })];
    const fetchRate = async (): Promise<RateProbeResult> => ({ ok: false, error: 'timeout' });

    const samples = await probeQuoteDrift(anchors, 'usdc-ngn', '100', store, { fetchRate });

    expect(samples).toHaveLength(0);
    expect(store.samples()).toHaveLength(0);
  });
});

const quoteOk = async (): Promise<QuoteProbeResult> => ({ ok: true });
const quoteDown = async (): Promise<QuoteProbeResult> => ({ ok: false, error: 'HTTP 503' });

describe('quote-latency probe', () => {
  it('records a reachable quote sample with measured latency and corridor', async () => {
    const store = new InMemoryProbeStore();
    const anchor = testAnchor();
    const sample = await probeQuoteLatency(anchor, 'usdc-ngn', store, {
      fetchQuote: quoteOk,
      now: steppingClock(1000, 80),
    });

    expect(sample.reachable).toBe(true);
    expect(sample.latencyMs).toBe(80);
    expect(sample.corridor).toBe('usdc-ngn');
    expect(sample.domain).toBe('anchor.example');
    expect(store.samples('anchor.example')).toHaveLength(1);
  });

  it('records an unreachable quote sample when the quote fetch fails', async () => {
    const store = new InMemoryProbeStore();
    const sample = await probeQuoteLatency(testAnchor(), 'usdc-ngn', store, {
      fetchQuote: quoteDown,
    });

    expect(sample.reachable).toBe(false);
    expect(sample.error).toBe('HTTP 503');
    expect(sample.failureType).toBe('http');
  });

  it('records unreachable (does not throw) when the quote fetcher throws', async () => {
    const store = new InMemoryProbeStore();
    const throwsQuote = async (): Promise<QuoteProbeResult> => {
      throw new Error('The operation was aborted');
    };
    const sample = await probeQuoteLatency(testAnchor(), 'usdc-ngn', store, {
      fetchQuote: throwsQuote,
    });

    expect(sample.reachable).toBe(false);
    expect(sample.failureType).toBe('timeout');
  });

  it('probeAllAnchorQuotes probes every anchor+corridor pair concurrently', async () => {
    const store = new InMemoryProbeStore();
    const anchors = [
      testAnchor({ id: 'a', homeDomain: 'a.example', corridors: ['usdc-ngn', 'usdc-kes'] }),
      testAnchor({ id: 'b', homeDomain: 'b.example', corridors: ['usdc-ars'] }),
    ];
    const samples = await probeAllAnchorQuotes(store, { fetchQuote: quoteOk }, anchors);

    expect(samples).toHaveLength(3);
    expect(store.samples('a.example')).toHaveLength(2);
    expect(store.samples('b.example')).toHaveLength(1);
  });

  it('computes p50/p95 latency over a rolling window for one anchor+corridor', async () => {
    const store = new InMemoryProbeStore();
    const anchor = testAnchor();
    const latencies = [100, 200, 300, 400, 500];
    for (const latency of latencies) {
      await probeQuoteLatency(anchor, 'usdc-ngn', store, {
        fetchQuote: quoteOk,
        now: steppingClock(0, latency),
      });
    }

    const stats = quoteLatencyPercentiles('anchor.example', 'usdc-ngn', store);
    expect(stats).not.toBeNull();
    expect(stats!.sampleCount).toBe(5);
    expect(stats!.p50Ms).toBe(300);
    expect(stats!.p95Ms).toBe(500);
  });

  it('excludes unreachable samples and other corridors from percentiles', async () => {
    const store = new InMemoryProbeStore();
    const anchor = testAnchor({ corridors: ['usdc-ngn', 'usdc-kes'] });
    await probeQuoteLatency(anchor, 'usdc-ngn', store, {
      fetchQuote: quoteOk,
      now: steppingClock(0, 100),
    });
    await probeQuoteLatency(anchor, 'usdc-ngn', store, {
      fetchQuote: quoteDown,
      now: steppingClock(0, 9000),
    });
    await probeQuoteLatency(anchor, 'usdc-kes', store, {
      fetchQuote: quoteOk,
      now: steppingClock(0, 5000),
    });

    const stats = quoteLatencyPercentiles('anchor.example', 'usdc-ngn', store);
    expect(stats!.sampleCount).toBe(1);
    expect(stats!.p50Ms).toBe(100);
  });

  it('honors a configurable rolling window size', async () => {
    const store = new InMemoryProbeStore();
    const anchor = testAnchor();
    for (const latency of [100, 100, 100, 900, 900]) {
      await probeQuoteLatency(anchor, 'usdc-ngn', store, {
        fetchQuote: quoteOk,
        now: steppingClock(0, latency),
      });
    }

    // Full history includes the three fast samples; a window of 2 keeps only
    // the most recent (slow) pair.
    const full = quoteLatencyPercentiles('anchor.example', 'usdc-ngn', store);
    const windowed = quoteLatencyPercentiles('anchor.example', 'usdc-ngn', store, 2);

    expect(full!.sampleCount).toBe(5);
    expect(windowed!.sampleCount).toBe(2);
    expect(windowed!.p50Ms).toBe(900);
  });

  it('returns null when an anchor+corridor has no reachable quote samples', () => {
    const store = new InMemoryProbeStore();
    expect(quoteLatencyPercentiles('unknown.example', 'usdc-ngn', store)).toBeNull();
  });
});
