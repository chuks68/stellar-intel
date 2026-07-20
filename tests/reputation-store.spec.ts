import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createReputationStore, type ReputationStore } from '@/lib/reputation/store';
import type { SqlExecutor } from '@/lib/reputation/postgres';
import { OutcomeLogRowSchema, toOutcomeLogRow } from '@/lib/reputation/schema';
import type { OutcomeLogRow, ProbeLedgerRow } from '@/types/reputation';

// A pg-compatible executor backed by in-memory SQLite, so the Postgres adapter's
// real SQL ($1 params, ON CONFLICT upsert) is genuinely exercised in tests.
class SqliteBackedPgExecutor implements SqlExecutor {
  private readonly db = new Database(':memory:');
  async query(text: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    // Postgres $n params are positional-by-number and can appear out of textual
    // order, so map them to better-sqlite3 named params (@pN) for a faithful run.
    // Multi-statement DDL (CREATE TABLE / INDEX blocks) must use exec(), not prepare().
    const stmts = text.split(';').map((s) => s.trim()).filter(Boolean);
    if (stmts.length > 1) {
      this.db.exec(text);
      return { rows: [] };
    }
    const stmt = this.db.prepare(text.replace(/\$(\d+)/g, (_m, n) => `@p${n}`));
    const bind: Record<string, unknown> = {};
    params.forEach((v, i) => {
      bind[`p${i + 1}`] = (typeof v === 'boolean' ? (v ? 1 : 0) : v) as never;
    });
    const args = params.length ? [bind] : [];
    if (/^\s*(select|delete.*returning)/i.test(text.trim())) {
      return { rows: stmt.all(...(args as never[])) as Record<string, unknown>[] };
    }
    stmt.run(...(args as never[]));
    return { rows: [] };
  }
}

function row(over: Partial<OutcomeLogRow> = {}): OutcomeLogRow {
  return toOutcomeLogRow(
    {
      intentHash: `h-${Math.random().toString(16).slice(2)}`,
      anchorId: 'cowrie',
      corridor: 'USDC-NGN',
      quotedRate: '1500.0',
      quotedAmount: '100',
      outcome: 'completed',
      stellarTransactionId: 'stellar-tx-1',
      ...over,
    },
    new Date('2026-06-04T12:00:00.000Z')
  );
}

const backends: Array<[string, () => ReputationStore]> = [
  ['memory', () => createReputationStore({ backend: 'memory' })],
  ['sqlite', () => createReputationStore({ backend: 'sqlite' })],
  [
    'postgres',
    () => createReputationStore({ backend: 'postgres', executor: new SqliteBackedPgExecutor() }),
  ],
];

describe.each(backends)('ReputationStore conformance — %s backend', (_name, make) => {
  let store: ReputationStore;
  afterEach(async () => {
    await store?.close();
  });

  it('appends and queries by anchor', async () => {
    store = make();
    await store.append(row({ intentHash: 'a', anchorId: 'cowrie' }));
    await store.append(row({ intentHash: 'b', anchorId: 'moneygram' }));

    const cowrie = await store.query({ anchorId: 'cowrie' });
    expect(cowrie).toHaveLength(1);
    expect(cowrie[0]?.intentHash).toBe('a');
  });

  it('is idempotent on intentHash', async () => {
    store = make();
    await store.append(row({ intentHash: 'dup', outcome: 'completed' }));
    await store.append(row({ intentHash: 'dup', outcome: 'refunded' }));
    const all = await store.query({});
    expect(all).toHaveLength(1);
    expect(all[0]?.outcome).toBe('refunded');
  });

  it('backfills delivery and drops the row from the pending-reconciliation set', async () => {
    store = make();
    await store.append(
      row({ intentHash: 'r', deliveredAmount: null, stellarTransactionId: 'tx-r' })
    );

    expect(await store.query({ pendingReconciliationOnly: true })).toHaveLength(1);

    await store.markDelivered('r', {
      deliveredAmount: '149000',
      deliveredRate: '1490.0',
      reconciledAt: '2026-06-04T12:05:00.000Z',
    });

    expect(await store.query({ pendingReconciliationOnly: true })).toHaveLength(0);
    const [updated] = await store.query({ anchorId: 'cowrie' });
    expect(updated?.deliveredAmount).toBe('149000');
    expect(updated?.reconciledAt).toBe('2026-06-04T12:05:00.000Z');
  });
});

describe('OutcomeLogRowSchema (#218)', () => {
  it('accepts a well-formed row', () => {
    expect(() => OutcomeLogRowSchema.parse(row())).not.toThrow();
  });

  it('rejects an unknown outcome and a non-decimal rate', () => {
    expect(OutcomeLogRowSchema.safeParse(row({ outcome: 'bogus' as never })).success).toBe(false);
    expect(OutcomeLogRowSchema.safeParse(row({ quotedRate: 'NaN' })).success).toBe(false);
  });
});

function probeRow(over: Partial<ProbeLedgerRow> = {}): ProbeLedgerRow {
  return {
    domain: 'stellar.moneygram.com',
    reachable: true,
    latencyMs: 120,
    failureType: null,
    error: null,
    probedAt: '2026-07-20T10:00:00.000Z',
    ...over,
  };
}

describe.each(backends)('Probe ledger — %s backend', (_name, make) => {
  let store: ReputationStore;
  afterEach(async () => {
    await store?.close();
  });

  it('records and queries probe samples by domain', async () => {
    store = make();
    await store.recordProbeSample(probeRow({ domain: 'a.example', reachable: true }));
    await store.recordProbeSample(
      probeRow({ domain: 'b.example', reachable: false, latencyMs: 0 })
    );

    const all = await store.queryProbeSamples();
    expect(all).toHaveLength(2);

    const aOnly = await store.queryProbeSamples('a.example');
    expect(aOnly).toHaveLength(1);
    expect(aOnly[0]?.reachable).toBe(true);
  });

  it('returns probe samples sorted oldest first', async () => {
    store = make();
    await store.recordProbeSample(
      probeRow({ domain: 'x.example', probedAt: '2026-07-20T12:00:00.000Z' })
    );
    await store.recordProbeSample(
      probeRow({ domain: 'x.example', probedAt: '2026-07-20T10:00:00.000Z' })
    );

    const samples = await store.queryProbeSamples('x.example');
    expect(samples[0]?.probedAt).toBe('2026-07-20T10:00:00.000Z');
    expect(samples[1]?.probedAt).toBe('2026-07-20T12:00:00.000Z');
  });

  it('stores failure type and error metadata', async () => {
    store = make();
    await store.recordProbeSample(
      probeRow({
        domain: 'down.example',
        reachable: false,
        failureType: 'dns',
        error: 'ENOTFOUND',
        latencyMs: 0,
      })
    );

    const samples = await store.queryProbeSamples('down.example');
    expect(samples[0]?.failureType).toBe('dns');
    expect(samples[0]?.error).toBe('ENOTFOUND');
    expect(samples[0]?.reachable).toBe(false);
  });
});
