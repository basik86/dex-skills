export type {
  Platform,
  Chain,
  LaunchParams,
  LaunchResult,
  TokenInfo,
  ListTokensParams,
  TradeParams,
  TradeResult,
  PriceQuoteParams,
  PriceQuote,
  TradeHistoryItem,
  HolderInfo,
  TrendingParams,
  PlatformSkill,
  WalletConfig,
} from "./shared/types.js";

export { PumpFunSkill } from "./platforms/pumpfun/index.js";
export { ZoraSkill } from "./platforms/zora/index.js";
export { ClankerSkill } from "./platforms/clanker/index.js";
export { LetsBonkSkill } from "./platforms/letsbonk/index.js";
export { MoonshotSkill } from "./platforms/moonshot/index.js";
export { FourMemeSkill } from "./platforms/fourmeme/index.js";
export { SunPumpSkill } from "./platforms/sunpump/index.js";

import toolDefinitions from "./tool-definitions.json" with { type: "json" };
import openApiSpec from "./openapi.json" with { type: "json" };
import type { PlatformSkill, Platform, WalletConfig } from "./shared/types.js";

/** Function calling tool definitions (OpenAI/Anthropic compatible) */
export { toolDefinitions };

/** OpenAPI 3.1 specification */
export { openApiSpec };
import { PumpFunSkill } from "./platforms/pumpfun/index.js";
import { ZoraSkill } from "./platforms/zora/index.js";
import { ClankerSkill } from "./platforms/clanker/index.js";
import { LetsBonkSkill } from "./platforms/letsbonk/index.js";
import { MoonshotSkill } from "./platforms/moonshot/index.js";
import { FourMemeSkill } from "./platforms/fourmeme/index.js";
import { SunPumpSkill } from "./platforms/sunpump/index.js";

export interface DexSkillsConfig {
  wallets: WalletConfig;
  bitqueryApiKey?: string;
}

export function createSkills(config: DexSkillsConfig): Map<Platform, PlatformSkill> {
  const skills = new Map<Platform, PlatformSkill>();

  if (config.wallets.solana) {
    skills.set("pumpfun", new PumpFunSkill(config.wallets.solana));
    skills.set("letsbonk", new LetsBonkSkill(config.wallets.solana, config.bitqueryApiKey));
    skills.set("moonshot", new MoonshotSkill(config.wallets.solana));
  }

  if (config.wallets.base) {
    skills.set("zora", new ZoraSkill(config.wallets.base));
    skills.set("clanker", new ClankerSkill(config.wallets.base));
  }

  if (config.wallets.bnb) {
    skills.set("fourmeme", new FourMemeSkill(config.wallets.bnb));
  }

  if (config.wallets.tron) {
    skills.set("sunpump", new SunPumpSkill(config.wallets.tron));
  }

  return skills;
}

export function getSkill(
  skills: Map<Platform, PlatformSkill>,
  platform: Platform
): PlatformSkill {
  const skill = skills.get(platform);
  if (!skill) {
    throw new Error(
      `Platform "${platform}" not configured. Check wallet config.`
    );
  }
  return skill;
}
