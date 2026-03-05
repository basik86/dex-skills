---
name: dex-skills
description: Launch tokens, query token info, and list recently launched tokens on 7 DEX launchpad platforms (Pump.fun, LetsBonk, Moonshot, Zora, Clanker, Four.meme, SunPump)
homepage: https://github.com/YOUR_USERNAME/dex-skills
license: MIT
user-invocable: true
metadata: {"openclaw":{"emoji":"🚀","requires":{"bins":["node","npm"],"env":[]},"install":[{"kind":"node","package":".","label":"Install dex-skills dependencies","bins":["node","npm"]}]}}
---

# dex-skills — Multi-Chain DEX Launchpad Skills

Launch tokens, query token info, and list recently launched tokens across 7 platforms and 4 chains.

## Supported Platforms

| Platform | Chain | Launch | Query | List |
|----------|-------|--------|-------|------|
| Pump.fun | Solana | Yes | Yes | Yes |
| LetsBonk | Solana | Yes | Yes | Yes |
| Moonshot | Solana | Yes | Yes | Yes |
| Zora | Base | Yes | Yes | Yes |
| Clanker | Base | Yes | Yes | Yes |
| Four.meme | BNB | Yes | Yes | Yes |
| SunPump | TRON | Yes | Yes | Yes |

## When to Activate

Activate this skill when the user:
- Wants to launch/create/deploy a token on a DEX launchpad
- Asks about a specific token's info (price, market cap, bonding curve progress)
- Wants to see recently launched tokens on any supported platform
- Mentions Pump.fun, LetsBonk, Moonshot, Zora, Clanker, Four.meme, or SunPump
- Asks to create a memecoin or launch a coin

## Environment Variables

Set these in your environment for RPC access (all optional, defaults provided):

- `SOLANA_RPC_URL` — Solana RPC (default: `https://api.mainnet-beta.solana.com`)
- `BASE_RPC_URL` — Base RPC (default: `https://mainnet.base.org`)
- `BNB_RPC_URL` — BNB Chain RPC (default: `https://bsc-dataseed1.binance.org`)
- `TRON_FULL_HOST` — TRON full node (default: `https://api.trongrid.io`)
- `TRON_API_KEY` — TronGrid API key
- `BITQUERY_API_KEY` — Bitquery API key (for LetsBonk queries)

## Core Capabilities

### 1. List Available Platforms

```bash
npx tsx {baseDir}/scripts/cli.ts platforms
```

Returns JSON array of all supported platforms with their chains.

### 2. Launch a Token

**IMPORTANT: Always ask the user for their private key before launching. Never store it.**

```bash
npx tsx {baseDir}/scripts/cli.ts launch \
  --platform "pumpfun" \
  --privateKey "user_provided_key" \
  --name "Token Name" \
  --symbol "SYMBOL" \
  --description "Token description" \
  --imageUrl "https://example.com/image.png" \
  --initialBuyAmount "0.01" \
  --twitter "https://x.com/token" \
  --telegram "https://t.me/token" \
  --website "https://token.com"
```

**Platform options:** `pumpfun`, `letsbonk`, `moonshot`, `zora`, `clanker`, `fourmeme`, `sunpump`

**Private key format:**
- Solana platforms (pumpfun, letsbonk, moonshot): base58 encoded
- EVM platforms (zora, clanker, fourmeme): hex with 0x prefix
- TRON (sunpump): hex private key

Returns JSON with `tokenAddress`, `txHash`, `creatorAddress`, and more.

### 3. Get Token Info

```bash
npx tsx {baseDir}/scripts/cli.ts get-token \
  --platform "pumpfun" \
  --tokenAddress "TokenMintAddress123"
```

Returns JSON with name, symbol, price, marketCap, bondingCurveProgress, isGraduated, etc.

### 4. List Recently Launched Tokens

```bash
npx tsx {baseDir}/scripts/cli.ts list-tokens \
  --platform "pumpfun" \
  --limit 20 \
  --sortBy "createdAt" \
  --sortOrder "desc"
```

**sortBy options:** `marketCap`, `createdAt`, `volume`, `price`

Returns JSON array of token info objects.

## Error Handling

- If a launch fails, show the error message to the user and suggest checking their private key and balance
- If token info query fails, the token may not exist or the platform API may be down
- For Solana platforms, ensure the RPC URL is accessible and not rate-limited
- For EVM platforms, ensure sufficient gas balance

## Security Notes

- Private keys are passed as CLI arguments and used once for signing — they are never stored
- Read-only operations (get-token, list-tokens) do not require any private key
- All RPC calls go directly to the configured endpoints, no intermediary servers
