export type Platform =
  | "pumpfun"
  | "zora"
  | "clanker"
  | "letsbonk"
  | "moonshot"
  | "fourmeme"
  | "sunpump";

export type Chain = "solana" | "base" | "bnb" | "tron";

export interface LaunchParams {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  /** Banner image URL (supported by Moonshot) */
  bannerUrl?: string;
  initialBuyAmount?: string;
  links?: {
    twitter?: string;
    telegram?: string;
    website?: string;
    discord?: string;
    github?: string;
  };
  /** Platform-specific extra params */
  extra?: Record<string, unknown>;
}

export interface LaunchResult {
  platform: Platform;
  chain: Chain;
  tokenAddress: string;
  txHash: string;
  tokenName: string;
  tokenSymbol: string;
  creatorAddress: string;
  timestamp: number;
}

export interface TokenInfo {
  platform: Platform;
  chain: Chain;
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
  bondingCurveProgress?: number;
  isGraduated?: boolean;
  liquidityUsd?: number;
  volume24h?: number;
  createdAt?: number;
  extra?: Record<string, unknown>;
}

export interface ListTokensParams {
  limit?: number;
  offset?: number;
  sortBy?: "marketCap" | "createdAt" | "volume" | "price";
  sortOrder?: "asc" | "desc";
  /** Filter: only graduated tokens */
  graduated?: boolean;
}

// --- Trading ---

export interface TradeParams {
  tokenAddress: string;
  /** Amount in native currency (SOL/ETH/BNB/TRX) for buy, or token amount for sell */
  amount: string;
  slippage?: number;
}

export interface TradeResult {
  platform: Platform;
  chain: Chain;
  txHash: string;
  tokenAddress: string;
  action: "buy" | "sell";
  /** Amount of tokens bought or sold */
  tokenAmount?: string;
  /** Cost/proceeds in native currency */
  nativeAmount?: string;
  timestamp: number;
}

// --- Price Estimation ---

export interface PriceQuoteParams {
  tokenAddress: string;
  action: "buy" | "sell";
  /** Amount of native currency (for buy) or token amount (for sell) */
  amount: string;
}

export interface PriceQuote {
  estimatedAmount: string;
  estimatedCost: string;
  fee?: string;
  pricePerToken?: string;
}

// --- Trade History ---

export interface TradeHistoryItem {
  txHash: string;
  action: "buy" | "sell";
  tokenAmount: string;
  nativeAmount?: string;
  priceUsd?: number;
  timestamp: number;
  walletAddress?: string;
}

// --- Holders ---

export interface HolderInfo {
  address: string;
  balance: string;
  percentage?: number;
}

// --- Trending ---

export interface TrendingParams {
  /** Category: "gainers" | "volume" | "new" | "graduated" */
  category?: "gainers" | "volume" | "new" | "graduated";
  limit?: number;
}

// --- Platform Skill Interface ---

export interface PlatformSkill {
  platform: Platform;
  chain: Chain;

  /** Launch a new token */
  launch(params: LaunchParams): Promise<LaunchResult>;

  /** Get info for a specific token */
  getTokenInfo(tokenAddress: string): Promise<TokenInfo>;

  /** List recently launched tokens */
  listTokens(params?: ListTokensParams): Promise<TokenInfo[]>;

  /** Buy tokens on the bonding curve / DEX */
  buy?(params: TradeParams): Promise<TradeResult>;

  /** Sell tokens on the bonding curve / DEX */
  sell?(params: TradeParams): Promise<TradeResult>;

  /** Get a price quote before trading */
  estimatePrice?(params: PriceQuoteParams): Promise<PriceQuote>;

  /** Get recent trade history for a token */
  getTradeHistory?(
    tokenAddress: string,
    params?: { limit?: number }
  ): Promise<TradeHistoryItem[]>;

  /** Get token holder list */
  getHolders?(
    tokenAddress: string,
    params?: { limit?: number }
  ): Promise<HolderInfo[]>;

  /** Get trending / top tokens */
  getTrending?(params?: TrendingParams): Promise<TokenInfo[]>;
}

export interface WalletConfig {
  solana?: {
    privateKey: string;
    rpcUrl: string;
  };
  base?: {
    privateKey: string;
    rpcUrl: string;
  };
  bnb?: {
    privateKey: string;
    rpcUrl: string;
  };
  tron?: {
    privateKey: string;
    fullHost: string;
    apiKey?: string;
  };
}
