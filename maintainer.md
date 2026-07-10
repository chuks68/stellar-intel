# Maintainer Notes

## TODO — Wave uplift (deadline: next wave entry ≈ 2026-07-23)

### Uplift plan

- [ ] **1. Deploy reputation contract — mainnet.** Run the existing
      `scripts/deploy-oracle-mainnet.ts` script, record the contract ID in the
      repo, and wire `submitToOracle` (`packages/publisher/src/batch.ts`) for
      real: build the Soroban invoke tx, sign with the publisher key, submit.
      The publisher tick must publish real outcomes on-chain BEFORE entry.
      This is the categorical D3 move (6 → 8-9).
      Deliberately deferred — deployment stays testnet-only for now.
      Everything downstream of it (publisher tick, on-chain reads,
      leaderboard reconciliation) is wired and verified end-to-end against
      the existing testnet contract instead; only the mainnet deploy +
      contract-id swap is outstanding.
- [x] **2. App reads scores from chain.** Reconcile/verify the leaderboard
      against contract state and surface on-chain tx hashes in the UI. Closes
      the oracle loop in both directions — no mock-adjacent gap.
      Done against testnet. New `lib/oracle/read.ts` is a read-only Soroban
      client (`get_score_for_corridor`, `get_corridor_aggregate`,
      `list_anchors` — pure `simulateTransaction`, no signing/funds needed;
      verified against the live deployed contract). `/api/reputation/leaderboard`
      no longer returns hardcoded `STUB_METRICS` — it computes real scorecards
      from `outcome_log` and, when a corridor filter is given, attaches a live
      on-chain score per anchor for reconciliation. `app/anchors/[id]/page.tsx`
      was actually surfacing the wrong tx hash (the off-chain settlement
      payment, not an oracle submission) — fixed to source the real
      `oracle_tx_hash` written by the publisher (see fix-order item 2 below).
- [ ] **3. Publish `@stellarintel/mcp` + `@stellarintel/publisher` to npm**
      with a runnable example wired to the REAL contract ID; make
      `examples/consumer-contract` invoke the deployed oracle. "Primitive
      others depend on" = only observed path to S.
      Both packages build + `npm pack --dry-run` clean; `packages/mcp` now
      actually registers its two tools for real (see fix-order item 1) instead
      of shipping an empty server. `examples/consumer-contract` has a runnable
      `read-oracle.mjs` verified live against the real testnet contract, plus a
      README covering both that and the full Rust deploy/invoke path. Did not
      run the actual `npm publish` — needs the maintainer's npm login/2FA and
      is hard to fully reverse once published.

### Fix order before publish

- [x] **1. Wire real tools into `packages/mcp/src/server.ts`** from
      `lib/mcp/offramp.ts` — with LIVE rates, not routing-table constants.
      `intel.offramp.quote`/`intel.offramp.prepare` are now registered for
      real (was an empty tool list), sourcing `lib/mcp/offramp.ts` directly
      via a `tsc-alias`-rewritten build so the published `dist/` stays
      self-contained outside this monorepo. `getQuote` no longer computes
      `netReceived` off the static `ANCHOR_ROUTING` rate — it calls
      `fetchCorridorRates` for the routed anchor's actual current price
      (SEP-38 firm quote, falling back to SEP-24/SEP-6 fee-adjusted live FX)
      and throws `RATE_UNAVAILABLE` when that anchor can't currently be
      quoted, rather than returning a stale number. Needed two small Node16
      compat fixes along the way in `lib/stellar/sep1.ts` and
      `lib/stellar/anchors.ts`, and fixed the `bin` field noted in item 4
      below.
- [x] **2. Wire `submitToOracle` to the deployed contract** (blocks on
      contract deploy — item 1 of the uplift plan). Add `pg` +
      `@stellar/stellar-sdk` to `packages/publisher` dependencies.
      Done against the testnet deployment
      (`CCZ54NTEOVL2DKWCGJA5XHTHOGRDS7JHFKYWEC6QH2IMZLYNM3FBFKDG`); mainnet
      wiring still pending item 1 of the uplift plan.
      Found and fixed a real bug on top of this: `fetchPendingOutcomes`/
      `markPublished` in `batch.ts` queried a table called
      `reputation_outcomes`, which the app never creates — its real table is
      `outcome_log`. `packages/publisher`'s own e2e test seeds through the
      app's real store, so this would have failed the moment it ran against
      an actual database. Renamed to `outcome_log` and added the
      `published_at`/`oracle_tx_hash` columns it needs (migration
      `lib/reputation/migrations/005_oracle_publish.sql`). Also made
      `packages/publisher`'s `index.ts` safe to `import` (it previously ran
      its CLI `main()`, including `process.exit(1)`, unconditionally at
      module load) and wired `/api/publisher/tick` — previously a hardcoded
      no-op stub — to actually call `runBatch` against the testnet oracle.
- [x] **3. Fix both package tsconfigs** (`module: "Node16"`, exclude `tests`
      from build), verify `npm run build` emits `dist/`, and check
      `npm pack --dry-run` shows the expected files.
      Both packages now build and pack clean. Along the way: fixed a
      pre-existing `@types/node` auto-discovery gap (TS 6 stopped
      finding it in this workspace layout — added explicit `"types":
      ["node"]`), and worked around `@stellar/stellar-sdk` shipping
      ESM-only types against `publisher`'s CommonJS build via a
      dynamic `import()` in `batch.ts`. Also added a local
      `vitest.config.mts` for `packages/publisher` (it was silently
      inheriting the root app's config, pointed at a setup file that
      doesn't exist there) and gitignored `packages/*/dist`.
- [x] **4. Add README + LICENSE + `repository` +
      `"publishConfig": {"access": "public"}`** to each package.
      Also added `"license": "MIT"` to each `package.json` (implied by
      shipping a LICENSE file — avoids the npm-publish "no license
      field" warning) and refreshed `docs/ORACLE_SPEC.md` to point at
      the real testnet contract instead of describing it generically.
      Noted but did not fix: `packages/mcp/package.json`'s `bin` key
      is the full scoped name (`"@stellarintel/mcp"`), which contains
      `/` — likely invalid as an npm bin command name; worth checking
      before publish.
      Fixed (see fix-order item 1): `bin` is now the bare `dist/...` path
      string, letting npm derive the unscoped command name.

## 11. Anchor Fleet Status

- [x] Monthly recheck complete for the latest survey snapshot.

Latest documented snapshot: 92 directory-tagged domains -> 32 reachable
`stellar.toml` files -> 9 transfer-capable / 23 issuer-only; 60 unreachable or
unconfirmed.

The 23 issuer-only domains (advertise an asset/issuer but no SEP-6/SEP-24
transfer rails, so they back no corridor) are enumerated with reasons in
[`docs/anchors/exclusions.md`](docs/anchors/exclusions.md).

Source: `scripts/anchor-survey.snapshot.json`, generated
2026-06-25T23:08:26.806Z from
`https://api.stellar.expert/explorer/public/directory?tag[]=anchor&limit=200`.

Refresh cadence: re-run `node scripts/anchor-survey.mjs --json` monthly, update
these counts, and keep the recheck checkbox aligned with the current snapshot.
