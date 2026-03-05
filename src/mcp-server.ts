#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import type { Platform, PlatformSkill } from "./shared/types.js";
import { PumpFunSkill } from "./platforms/pumpfun/index.js";
import { LetsBonkSkill } from "./platforms/letsbonk/index.js";
import { MoonshotSkill } from "./platforms/moonshot/index.js";
import { ZoraSkill } from "./platforms/zora/index.js";
import { ClankerSkill } from "./platforms/clanker/index.js";
import { FourMemeSkill } from "./platforms/fourmeme/index.js";
import { SunPumpSkill } from "./platforms/sunpump/index.js";

const PLATFORMS: Platform[] = [
  "pumpfun",
  "letsbonk",
  "moonshot",
  "zora",
  "clanker",
  "fourmeme",
  "sunpump",
];

// RPC config from env (no private keys)
const RPC = {
  solana: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  base: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  bnb: process.env.BNB_RPC_URL || "https://bsc-dataseed1.binance.org",
  tronFullHost: process.env.TRON_FULL_HOST || "https://api.trongrid.io",
  tronApiKey: process.env.TRON_API_KEY,
  bitqueryApiKey: process.env.BITQUERY_API_KEY,
};

const PLATFORM_CHAIN: Record<Platform, string> = {
  pumpfun: "solana",
  letsbonk: "solana",
  moonshot: "solana",
  zora: "base",
  clanker: "base",
  fourmeme: "bnb",
  sunpump: "tron",
};

// Read-only skill instances (placeholder key, never used for signing)
function createReadOnlySkill(platform: Platform): PlatformSkill {
  const placeholder = "readonly";
  switch (platform) {
    case "pumpfun":
      return new PumpFunSkill({ privateKey: placeholder, rpcUrl: RPC.solana });
    case "letsbonk":
      return new LetsBonkSkill(
        { privateKey: placeholder, rpcUrl: RPC.solana },
        RPC.bitqueryApiKey
      );
    case "moonshot":
      return new MoonshotSkill({ privateKey: placeholder, rpcUrl: RPC.solana });
    case "zora":
      return new ZoraSkill({ privateKey: placeholder, rpcUrl: RPC.base });
    case "clanker":
      return new ClankerSkill({ privateKey: placeholder, rpcUrl: RPC.base });
    case "fourmeme":
      return new FourMemeSkill({ privateKey: placeholder, rpcUrl: RPC.bnb });
    case "sunpump":
      return new SunPumpSkill({
        privateKey: placeholder,
        fullHost: RPC.tronFullHost,
        apiKey: RPC.tronApiKey,
      });
  }
}

// Create skill with real private key for launch
function createSigningSkill(
  platform: Platform,
  privateKey: string
): PlatformSkill {
  switch (platform) {
    case "pumpfun":
      return new PumpFunSkill({ privateKey, rpcUrl: RPC.solana });
    case "letsbonk":
      return new LetsBonkSkill(
        { privateKey, rpcUrl: RPC.solana },
        RPC.bitqueryApiKey
      );
    case "moonshot":
      return new MoonshotSkill({ privateKey, rpcUrl: RPC.solana });
    case "zora":
      return new ZoraSkill({ privateKey, rpcUrl: RPC.base });
    case "clanker":
      return new ClankerSkill({ privateKey, rpcUrl: RPC.base });
    case "fourmeme":
      return new FourMemeSkill({ privateKey, rpcUrl: RPC.bnb });
    case "sunpump":
      return new SunPumpSkill({
        privateKey,
        fullHost: RPC.tronFullHost,
        apiKey: RPC.tronApiKey,
      });
  }
}

// Pre-create read-only instances
const readSkills = new Map<Platform, PlatformSkill>();
for (const p of PLATFORMS) {
  readSkills.set(p, createReadOnlySkill(p));
}

const server = new McpServer({
  name: "dex-skills",
  version: "0.1.0",
});

