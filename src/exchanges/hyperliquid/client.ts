import axios, { type AxiosInstance } from "axios";
import WebSocket from "ws";
import crypto from "crypto";
import { ethers } from "ethers";
import type {
    AsterAccountSnapshot,
    AsterOrder,
    AsterDepth,
    AsterTicker,
    AsterKline,
    CreateOrderParams,
    HyperliquidAccountSnapshot,
    HyperliquidOrder,
    HyperliquidDepth,
    HyperliquidTicker,
    HyperliquidKline,
} from "../types";

export interface HyperliquidCredentials {
    walletAddress?: string;
    privateKey?: string;
}

export interface HyperliquidGatewayOptions {
    apiKey?: string;
    apiSecret?: string;
    walletAddress?: string;
    privateKey?: string;
    baseUrl?: string;
    wsUrl?: string;
}

export class HyperliquidGateway {
    private readonly httpClient: AxiosInstance;
    private readonly wsClient: WebSocket | null = null;
    private readonly credentials: HyperliquidCredentials;
    private readonly baseUrl: string;
    private readonly wsUrl: string;
    private readonly wallet: ethers.Wallet | null = null;
    private isInitialized = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly listeners = {
        account: new Set<(snapshot: AsterAccountSnapshot) => void>(),
        orders: new Set<(orders: AsterOrder[]) => void>(),
        depth: new Map<string, Set<(depth: AsterDepth) => void>>(),
        ticker: new Map<string, Set<(ticker: AsterTicker) => void>>(),
        klines: new Map<string, Set<(klines: AsterKline[]) => void>>(),
    };

