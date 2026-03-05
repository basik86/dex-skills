#!/usr/bin/env npx tsx
/**
 * CLI wrapper for dex-skills — used by OpenClaw and other AI agents.
 * Usage:
 *   npx tsx cli.ts platforms
 *   npx tsx cli.ts launch --platform pumpfun --privateKey ... --name "Token" --symbol "TKN"
 *   npx tsx cli.ts get-token --platform pumpfun --tokenAddress "..."
 *   npx tsx cli.ts list-tokens --platform pumpfun --limit 20
 */

import { PumpFunSkill } from "../../src/platforms/pumpfun/index.js";
import { LetsBonkSkill } from "../../src/platforms/letsbonk/index.js";
import { MoonshotSkill } from "../../src/platforms/moonshot/index.js";
import { ZoraSkill } from "../../src/platforms/zora/index.js";
import { ClankerSkill } from "../../src/platforms/clanker/index.js";
import { FourMemeSkill } from "../../src/platforms/fourmeme/index.js";
import { SunPumpSkill } from "../../src/platforms/sunpump/index.js";
import type { Platform, PlatformSkill } from "../../src/shared/types.js";

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

function createSkill(platform: Platform, privateKey: string): PlatformSkill {
  switch (platform) {
    case "pumpfun":
      return new PumpFunSkill({ privateKey, rpcUrl: RPC.solana });
    case "letsbonk":
      return new LetsBonkSkill({ privateKey, rpcUrl: RPC.solana }, RPC.bitqueryApiKey);
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

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return parsed;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case "platforms": {
      const platforms = Object.entries(PLATFORM_CHAIN).map(([platform, chain]) => ({
        platform,
        chain,
      }));
      console.log(JSON.stringify(platforms, null, 2));
      break;
    }

    case "launch": {
      const platform = args.platform as Platform;
      const privateKey = args.privateKey;
      if (!platform || !privateKey) {
        console.error("Error: --platform and --privateKey are required");
        process.exit(1);
      }
      const skill = createSkill(platform, privateKey);
      const result = await skill.launch({
        name: args.name || "",
        symbol: args.symbol || "",
        description: args.description,
        imageUrl: args.imageUrl,
        initialBuyAmount: args.initialBuyAmount,
        links: {
          twitter: args.twitter,
          telegram: args.telegram,
          website: args.website,
          discord: args.discord,
          github: args.github,
        },
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "get-token": {
      const platform = args.platform as Platform;
      const tokenAddress = args.tokenAddress;
      if (!platform || !tokenAddress) {
        console.error("Error: --platform and --tokenAddress are required");
        process.exit(1);
      }
      const skill = createSkill(platform, "readonly");
      const info = await skill.getTokenInfo(tokenAddress);
      console.log(JSON.stringify(info, null, 2));
      break;
    }

    case "list-tokens": {
      const platform = args.platform as Platform;
      if (!platform) {
        console.error("Error: --platform is required");
        process.exit(1);
      }
      const skill = createSkill(platform, "readonly");
      const tokens = await skill.listTokens({
        limit: args.limit ? parseInt(args.limit) : 20,
        sortBy: (args.sortBy as any) || "createdAt",
        sortOrder: (args.sortOrder as any) || "desc",
      });
      console.log(JSON.stringify(tokens, null, 2));
      break;
    }

    default:
      console.error(
        "Usage: cli.ts <platforms|launch|get-token|list-tokens> [--option value ...]"
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
