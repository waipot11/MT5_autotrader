/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BotSettings {
  isActive: boolean;
  assetId: string;
  tradeAmount: number;
  martingaleMultiplier: number;
  maxMartingaleSteps: number;
  emaShort: number;
  emaLong: number;
  accountType: 'practice' | 'real';
  mode: 'simulation' | 'mt5';
  
  // V98.3 Advanced Options
  v98Enabled?: boolean;
  v98TrendEma?: number;        // Trend filter (e.g. 200) to ensure <5% loss rate
  dailyTradeLimit?: number;     // Day Trade Limit (Max trades per day)
  startHour?: string;          // Safe Hour Start (HH:MM UTC)
  endHour?: string;            // Safe Hour End (HH:MM UTC)
  dailyProfitTarget?: number;  // Profit goal to halt bot for safety
  dailyLossLimit?: number;     // Max daily drawdown to halt bot
}

export interface Trade {
  id: string;
  timestamp: string;
  type: 'CALL' | 'PUT';
  amount: number;
  entryPrice: number;
  exitPrice: number | null;
  status: 'PENDING' | 'WIN' | 'LOSS' | 'CANCELLED';
  martingaleStep: number;
  expiryTime: string;
  profit: number | null;
  asset: string;
}

export interface Candle {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  emaShort: number | null;
  emaLong: number | null;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'trade' | 'error' | 'success';
  message: string;
}

export interface BotStats {
  balance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  netProfit: number;
  currentStep: number;
  currency?: string;
}

export interface ConnectionState {
  status: 'disconnected' | 'authenticating' | 'connected' | 'reconnecting' | 'error';
  error: string | null;
}

export interface Asset {
  id: string;
  name: string;
  activeId: number;
  basePrice: number;
  volatility: number;
}

export const SUPPORTED_ASSETS: Asset[] = [
  { id: 'XAUUSD', name: 'GOLD (XAU/USD)', activeId: 100, basePrice: 2420.50, volatility: 0.15 },
  { id: 'EURUSD', name: 'EUR/USD', activeId: 1, basePrice: 1.0850, volatility: 0.00015 },
  { id: 'GBPUSD', name: 'GBP/USD', activeId: 2, basePrice: 1.2650, volatility: 0.00018 },
  { id: 'USDJPY', name: 'USD/JPY', activeId: 3, basePrice: 156.20, volatility: 0.02 },
  { id: 'EURJPY', name: 'EUR/JPY', activeId: 4, basePrice: 169.50, volatility: 0.022 },
  { id: 'AUDUSD', name: 'AUD/USD', activeId: 99, basePrice: 0.6620, volatility: 0.00014 },
  { id: 'BTCUSD', name: 'BTC/USD', activeId: 12, basePrice: 65000.00, volatility: 15.0 },
  { id: 'ETHUSD', name: 'ETH/USD', activeId: 13, basePrice: 3450.00, volatility: 1.2 }
];