    constructor(options: HyperliquidGatewayOptions = {}) {
        this.credentials = {
            walletAddress: options.walletAddress,
            privateKey: options.privateKey,
        };

        this.baseUrl = options.baseUrl ?? "https://api.hyperliquid.xyz";
        this.wsUrl = options.wsUrl ?? "wss://api.hyperliquid.xyz/ws";

        // Initialize wallet if private key is provided
        if (this.credentials.privateKey) {
            this.wallet = new ethers.Wallet(this.credentials.privateKey);
        }

        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    async ensureInitialized(symbol: string): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Test connection and get account info
            await this.getAccountInfo();
            this.isInitialized = true;
            console.log(`[HyperliquidGateway] Initialized successfully for ${symbol}`);
        } catch (error) {
            console.error(`[HyperliquidGateway] Initialization failed:`, error);
            throw error;
        }
    }

    private async signRequest(data: any): Promise<string> {
        if (!this.wallet) {
            throw new Error("Wallet not initialized - private key required for signing");
        }

        const message = JSON.stringify(data);
        const signature = await this.wallet.signMessage(message);
        return signature;
    }

    private async makeAuthenticatedRequest(endpoint: string, data: any): Promise<any> {
        const signature = await this.signRequest(data);

        const response = await this.httpClient.post(endpoint, {
            ...data,
            signature,
        });

        return response.data;
    }

    async getAccountInfo(): Promise<HyperliquidAccountSnapshot> {
        try {
            const response = await this.httpClient.get("/info");
            const accountData = response.data;

            // Transform Hyperliquid account data to match AsterAccountSnapshot format
            const snapshot: AsterAccountSnapshot = {
                canTrade: true,
                canDeposit: true,
                canWithdraw: true,
                updateTime: Date.now(),
                totalWalletBalance: accountData.totalWalletBalance || "0",
                totalUnrealizedProfit: accountData.totalUnrealizedProfit || "0",
                totalMarginBalance: accountData.totalMarginBalance,
                totalInitialMargin: accountData.totalInitialMargin,
                totalMaintMargin: accountData.totalMaintMargin,
                totalPositionInitialMargin: accountData.totalPositionInitialMargin,
                totalOpenOrderInitialMargin: accountData.totalOpenOrderInitialMargin,
                totalCrossWalletBalance: accountData.totalCrossWalletBalance,
                totalCrossUnPnl: accountData.totalCrossUnPnl,
                availableBalance: accountData.availableBalance,
                maxWithdrawAmount: accountData.maxWithdrawAmount,
                positions: accountData.positions || [],
                assets: accountData.assets || [],
            };

            return snapshot as any;
        } catch (error) {
            console.error(`[HyperliquidGateway] Failed to get account info:`, error);
            throw error;
        }
    }

    async getOpenOrders(symbol: string): Promise<HyperliquidOrder[]> {
        try {
            const response = await this.httpClient.get(`/orders?symbol=${symbol}`);
            return response.data || [];
        } catch (error) {
            console.error(`[HyperliquidGateway] Failed to get open orders:`, error);
            throw error;
        }
    }

    async createOrder(params: CreateOrderParams): Promise<HyperliquidOrder> {
        try {
            const orderData = {
                symbol: params.symbol,
                side: params.side,
                type: params.type,
                quantity: params.quantity?.toString(),
                price: params.price?.toString(),
                stopPrice: params.stopPrice?.toString(),
                activationPrice: params.activationPrice?.toString(),
                callbackRate: params.callbackRate?.toString(),
                timeInForce: params.timeInForce,
                reduceOnly: params.reduceOnly === "true",
                closePosition: params.closePosition === "true",
            };

            const response = await this.makeAuthenticatedRequest("/order", orderData);

            // Transform response to match AsterOrder format
            const order: AsterOrder = {
                orderId: response.orderId || response.id,
                clientOrderId: response.clientOrderId || "",
                symbol: params.symbol,
                side: params.side,
                type: params.type,
                status: response.status || "NEW",
                price: params.price?.toString() || "0",
                origQty: params.quantity?.toString() || "0",
                executedQty: "0",
                stopPrice: params.stopPrice?.toString() || "0",
                time: Date.now(),
                updateTime: Date.now(),
                reduceOnly: params.reduceOnly === "true",
                closePosition: params.closePosition === "true",
                workingType: params.type,
                activationPrice: params.activationPrice?.toString(),
                avgPrice: "0",
                cumQuote: "0",
                origType: params.type,
                positionSide: "BOTH",
                timeInForce: params.timeInForce,
                activatePrice: params.activationPrice?.toString(),
                priceRate: params.callbackRate?.toString(),
                priceProtect: false,
            };

            return order as any;
        } catch (error) {
            console.error(`[HyperliquidGateway] Failed to create order:`, error);
            throw error;
        }
    }

    async cancelOrder(params: { symbol: string; orderId: number | string }): Promise<void> {
        try {
            await this.makeAuthenticatedRequest("/cancel-order", {
                symbol: params.symbol,
                orderId: params.orderId,
            });
        } catch (error) {
            console.error(`[HyperliquidGateway] Failed to cancel order:`, error);
            throw error;
        }
    }

    async cancelOrders(params: { symbol: string; orderIdList: Array<number | string> }): Promise<void> {
        try {
            await this.makeAuthenticatedRequest("/cancel-orders", {
                symbol: params.symbol,
                orderIdList: params.orderIdList,
            });
        } catch (error) {
            console.error(`[HyperliquidGateway] Failed to cancel orders:`, error);
            throw error;
        }
    }

    async cancelAllOrders(params: { symbol: string }): Promise<void> {
        try {
            await this.makeAuthenticatedRequest("/cancel-all-orders", {
                symbol: params.symbol,
            });
        } catch (error) {
            console.error(`[HyperliquidGateway] Failed to cancel all orders:`, error);
            throw error;
        }
    }

    // Event listeners
    onAccount(callback: (snapshot: AsterAccountSnapshot) => void): void {
        this.listeners.account.add(callback);
    }

    onOrders(callback: (orders: AsterOrder[]) => void): void {
        this.listeners.orders.add(callback);
    }

    onDepth(symbol: string, callback: (depth: AsterDepth) => void): void {
        if (!this.listeners.depth.has(symbol)) {
            this.listeners.depth.set(symbol, new Set());
        }
        this.listeners.depth.get(symbol)!.add(callback);
    }

    onTicker(symbol: string, callback: (ticker: AsterTicker) => void): void {
        if (!this.listeners.ticker.has(symbol)) {
            this.listeners.ticker.set(symbol, new Set());
        }
        this.listeners.ticker.get(symbol)!.add(callback);
    }

    onKlines(symbol: string, interval: string, callback: (klines: AsterKline[]) => void): void {
        const key = `${symbol}_${interval}`;
        if (!this.listeners.klines.has(key)) {
            this.listeners.klines.set(key, new Set());
        }
        this.listeners.klines.get(key)!.add(callback);
    }

    // WebSocket connection management
    private connectWebSocket(): void {
        if (this.wsClient) return;

        try {
            const ws = new WebSocket(this.wsUrl);

            ws.on("open", () => {
                console.log("[HyperliquidGateway] WebSocket connected");
                this.isInitialized = true;
            });

            ws.on("message", (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error("[HyperliquidGateway] Failed to parse WebSocket message:", error);
                }
            });

            ws.on("close", () => {
                console.log("[HyperliquidGateway] WebSocket disconnected");
                this.scheduleReconnect();
            });

            ws.on("error", (error) => {
                console.error("[HyperliquidGateway] WebSocket error:", error);
                this.scheduleReconnect();
            });

            this.wsClient = ws;
        } catch (error) {
            console.error("[HyperliquidGateway] Failed to connect WebSocket:", error);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
        }, 5000);
    }

    private handleWebSocketMessage(message: any): void {
        // Handle different types of WebSocket messages
        switch (message.type) {
            case "account":
                this.listeners.account.forEach(callback => {
                    try {
                        callback(message.data);
                    } catch (error) {
                        console.error("[HyperliquidGateway] Account callback error:", error);
                    }
                });
                break;

            case "orders":
                this.listeners.orders.forEach(callback => {
                    try {
                        callback(message.data);
                    } catch (error) {
                        console.error("[HyperliquidGateway] Orders callback error:", error);
                    }
                });
                break;

            case "depth":
                const depthCallbacks = this.listeners.depth.get(message.symbol);
                if (depthCallbacks) {
                    depthCallbacks.forEach(callback => {
                        try {
                            callback(message.data);
                        } catch (error) {
                            console.error("[HyperliquidGateway] Depth callback error:", error);
                        }
                    });
                }
                break;

            case "ticker":
                const tickerCallbacks = this.listeners.ticker.get(message.symbol);
                if (tickerCallbacks) {
                    tickerCallbacks.forEach(callback => {
                        try {
                            callback(message.data);
                        } catch (error) {
                            console.error("[HyperliquidGateway] Ticker callback error:", error);
                        }
                    });
                }
                break;

            case "klines":
                const klineKey = `${message.symbol}_${message.interval}`;
                const klineCallbacks = this.listeners.klines.get(klineKey);
                if (klineCallbacks) {
                    klineCallbacks.forEach(callback => {
                        try {
                            callback(message.data);
                        } catch (error) {
                            console.error("[HyperliquidGateway] Klines callback error:", error);
                        }
                    });
                }
                break;
        }
    }

    destroy(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.wsClient) {
            this.wsClient.close();
        }

        this.isInitialized = false;
    }
}
