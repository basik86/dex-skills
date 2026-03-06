# dex-skills

[![npm](https://img.shields.io/npm/v/dex-skills?color=cb3837&logo=npm)](https://www.npmjs.com/package/dex-skills)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-✓-9945ff?logo=solana&logoColor=white)](https://solana.com)
[![Base](https://img.shields.io/badge/Base-✓-0052ff?logo=coinbase&logoColor=white)](https://base.org)
[![BNB](https://img.shields.io/badge/BNB-✓-f0b90b?logo=binance&logoColor=white)](https://www.bnbchain.org)
[![TRON](https://img.shields.io/badge/TRON-✓-ff0013?logo=tron&logoColor=white)](https://tron.network)
[![website](https://img.shields.io/badge/docs-dex--skills.xyz-black)](https://dex-skills.xyz)
[![X](https://img.shields.io/badge/@Dexskills__-black?logo=x&logoColor=white)](https://x.com/Dexskills_)

Token launch and query SDK for 7 DEX launchpad platforms across Solana, Base, BNB Chain, and TRON.

`ca: 8UmPP5hLCLBrgZnznMGefXJSJCjYzbX1eDzpnZ9Cpump`

| Platform | Chain | Launch | Token Info | List Tokens |
|----------|-------|--------|------------|-------------|
| Pump.fun | Solana | Yes | Yes | Yes |
| LetsBonk | Solana | Yes | Yes | Yes |
| Moonshot | Solana | Yes | Yes | Yes |
| Zora | Base | Yes | Yes | Yes |
| Clanker | Base | Yes | Yes | Yes |
| Four.meme | BNB | Yes | Yes | Yes |
| SunPump | TRON | Yes | Yes | Yes |

## Install

```bash
npm install dex-skills
```

## Quick Start

```typescript
import { createSkills, getSkill } from "dex-skills";

const skills = createSkills({
  wallets: {
    solana: {
      privateKey: "base58_private_key",
      rpcUrl: "https://api.mainnet-beta.solana.com",
    },
  },
});

// Launch a token on Pump.fun
const result = await getSkill(skills, "pumpfun").launch({
  name: "My Token",
  symbol: "MTK",
  description: "A token",
  links: { twitter: "https://x.com/mytoken" },
});

console.log(result.tokenAddress);
console.log(result.txHash);

// Query token info (no private key needed for reads)
const info = await getSkill(skills, "pumpfun").getTokenInfo("TokenMintAddress...");
console.log(info.price, info.marketCap, info.bondingCurveProgress);

// List recent tokens
const tokens = await getSkill(skills, "pumpfun").listTokens({
  limit: 10,
  sortBy: "createdAt",
});
```

## Wallet Configuration

Each chain requires its own wallet config. Only configure chains you need.

```typescript
const skills = createSkills({
  wallets: {
    solana: { privateKey: "...", rpcUrl: "https://api.mainnet-beta.solana.com" },
    base: { privateKey: "0x...", rpcUrl: "https://mainnet.base.org" },
    bnb: { privateKey: "0x...", rpcUrl: "https://bsc-dataseed1.binance.org" },
    tron: { privateKey: "...", fullHost: "https://api.trongrid.io", apiKey: "..." },
  },
  bitqueryApiKey: "...", // optional, used for LetsBonk queries
});
```

Platform-to-chain mapping:

- **Solana**: Pump.fun, LetsBonk, Moonshot
- **Base**: Zora, Clanker
- **BNB**: Four.meme
- **TRON**: SunPump

## Launch Parameters

```typescript
await skill.launch({
  name: "Token Name",           // required
  symbol: "TKN",                // required
  description: "...",           // optional
  imageUrl: "https://...",      // optional
  bannerUrl: "https://...",     // optional, Moonshot only
  initialBuyAmount: "0.1",      // optional, in native currency (SOL/ETH/BNB/TRX)
  links: {                      // optional
    twitter: "https://x.com/...",
    telegram: "https://t.me/...",
    website: "https://...",
    discord: "https://...",
    github: "https://...",
  },
});
```

Social link support varies by platform. All platforms accept `twitter`, `telegram`, and `website`. Moonshot and Clanker also accept `discord`. Zora accepts all fields via metadata URI.

## Integration Formats

dex-skills ships in multiple formats for different integration targets.

### MCP Server (Claude Code, Cursor)

Run the MCP server for tool-use with AI coding assistants:

```bash
# Development
npx tsx src/mcp-server.ts

# Production (after build)
node dist/mcp-server.js
```

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "dex-skills": {
      "command": "npx",
      "args": ["tsx", "path/to/dex-skills/src/mcp-server.ts"]
    }
  }
}
```

Exposes 10 tools: `dex_platforms`, `dex_launch`, `dex_get_token`, `dex_list_tokens`, `dex_buy`, `dex_sell`, `dex_trending`, `dex_trade_history`, `dex_holders`, `dex_estimate_price`.

RPC endpoints are read from environment variables. Private keys are passed per-request to `dex_launch` and never stored.

### OpenClaw Skill

Copy the `openclaw/` directory to your OpenClaw skills folder:

```bash
cp -r openclaw/ ~/.openclaw/skills/dex-skills/
```

Or install dependencies in the skill directory:

```bash
cd ~/.openclaw/skills/dex-skills && npm install
```

The skill registers as `/dex-skills` and responds to token launch, query, and listing requests.

### Function Calling (OpenAI / Anthropic API)

Import tool definitions directly for use with `tool_use` or `function_calling`:

```typescript
import { toolDefinitions } from "dex-skills";

// Anthropic
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  tools: toolDefinitions,
  messages: [{ role: "user", content: "Launch a token on pump.fun called Test" }],
});

// OpenAI (convert input_schema to parameters)
const tools = toolDefinitions.map(t => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));
```

### OpenAPI Spec

An OpenAPI 3.1 spec is available for building REST API wrappers:

```typescript
import { openApiSpec } from "dex-skills";
// or load directly: dist/openapi.json
```

## Environment Variables

For MCP server and OpenClaw skill usage. All optional with defaults.

| Variable | Default | Used By |
|----------|---------|---------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Pump.fun, LetsBonk, Moonshot |
| `BASE_RPC_URL` | `https://mainnet.base.org` | Zora, Clanker |
| `BNB_RPC_URL` | `https://bsc-dataseed1.binance.org` | Four.meme |
| `TRON_FULL_HOST` | `https://api.trongrid.io` | SunPump |
| `TRON_API_KEY` | - | SunPump |
| `BITQUERY_API_KEY` | - | LetsBonk |

## Return Types

### LaunchResult

```typescript
{
  platform: "pumpfun";
  chain: "solana";
  tokenAddress: string;
  txHash: string;
  tokenName: string;
  tokenSymbol: string;
  creatorAddress: string;
  timestamp: number;
}
```

### TokenInfo

```typescript
{
  platform: "pumpfun";
  chain: "solana";
  tokenAddress: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  creatorAddress: string;
  marketCap?: number;
  price?: number;
  priceUsd?: number;
  totalSupply?: string;
  holderCount?: number;
  bondingCurveProgress?: number;  // 0-100
  isGraduated?: boolean;
  liquidityUsd?: number;
  volume24h?: number;
  createdAt?: number;
}
```

## Build

```bash
npm run build    # compile TypeScript to dist/
```

## License

MIT
