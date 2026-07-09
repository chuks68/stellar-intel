# Maintainer Notes

## TODO — Wave uplift (deadline: next wave entry ≈ 2026-07-23)

### Uplift plan

- [ ] **1. Deploy reputation contract — mainnet.** Run the existing
      `scripts/deploy-oracle-mainnet.ts` script, record the contract ID in the
      repo, and wire `submitToOracle` (`packages/publisher/src/batch.ts`) for
      real: build the Soroban invoke tx, sign with the publisher key, submit.
      The publisher tick must publish real outcomes on-chain BEFORE entry.
      This is the categorical D3 move (6 → 8-9).
- [ ] **2. App reads scores from chain.** Reconcile/verify the leaderboard
      against contract state and surface on-chain tx hashes in the UI. Closes
      the oracle loop in both directions — no mock-adjacent gap.
- [ ] **3. Publish `@stellarintel/mcp` + `@stellarintel/publisher` to npm**
      with a runnable example wired to the REAL contract ID; make
      `examples/consumer-contract` invoke the deployed oracle. "Primitive
      others depend on" = only observed path to S.

### Fix order before publish

- [ ] **1. Wire real tools into `packages/mcp/src/server.ts`** from
      `lib/mcp/offramp.ts` — with LIVE rates, not routing-table constants.
- [x] **2. Wire `submitToOracle` to the deployed contract** (blocks on
      contract deploy — item 1 of the uplift plan). Add `pg` +
      `@stellar/stellar-sdk` to `packages/publisher` dependencies.
      Done against the testnet deployment
      (`CCZ54NTEOVL2DKWCGJA5XHTHOGRDS7JHFKYWEC6QH2IMZLYNM3FBFKDG`); mainnet
      wiring still pending item 1 of the uplift plan.
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
