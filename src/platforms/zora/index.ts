import {
  type PlatformSkill,
  type LaunchParams,
  type LaunchResult,
  type TokenInfo,
  type ListTokensParams,
  type WalletConfig,
  type TradeParams,
  type TradeResult,
  type TradeHistoryItem,
  type HolderInfo,
  type TrendingParams,
} from "../../shared/types.js";

export class ZoraSkill implements PlatformSkill {
  platform = "zora" as const;
  chain = "base" as const;

  private wallet: WalletConfig["base"];

  constructor(wallet: WalletConfig["base"]) {
    this.wallet = wallet;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const { createCoin, getCoinCreateFromLogs } = await import(
      "@zoralabs/coins-sdk"
    );
    const { createWalletClient, createPublicClient, http } = await import(
      "viem"
    );
    const { privateKeyToAccount } = await import("viem/accounts");
    const { base } = await import("viem/chains");

    const account = privateKeyToAccount(
      this.wallet!.privateKey as `0x${string}`
    );

    const publicClient = createPublicClient({
      chain: base,
      transport: http(this.wallet!.rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(this.wallet!.rpcUrl),
    });

    // Build metadata URI — encode description, image, and links as JSON data URI
    const metadataObj: Record<string, any> = {
      name: params.name,
      description: params.description || "",
      image: params.imageUrl || "",
    };
    if (params.links) {
      metadataObj.external_url = params.links.website || "";
      metadataObj.links = Object.fromEntries(
        Object.entries(params.links).filter(([, v]) => v)
      );
    }
    const metadataUri =
      "data:application/json;base64," +
      Buffer.from(JSON.stringify(metadataObj)).toString("base64");

    const result = await createCoin({
      call: {
        creator: account.address,
        name: params.name,
        symbol: params.symbol,
        metadata: {
          type: "RAW_URI" as const,
          uri: metadataUri,
        },
        currency: "ETH",
        payoutRecipientOverride: account.address,
      },
      walletClient,
      publicClient,
    });

    const deployInfo = getCoinCreateFromLogs(result.receipt);
    const tokenAddress = deployInfo?.coin || result.receipt?.logs?.[0]?.address;

    if (!tokenAddress) {
      throw new Error(
        `Zora coin created but could not extract token address from tx: ${result.hash}`
      );
    }

    return {
      platform: "zora",
      chain: "base",
      tokenAddress,
      txHash: result.hash,
      tokenName: params.name,
      tokenSymbol: params.symbol,
      creatorAddress: account.address,
      timestamp: Date.now(),
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const { getCoin } = await import("@zoralabs/coins-sdk");

    const result = await getCoin({
      address: tokenAddress as `0x${string}`,
    });

    const coin = result.data as any;

    return {
      platform: "zora",
      chain: "base",
      tokenAddress,
      name: coin?.name || "",
      symbol: coin?.symbol || "",
      creatorAddress: coin?.creatorAddress || "",
      marketCap: coin?.marketCap ? Number(coin.marketCap) : undefined,
      totalSupply: coin?.totalSupply?.toString(),
      volume24h: coin?.volume24h ? Number(coin.volume24h) : undefined,
      extra: { raw: coin },
    };
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const { getCoinsNew } = await import("@zoralabs/coins-sdk");

    const result = await getCoinsNew({
      count: params?.limit || 20,
    });

    const data = result.data as any;
    const coins = data?.exploreList?.edges?.map((e: any) => e.node) || data?.coins || [];

    return coins.map((c: any) => ({
      platform: "zora" as const,
      chain: "base" as const,
      tokenAddress: c.address || "",
      name: c.name || "",
      symbol: c.symbol || "",
      creatorAddress: c.creatorAddress || "",
      marketCap: c.marketCap ? Number(c.marketCap) : undefined,
      volume24h: c.volume24h ? Number(c.volume24h) : undefined,
      totalSupply: c.totalSupply?.toString(),
      createdAt: c.createdAt ? new Date(c.createdAt).getTime() : undefined,
    }));
  }

  private async getViemClients() {
    const { createWalletClient, createPublicClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { base } = await import("viem/chains");

    const account = privateKeyToAccount(this.wallet!.privateKey as `0x${string}`);
    const publicClient = createPublicClient({ chain: base, transport: http(this.wallet!.rpcUrl) });
    const walletClient = createWalletClient({ account, chain: base, transport: http(this.wallet!.rpcUrl) });
    return { account, publicClient, walletClient };
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    const { tradeCoin } = await import("@zoralabs/coins-sdk");
    const { parseEther } = await import("viem");
    const { account, publicClient, walletClient } = await this.getViemClients();

    const result = await tradeCoin({
      tradeParameters: {
        sell: { type: "eth" },
        buy: { type: "erc20", address: params.tokenAddress as `0x${string}` },
        amountIn: parseEther(params.amount),
        sender: account.address,
        recipient: account.address,
      },
      publicClient,
      walletClient,
    });

    return {
      platform: "zora",
      chain: "base",
      txHash: result?.hash || "",
      tokenAddress: params.tokenAddress,
      action: "buy",
      nativeAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    const { tradeCoin } = await import("@zoralabs/coins-sdk");
    const { account, publicClient, walletClient } = await this.getViemClients();

    const result = await tradeCoin({
      tradeParameters: {
        sell: { type: "erc20", address: params.tokenAddress as `0x${string}` },
        buy: { type: "eth" },
        amountIn: BigInt(params.amount),
        sender: account.address,
        recipient: account.address,
      },
      publicClient,
      walletClient,
    });

    return {
      platform: "zora",
      chain: "base",
      txHash: result?.hash || "",
      tokenAddress: params.tokenAddress,
      action: "sell",
      tokenAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async getHolders(
    tokenAddress: string,
    params?: { limit?: number }
  ): Promise<HolderInfo[]> {
    const { getCoinHolders } = await import("@zoralabs/coins-sdk");

    const result = await getCoinHolders({
      chainId: 8453,
      address: tokenAddress,
      count: params?.limit || 50,
    });

    const holders = (result.data as any)?.holders || [];

    return holders.map((h: any) => ({
      address: h.address || h.walletAddress || "",
      balance: h.balance?.toString() || h.amount?.toString() || "0",
      percentage: h.percentage != null ? Number(h.percentage) : undefined,
    }));
  }

  async getTradeHistory(
    tokenAddress: string,
    params?: { limit?: number }
  ): Promise<TradeHistoryItem[]> {
    const limit = params?.limit || 20;

    // Try SDK getCoinSwaps first, fall back to REST API
    try {
      const sdk = await import("@zoralabs/coins-sdk");
      if ("getCoinSwaps" in sdk && typeof sdk.getCoinSwaps === "function") {
        const result = await sdk.getCoinSwaps({
          address: tokenAddress,
          first: limit,
        });
        const swaps = (result.data as any)?.swaps || [];
        return swaps.map((s: any) => ({
          txHash: s.txHash || s.transactionHash || "",
          action: s.direction === "sell" ? ("sell" as const) : ("buy" as const),
          tokenAmount: s.tokenAmount?.toString() || s.amount?.toString() || "0",
          nativeAmount: s.ethAmount?.toString() || s.nativeAmount?.toString(),
          priceUsd: s.priceUsd != null ? Number(s.priceUsd) : undefined,
          timestamp: s.timestamp
            ? new Date(s.timestamp).getTime()
            : Date.now(),
          walletAddress: s.walletAddress || s.address,
        }));
      }
    } catch {
      // SDK function not available, fall back to REST
    }

    // Fallback: Zora REST API
    const url = `https://api-sdk.zora.engineering/discover/coins/secondary_market_activity/${tokenAddress}?limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Zora trade history API returned ${response.status}: ${response.statusText}`
      );
    }
    const data = (await response.json()) as any;
    const trades = data?.trades || data?.swaps || data?.results || [];

    return trades.map((t: any) => ({
      txHash: t.txHash || t.transactionHash || "",
      action: t.direction === "sell" ? ("sell" as const) : ("buy" as const),
      tokenAmount: t.tokenAmount?.toString() || t.amount?.toString() || "0",
      nativeAmount: t.ethAmount?.toString() || t.nativeAmount?.toString(),
      priceUsd: t.priceUsd != null ? Number(t.priceUsd) : undefined,
      timestamp: t.timestamp ? new Date(t.timestamp).getTime() : Date.now(),
      walletAddress: t.walletAddress || t.address,
    }));
  }

  async getTrending(params?: TrendingParams): Promise<TokenInfo[]> {
    const {
      getCoinsTopGainers,
      getCoinsTopVolume24h,
      getCoinsMostValuable,
      getCoinsNew,
    } = await import("@zoralabs/coins-sdk");

    const limit = params?.limit || 20;
    const category = params?.category || "gainers";

    let result: any;
    const query = { count: limit };
    switch (category) {
      case "volume":
        result = await getCoinsTopVolume24h(query);
        break;
      case "new":
        result = await getCoinsNew(query);
        break;
      case "graduated":
        result = await getCoinsMostValuable(query);
        break;
      case "gainers":
      default:
        result = await getCoinsTopGainers(query);
        break;
    }

    const trendData = result.data as any;
    const coins = trendData?.exploreList?.edges?.map((e: any) => e.node) || trendData?.coins || [];

    return coins.map((c: any) => ({
      platform: "zora" as const,
      chain: "base" as const,
      tokenAddress: c.address || "",
      name: c.name || "",
      symbol: c.symbol || "",
      creatorAddress: c.creatorAddress || "",
      marketCap: c.marketCap ? Number(c.marketCap) : undefined,
      volume24h: c.volume24h ? Number(c.volume24h) : undefined,
      createdAt: c.createdAt ? new Date(c.createdAt).getTime() : undefined,
    }));
  }
}