// Tool: list available platforms
server.tool(
  "dex_platforms",
  "List available DEX launchpad platforms with their chains",
  {},
  async () => {
    const list = PLATFORMS.map((p) => ({
      platform: p,
      chain: PLATFORM_CHAIN[p],
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
    };
  }
);

// Tool: launch a token (requires private key)
server.tool(
  "dex_launch",
  "Launch a new token on a DEX launchpad. Requires a private key for signing the transaction.",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Target platform"),
    privateKey: z
      .string()
      .describe(
        "Private key for signing (base58 for Solana, hex for EVM/TRON). Used once, not stored."
      ),
    name: z.string().describe("Token name"),
    symbol: z.string().describe("Token symbol/ticker"),
    description: z.string().optional().describe("Token description"),
    imageUrl: z.string().optional().describe("Token image URL"),
    bannerUrl: z
      .string()
      .optional()
      .describe("Token banner image URL (Moonshot only, max 5MB)"),
    initialBuyAmount: z
      .string()
      .optional()
      .describe("Initial buy amount in native currency"),
    twitter: z.string().optional().describe("Twitter/X URL"),
    telegram: z.string().optional().describe("Telegram URL"),
    website: z.string().optional().describe("Website URL"),
    discord: z.string().optional().describe("Discord URL"),
    github: z.string().optional().describe("GitHub URL"),
  },
  async (params) => {
    try {
      const skill = createSigningSkill(params.platform, params.privateKey);

      const result = await skill.launch({
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        imageUrl: params.imageUrl,
        bannerUrl: params.bannerUrl,
        initialBuyAmount: params.initialBuyAmount,
        links: {
          twitter: params.twitter,
          telegram: params.telegram,
          website: params.website,
          discord: params.discord,
          github: params.github,
        },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Launch failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get token info (read-only, no key needed)
server.tool(
  "dex_get_token",
  "Get information about a specific token on a DEX launchpad",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Platform to query"),
    tokenAddress: z.string().describe("Token contract address"),
  },
  async (params) => {
    try {
      const skill = readSkills.get(params.platform)!;
      const info = await skill.getTokenInfo(params.tokenAddress);
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get token info: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: list tokens (read-only, no key needed)
server.tool(
  "dex_list_tokens",
  "List recently launched tokens on a DEX launchpad platform",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Platform to query"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Number of tokens to return (default: 20)"),
    sortBy: z
      .enum(["marketCap", "createdAt", "volume", "price"])
      .optional()
      .default("createdAt")
      .describe("Sort field"),
    sortOrder: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc")
      .describe("Sort order"),
  },
  async (params) => {
    try {
      const skill = readSkills.get(params.platform)!;
      const tokens = await skill.listTokens({
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to list tokens: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: buy tokens (requires private key)
server.tool(
  "dex_buy",
  "Buy tokens on a DEX launchpad bonding curve or pool. Requires a private key.",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Target platform"),
    privateKey: z
      .string()
      .describe("Private key for signing. Used once, not stored."),
    tokenAddress: z.string().describe("Token contract address to buy"),
    amount: z
      .string()
      .describe("Amount in native currency (SOL/ETH/BNB/TRX)"),
    slippage: z
      .number()
      .optional()
      .describe("Slippage tolerance in percent (default: 10)"),
  },
  async (params) => {
    try {
      const skill = createSigningSkill(params.platform, params.privateKey);
      if (!skill.buy) {
        return {
          content: [
            { type: "text", text: `Buy not supported on ${params.platform}` },
          ],
          isError: true,
        };
      }
      const result = await skill.buy({
        tokenAddress: params.tokenAddress,
        amount: params.amount,
        slippage: params.slippage,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Buy failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: sell tokens (requires private key)
server.tool(
  "dex_sell",
  "Sell tokens on a DEX launchpad bonding curve or pool. Requires a private key.",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Target platform"),
    privateKey: z
      .string()
      .describe("Private key for signing. Used once, not stored."),
    tokenAddress: z.string().describe("Token contract address to sell"),
    amount: z
      .string()
      .describe("Token amount to sell (raw amount or '100%' for all)"),
    slippage: z
      .number()
      .optional()
      .describe("Slippage tolerance in percent (default: 10)"),
  },
  async (params) => {
    try {
      const skill = createSigningSkill(params.platform, params.privateKey);
      if (!skill.sell) {
        return {
          content: [
            { type: "text", text: `Sell not supported on ${params.platform}` },
          ],
          isError: true,
        };
      }
      const result = await skill.sell({
        tokenAddress: params.tokenAddress,
        amount: params.amount,
        slippage: params.slippage,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Sell failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get trending tokens (read-only)
server.tool(
  "dex_trending",
  "Get trending/top tokens on a DEX launchpad platform",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Platform to query"),
    category: z
      .enum(["gainers", "volume", "new", "graduated"])
      .optional()
      .describe("Trending category (default varies by platform)"),
    limit: z.number().optional().describe("Number of tokens (default: 20)"),
  },
  async (params) => {
    try {
      const skill = readSkills.get(params.platform)!;
      if (!skill.getTrending) {
        return {
          content: [
            {
              type: "text",
              text: `Trending not available on ${params.platform}`,
            },
          ],
          isError: true,
        };
      }
      const tokens = await skill.getTrending({
        category: params.category,
        limit: params.limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get trade history (read-only)
server.tool(
  "dex_trade_history",
  "Get recent trade history for a token",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Platform to query"),
    tokenAddress: z.string().describe("Token contract address"),
    limit: z.number().optional().describe("Number of trades (default: 50)"),
  },
  async (params) => {
    try {
      const skill = readSkills.get(params.platform)!;
      if (!skill.getTradeHistory) {
        return {
          content: [
            {
              type: "text",
              text: `Trade history not available on ${params.platform}`,
            },
          ],
          isError: true,
        };
      }
      const trades = await skill.getTradeHistory(params.tokenAddress, {
        limit: params.limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(trades, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get token holders (read-only)
server.tool(
  "dex_holders",
  "Get holder list for a token (currently Zora only)",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Platform to query"),
    tokenAddress: z.string().describe("Token contract address"),
    limit: z.number().optional().describe("Number of holders (default: 50)"),
  },
  async (params) => {
    try {
      const skill = readSkills.get(params.platform)!;
      if (!skill.getHolders) {
        return {
          content: [
            {
              type: "text",
              text: `Holders not available on ${params.platform}`,
            },
          ],
          isError: true,
        };
      }
      const holders = await skill.getHolders(params.tokenAddress, {
        limit: params.limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(holders, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: estimate price (read-only)
server.tool(
  "dex_estimate_price",
  "Get a price estimate before buying or selling (currently Four.meme only)",
  {
    platform: z
      .enum(PLATFORMS as [Platform, ...Platform[]])
      .describe("Platform to query"),
    tokenAddress: z.string().describe("Token contract address"),
    action: z.enum(["buy", "sell"]).describe("Trade direction"),
    amount: z
      .string()
      .describe("Amount (native currency for buy, token amount for sell)"),
  },
  async (params) => {
    try {
      const skill = readSkills.get(params.platform)!;
      if (!skill.estimatePrice) {
        return {
          content: [
            {
              type: "text",
              text: `Price estimation not available on ${params.platform}`,
            },
          ],
          isError: true,
        };
      }
      const quote = await skill.estimatePrice({
        tokenAddress: params.tokenAddress,
        action: params.action,
        amount: params.amount,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(quote, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dex-skills MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
