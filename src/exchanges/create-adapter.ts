import type { ExchangeAdapter } from "./adapter";
import { AsterExchangeAdapter, type AsterCredentials } from "./aster-adapter";
import { GrvtExchangeAdapter, type GrvtCredentials } from "./grvt/adapter";
import { HyperliquidExchangeAdapter, type HyperliquidCredentials } from "./hyperliquid-adapter";

export interface ExchangeFactoryOptions {
  symbol: string;
  exchange?: string;
  aster?: AsterCredentials;
  grvt?: GrvtCredentials;
  hyperliquid?: HyperliquidCredentials;
}

export type SupportedExchangeId = "aster" | "grvt" | "hyperliquid";

export function resolveExchangeId(value?: string | null): SupportedExchangeId {
  const fallback = (value ?? process.env.EXCHANGE ?? process.env.TRADE_EXCHANGE ?? "aster")
    .toString()
    .trim()
    .toLowerCase();
  if (fallback === "grvt") return "grvt";
  if (fallback === "hyperliquid") return "hyperliquid";
  return "aster";
}

export function getExchangeDisplayName(id: SupportedExchangeId): string {
  switch (id) {
    case "grvt":
      return "GRVT";
    case "hyperliquid":
      return "Hyperliquid";
    default:
      return "AsterDex";
  }
}

export function createExchangeAdapter(options: ExchangeFactoryOptions): ExchangeAdapter {
  const id = resolveExchangeId(options.exchange);
  switch (id) {
    case "grvt":
      return new GrvtExchangeAdapter({ ...options.grvt, symbol: options.symbol });
    case "hyperliquid":
      return new HyperliquidExchangeAdapter({ ...options.hyperliquid, symbol: options.symbol });
    default:
      return new AsterExchangeAdapter({ ...options.aster, symbol: options.symbol });
  }
}
