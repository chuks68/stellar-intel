# @stellarintel/mcp

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server for
[Stellar Intel](https://github.com/ezedike-evan/stellar-intel), built on
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
and served over stdio.

## Status

This package is a scaffold: `createServer()` (`src/server.ts`) stands up the
MCP `Server` and wires the transport, but does not register any tools yet —
`ListToolsRequestSchema` currently returns an empty list. Wiring the real
off-ramp routing tools (backed by the same logic as
[`lib/mcp/offramp.ts`](https://github.com/ezedike-evan/stellar-intel/blob/main/lib/mcp/offramp.ts)
in the main app) is tracked in the repo's `maintainer.md` and not yet done —
don't depend on any tool being available from this package until that lands.

A separate, already-wired stdio MCP server lives at
[`scripts/mcp/server.ts`](https://github.com/ezedike-evan/stellar-intel/blob/main/scripts/mcp)
in the main app (see
[`docs/MCP.md`](https://github.com/ezedike-evan/stellar-intel/blob/main/docs/MCP.md));
this package is the standalone, publishable version of that server and will
converge with it.

## Install

```bash
npm install @stellarintel/mcp
```

## Usage

```bash
npm run build   # tsc -> dist/
npm start       # node dist/index.js, stdio transport
npm run dev     # same, via ts-node, no build step
```

Point any MCP-capable client (Claude Desktop, an agent framework, etc.) at
the built `dist/index.js` as a stdio command.

## Related

- [`@stellarintel/publisher`](https://www.npmjs.com/package/@stellarintel/publisher) — off-chain publisher for the reputation oracle this server will eventually expose.
