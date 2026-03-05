import {
  type PlatformSkill,
  type LaunchParams,
  type LaunchResult,
  type TokenInfo,
  type ListTokensParams,
  type WalletConfig,
  type TradeParams,
  type TradeResult,
  type TrendingParams,
} from "../../shared/types.js";

// SunPump contract addresses on TRON
const SUNPUMP_PROXY = "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw";
const SUNPUMP_API = "https://api-v2.sunpump.meme";

export class SunPumpSkill implements PlatformSkill {
  platform = "sunpump" as const;
  chain = "tron" as const;

  private wallet: WalletConfig["tron"];

  constructor(wallet: WalletConfig["tron"]) {
    this.wallet = wallet;
  }

  private async getTronWeb() {
    const { TronWeb } = await import("tronweb");
    return new TronWeb({
      fullHost: this.wallet!.fullHost || "https://api.trongrid.io",
      privateKey: this.wallet!.privateKey,
      headers: this.wallet!.apiKey
        ? { "TRON-PRO-API-KEY": this.wallet!.apiKey }
        : undefined,
    });
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const tronWeb = await this.getTronWeb();
    const contract = await tronWeb.contract().at(SUNPUMP_PROXY);

    // Build description with social links appended as metadata
    let description = params.description || "";
    const linkEntries = [
      params.links?.twitter && `twitter: ${params.links.twitter}`,
      params.links?.telegram && `telegram: ${params.links.telegram}`,
      params.links?.website && `website: ${params.links.website}`,
    ].filter(Boolean);
    if (linkEntries.length > 0) {
      description += (description ? "\n" : "") + linkEntries.join("\n");
    }

    const tx = await contract
      .createAndInitPurchase(
        params.name,
        params.symbol,
        description,
        params.imageUrl || "",
        params.initialBuyAmount ? BigInt(params.initialBuyAmount) : 0
      )
      .send({
        callValue: 20_000_000, // 20 TRX in SUN
        feeLimit: 100_000_000,
      });

    const txHash =
      typeof tx === "string" ? tx : tx.txid || tx.transaction?.txID || "";

    // Poll for transaction confirmation and extract token address from logs
    let tokenAddress: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const txInfo = await tronWeb.trx.getTransactionInfo(txHash);
        if (txInfo.log && txInfo.log.length > 0) {
          const rawAddr = txInfo.log[0].topics?.[1]?.slice(24);
          if (rawAddr) {
            tokenAddress = tronWeb.address.fromHex("41" + rawAddr);
            break;
          }
        }
        // If receipt exists but no logs, tx might have failed
        if (txInfo.id) {
          if (txInfo.receipt?.result === "FAILED") {
            throw new Error(`SunPump transaction failed: ${txHash}`);
          }
          // Receipt exists but no logs yet — keep waiting
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("failed")) throw e;
        // Transaction not yet indexed — retry
      }
    }

    if (!tokenAddress) {
      throw new Error(
        `SunPump token created but could not extract token address from tx: ${txHash}`
      );
    }

    return {
      platform: "sunpump",
      chain: "tron",
      tokenAddress,
      txHash,
      tokenName: params.name,
      tokenSymbol: params.symbol,
      creatorAddress: tronWeb.defaultAddress?.base58 || "",
      timestamp: Date.now(),
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const resp = await fetch(
      `${SUNPUMP_API}/pump-api/token/${tokenAddress}`
    );

    if (resp.ok) {
      const data = (await resp.json()) as Record<string, any>;
      return {
        platform: "sunpump",
        chain: "tron",
        tokenAddress,
        name: data.name || "",
        symbol: data.symbol || "",
        description: data.description,
        imageUrl: data.image || data.logoUrl,
        creatorAddress: data.creator || "",
        marketCap: data.marketCap,
        price: data.price,
        priceUsd: data.priceUsd,
        totalSupply: data.totalSupply?.toString(),
        bondingCurveProgress: data.bondingCurveProgress,
        isGraduated: data.graduated === true,
        createdAt: data.createdAt
          ? new Date(data.createdAt).getTime()
          : undefined,
      };
    }

    // Fallback: read from contract
    const tronWeb = await this.getTronWeb();
    const contract = await tronWeb.contract().at(SUNPUMP_PROXY);

    const poolInfo = await contract.virtualPools(tokenAddress).call();
    const price = await contract.getPrice(tokenAddress).call();

    return {
      platform: "sunpump",
      chain: "tron",
      tokenAddress,
      name: "",
      symbol: "",
      creatorAddress: "",
      price: price ? Number(price) / 1e6 : undefined,
      isGraduated: poolInfo?.launched === true,
      extra: {
        virtualTokenReserve: poolInfo?.virtualTokenReserve?.toString(),
        virtualTrxReserve: poolInfo?.virtualTrxReserve?.toString(),
      },
    };
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;
    const page = params?.offset ? Math.floor(params.offset / limit) + 1 : 1;
    const sortBy =
      params?.sortBy === "marketCap" ? "marketCap" : "createdTime";
    const sortType = params?.sortOrder === "asc" ? "asc" : "desc";

    const resp = await fetch(
      `${SUNPUMP_API}/pump-api/token/search?keyword=&page=${page}&size=${limit}&sortBy=${sortBy}&sortType=${sortType}`
    );

    if (!resp.ok) throw new Error("Failed to list SunPump tokens");
    const data = (await resp.json()) as { data: { tokens: any[] } };
    const tokens = data.data?.tokens || [];

    return tokens.map((d: any) => ({
      platform: "sunpump" as const,
      chain: "tron" as const,
      tokenAddress: d.contractAddress || d.tokenAddress,
      name: d.name,
      symbol: d.symbol,
      description: d.description,
      imageUrl: d.logoUrl || d.image,
      creatorAddress: d.ownerAddress || d.creator || "",
      marketCap: d.marketCap,
      price: d.priceInTrx,
      bondingCurveProgress: d.pumpPercentage,
      isGraduated: d.status === "LISTED",
      createdAt: d.tokenCreatedInstant
        ? new Date(d.tokenCreatedInstant).getTime()
        : undefined,
    }));
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    const tronWeb = await this.getTronWeb();
    const contract = await tronWeb.contract().at(SUNPUMP_PROXY);

    // purchase(tokenAddress, minTokenAmount) with callValue = TRX amount in SUN
    const amount = Number(params.amount);
    const tx = await contract.purchase(params.tokenAddress, 0).send({
      callValue: amount,
      feeLimit: 100_000_000,
    });

    const txHash =
      typeof tx === "string" ? tx : tx.txid || tx.transaction?.txID || "";

    return {
      platform: "sunpump",
      chain: "tron",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "buy",
      nativeAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    const tronWeb = await this.getTronWeb();
    const contract = await tronWeb.contract().at(SUNPUMP_PROXY);

    // sell(tokenAddress, tokenAmount)
    const tx = await contract
      .sell(params.tokenAddress, BigInt(params.amount))
      .send({
        feeLimit: 100_000_000,
      });

    const txHash =
      typeof tx === "string" ? tx : tx.txid || tx.transaction?.txID || "";

    return {
      platform: "sunpump",
      chain: "tron",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "sell",
      tokenAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async getTrending(params?: TrendingParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;

    let sortBy: string;
    switch (params?.category) {
      case "gainers":
      case "volume":
        sortBy = "volume24h";
        break;
      case "new":
        sortBy = "createdTime";
        break;
      case "graduated":
        sortBy = "marketCap";
        break;
      default:
        sortBy = "marketCap";
        break;
    }

    const url = `${SUNPUMP_API}/pump-api/token/search?keyword=&page=1&size=${limit}&sortBy=${sortBy}&sortType=desc`;
    const resp = await fetch(url);

    if (!resp.ok) throw new Error("Failed to fetch SunPump trending tokens");
    const data = (await resp.json()) as { data: { tokens: any[] } };
    let tokens = data.data?.tokens || [];

    if (params?.category === "graduated") {
      tokens = tokens.filter((d: any) => d.status === "LISTED");
    }

    return tokens.map((d: any) => ({
      platform: "sunpump" as const,
      chain: "tron" as const,
      tokenAddress: d.contractAddress || d.tokenAddress,
      name: d.name,
      symbol: d.symbol,
      description: d.description,
      imageUrl: d.logoUrl || d.image,
      creatorAddress: d.ownerAddress || d.creator || "",
      marketCap: d.marketCap,
      price: d.priceInTrx,
      volume24h: d.volume24h,
      bondingCurveProgress: d.pumpPercentage,
      isGraduated: d.status === "LISTED",
      createdAt: d.tokenCreatedInstant
        ? new Date(d.tokenCreatedInstant).getTime()
        : undefined,
    }));
  }
}
