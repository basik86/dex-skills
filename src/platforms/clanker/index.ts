import {
  type PlatformSkill,
  type LaunchParams,
  type LaunchResult,
  type TokenInfo,
  type ListTokensParams,
  type TradeParams,
  type TradeResult,
  type TrendingParams,
  type WalletConfig,
} from "../../shared/types.js";

const CLANKER_API = "https://www.clanker.world/api";

export class ClankerSkill implements PlatformSkill {
  platform = "clanker" as const;
  chain = "base" as const;

  private wallet: WalletConfig["base"];

  constructor(wallet: WalletConfig["base"]) {
    this.wallet = wallet;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const {
      clankerConfigFor,
      getTickFromMarketCap,
      FeeConfigs,
      FEE_CONFIGS,
    } = await import("clanker-sdk");
    const {
      createWalletClient,
      createPublicClient,
      http,
      encodeFunctionData,
    } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { base } = await import("viem/chains");

    const account = privateKeyToAccount(
      this.wallet!.privateKey as `0x${string}`
    );

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(this.wallet!.rpcUrl),
    });

    const publicClient = createPublicClient({
      chain: base,
      transport: http(this.wallet!.rpcUrl),
    });

    // Get V4 deployment config for Base
    const config = clankerConfigFor(8453, "clanker_v4");
    if (!config) throw new Error("Clanker V4 config not found for Base");

    const tick = getTickFromMarketCap(10_000); // $10k starting market cap

    // Build the deployToken transaction using the factory ABI
    const data = encodeFunctionData({
      abi: config.abi as any,
      functionName: "deployToken",
      args: [
        {
          name: params.name,
          symbol: params.symbol,
          image: params.imageUrl || "",
          metadata: {
            description: params.description || "",
            ...(params.links?.twitter && { twitter: params.links.twitter }),
            ...(params.links?.telegram && { telegram: params.links.telegram }),
            ...(params.links?.website && { website: params.links.website }),
            ...(params.links?.discord && { discord: params.links.discord }),
          },
          context: "",
          tokenAdmin: account.address,
          devBuyAmount: 0n,
          pool: {
            pairedToken:
              "0x4200000000000000000000000000000000000006" as `0x${string}`, // WETH on Base
            tickIfToken0IsClanker: tick.tickIfToken0IsClanker,
            positions: [
              { tickLower: -887200, tickUpper: 887200, positionBps: 10000 },
            ],
          },
          vault: { percentage: 0, duration: 0 },
          airdrop: { data: "0x" as `0x${string}` },
          fees: FEE_CONFIGS[FeeConfigs.DynamicBasic],
          rewards: { recipients: [] },
          vanity: false,
        },
      ],
    });

    const txHash = await walletClient.sendTransaction({
      to: config.address,
      data,
      account,
      chain: base,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Extract deployed token address from Transfer event (ERC20 mint to deployer)
    // The first Transfer event with topic[0] = Transfer(address,address,uint256)
    // from address(0) is the token mint, and the log.address is the token contract
    const transferSig = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const zeroTopic = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const mintLog = receipt.logs.find(
      (log) => log.topics[0] === transferSig && log.topics[1] === zeroTopic
    );
    const tokenAddress = mintLog?.address || receipt.logs[0]?.address;

    if (!tokenAddress) {
      throw new Error(
        `Clanker token deployed but could not extract token address from tx: ${txHash}`
      );
    }

    return {
      platform: "clanker",
      chain: "base",
      tokenAddress,
      txHash,
      tokenName: params.name,
      tokenSymbol: params.symbol,
      creatorAddress: account.address,
      timestamp: Date.now(),
    };
  }

  private mapToken(d: any): TokenInfo {
    return {
      platform: "clanker" as const,
      chain: "base" as const,
      tokenAddress: d.contract_address || d.address || "",
      name: d.name || "",
      symbol: d.symbol || "",
      description: d.description,
      imageUrl: d.img_url || d.image,
      creatorAddress: d.admin || d.deployer || d.creator || "",
      marketCap: d.marketCap,
      price: d.price,
      priceUsd: d.priceUsd,
      totalSupply: d.supply?.toString() || d.totalSupply?.toString(),
      createdAt: d.created_at
        ? new Date(d.created_at).getTime()
        : d.createdAt
          ? new Date(d.createdAt).getTime()
          : undefined,
      extra: { poolAddress: d.pool_address || d.poolAddress },
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const resp = await fetch(`${CLANKER_API}/tokens/${tokenAddress}`);
    if (!resp.ok) throw new Error(`Clanker token not found: ${tokenAddress}`);
    const result = (await resp.json()) as any;
    const data = result.data || result;

    return this.mapToken(data);
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;

    const resp = await fetch(
      `${CLANKER_API}/tokens?limit=${limit}`
    );
    if (!resp.ok) throw new Error(`Failed to list Clanker tokens`);
    const result = (await resp.json()) as any;
    const tokens = result.data || result.tokens || [];

    return tokens.map((d: any) => this.mapToken(d));
  }

  async getTrending(params?: TrendingParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;

    const resp = await fetch(
      `${CLANKER_API}/tokens?limit=${limit}`
    );
    if (!resp.ok) throw new Error(`Failed to fetch trending Clanker tokens`);
    const result = (await resp.json()) as any;
    const tokens = result.data || result.tokens || [];

    return tokens.map((d: any) => this.mapToken(d));
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    if (!this.wallet) throw new Error("Base wallet not configured");

    const {
      createWalletClient,
      createPublicClient,
      http,
      encodeFunctionData,
      parseEther,
    } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { base } = await import("viem/chains");

    const account = privateKeyToAccount(
      this.wallet.privateKey as `0x${string}`
    );
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(this.wallet.rpcUrl),
    });
    const publicClient = createPublicClient({
      chain: base,
      transport: http(this.wallet.rpcUrl),
    });

    const SWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
    const WETH = "0x4200000000000000000000000000000000000006";

    const swapAbi = [
      {
        name: "exactInputSingle",
        type: "function",
        inputs: [
          {
            name: "params",
            type: "tuple",
            components: [
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "recipient", type: "address" },
              { name: "amountIn", type: "uint256" },
              { name: "amountOutMinimum", type: "uint256" },
              { name: "sqrtPriceLimitX96", type: "uint160" },
            ],
          },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "payable",
      },
    ] as const;

    const swapData = encodeFunctionData({
      abi: swapAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: WETH as `0x${string}`,
          tokenOut: params.tokenAddress as `0x${string}`,
          fee: 10000, // 1% fee tier (Clanker default)
          recipient: account.address,
          amountIn: parseEther(params.amount),
          amountOutMinimum: 0n, // TODO: calculate from slippage param
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const txHash = await walletClient.sendTransaction({
      to: SWAP_ROUTER as `0x${string}`,
      data: swapData,
      value: parseEther(params.amount),
      account,
      chain: base,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      platform: "clanker",
      chain: "base",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "buy",
      nativeAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    if (!this.wallet) throw new Error("Base wallet not configured");

    const {
      createWalletClient,
      createPublicClient,
      http,
      encodeFunctionData,
    } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { base } = await import("viem/chains");

    const account = privateKeyToAccount(
      this.wallet.privateKey as `0x${string}`
    );
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(this.wallet.rpcUrl),
    });
    const publicClient = createPublicClient({
      chain: base,
      transport: http(this.wallet.rpcUrl),
    });

    const SWAP_ROUTER =
      "0x2626664c2603336E57B271c5C0b26F421741e481" as `0x${string}`;
    const WETH =
      "0x4200000000000000000000000000000000000006" as `0x${string}`;

    // Step 1: Approve SwapRouter to spend tokens
    const approveData = encodeFunctionData({
      abi: [
        {
          name: "approve",
          type: "function",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
          stateMutability: "nonpayable",
        },
      ] as const,
      functionName: "approve",
      args: [SWAP_ROUTER, BigInt(params.amount)],
    });

    const approveTx = await walletClient.sendTransaction({
      to: params.tokenAddress as `0x${string}`,
      data: approveData,
      account,
      chain: base,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // Step 2: Swap token for ETH
    const swapAbi = [
      {
        name: "exactInputSingle",
        type: "function",
        inputs: [
          {
            name: "params",
            type: "tuple",
            components: [
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "recipient", type: "address" },
              { name: "amountIn", type: "uint256" },
              { name: "amountOutMinimum", type: "uint256" },
              { name: "sqrtPriceLimitX96", type: "uint160" },
            ],
          },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "payable",
      },
    ] as const;

    const swapData = encodeFunctionData({
      abi: swapAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.tokenAddress as `0x${string}`,
          tokenOut: WETH,
          fee: 10000, // 1% fee tier (Clanker default)
          recipient: account.address,
          amountIn: BigInt(params.amount),
          amountOutMinimum: 0n, // TODO: calculate from slippage param
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const txHash = await walletClient.sendTransaction({
      to: SWAP_ROUTER,
      data: swapData,
      account,
      chain: base,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      platform: "clanker",
      chain: "base",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "sell",
      tokenAmount: params.amount,
      timestamp: Date.now(),
    };
  }
}
