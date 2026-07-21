/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createHttpServer } from "http";
import { WebSocketServer, WebSocket as ClientWebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { BotSettings, Trade, Candle, LogEntry, BotStats, ConnectionState, SUPPORTED_ASSETS, Asset, UserSession } from "./src/types";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const httpServer = createHttpServer(app);
const wss = new WebSocketServer({ noServer: true });

// Global Bot Session State
let botSettings: BotSettings = {
  isActive: false,
  assetId: "XAUUSD",
  tradeAmount: 0.01,
  martingaleMultiplier: 1.0,
  maxMartingaleSteps: 1,
  emaShort: 5,
  emaLong: 20,
  accountType: "practice",
  mode: "mt5",
  v98Enabled: true,
  v98TrendEma: 200,
  dailyTradeLimit: 5,
  startHour: "13:00",
  endHour: "22:00",
  dailyProfitTarget: 1500.0, // 1500 บาท
  dailyLossLimit: 50.0
};

function getTargetInCurrency(target: number, currency: string = "USD"): number {
  const USD_THB_RATE = 34.0;
  // If target looks like THB (e.g. 1500) but account is USD, convert to USD
  if (target >= 500 && currency === "USD") {
    return Number((target / USD_THB_RATE).toFixed(2));
  }
  // If target looks like USD (e.g. 45 or 100) but account is THB, convert to THB
  if (target < 500 && currency === "THB") {
    return Number((target * USD_THB_RATE).toFixed(2));
  }
  return target;
}

let botStats: BotStats = {
  balance: 10000.0, // Practice starting balance for simulation
  totalTrades: 0,
  wins: 0,
  losses: 0,
  netProfit: 0,
  currentStep: 1,
  currency: "USD"
};

// Database storage setup
const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let users: Record<string, UserSession> = {};

function initDatabase() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    } catch (e) {
      console.error("Failed to parse users file", e);
      users = {};
    }
  }

  // Ensure default sessions are seeded
  if (!users["admin"]) {
    users["admin"] = {
      username: "admin",
      fullName: "ผู้ดูแลระบบ (Admin)",
      depositVerified: true,
      registeredAt: new Date().toISOString(),
      settings: { ...botSettings },
      stats: { ...botStats },
      trades: [],
      logs: [{ id: "l1", timestamp: new Date().toLocaleTimeString(), type: "info", message: "ระบบ Admin สตาร์ทเรียบร้อยแล้ว" }],
      dailyTradesCount: 0,
      dailyProfitLossAccumulated: 0
    };
  }

  // Seed sample users for beautiful Admin testing
  if (!users["62457573"]) {
    users["62457573"] = {
      username: "62457573",
      fullName: "สมเกียรติ รักการเทรด (XM)",
      depositVerified: true,
      registeredAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      settings: { ...botSettings, tradeAmount: 0.01, assetId: "XAUUSD" },
      stats: {
        balance: 5320.00,
        totalTrades: 12,
        wins: 8,
        losses: 4,
        netProfit: 145.20,
        currentStep: 1,
        currency: "USD"
      },
      trades: [
        {
          id: "t_sample_1",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: "CALL",
          amount: 0.02,
          entryPrice: 2420.50,
          exitPrice: 2422.30,
          status: "WIN",
          martingaleStep: 1,
          expiryTime: new Date(Date.now() - 3600000 + 60000).toISOString(),
          profit: 36.00,
          asset: "XAUUSD"
        }
      ],
      logs: [
        { id: "l_sample_1", timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(), type: "success", message: "[MT5] ออร์เดอร์ปิดแล้ว ชนะ! กำไร +36.00 USD (สะสมวันนี้ 36.00 USD)" }
      ],
      dailyTradesCount: 1,
      dailyProfitLossAccumulated: 36.00
    };
  }

  if (!users["51829031"]) {
    users["51829031"] = {
      username: "51829031",
      fullName: "วิชัย สมบัติทวี (XM)",
      depositVerified: false,
      registeredAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      settings: { ...botSettings, tradeAmount: 0.01, assetId: "EURUSD" },
      stats: {
        balance: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        netProfit: 0,
        currentStep: 1,
        currency: "USD"
      },
      trades: [],
      logs: [
        { id: "l_sample_2", timestamp: new Date(Date.now() - 3600000 * 4).toLocaleTimeString(), type: "info", message: "ลงทะเบียนสมาชิกสำเร็จ - รอการยืนยันเงินฝากขั้นต่ำ 3,500 บาท" }
      ],
      dailyTradesCount: 0,
      dailyProfitLossAccumulated: 0
    };
  }

  saveUsers();
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save users database", err);
  }
}

initDatabase();

// Daily risk limit states
let dailyTradesCount = 0;
let dailyProfitLossAccumulated = 0;
let lastResetDate = "";

function checkAndResetDailyLimits() {
  const todayStr = new Date().toISOString().split("T")[0];
  if (lastResetDate !== todayStr) {
    dailyTradesCount = 0;
    dailyProfitLossAccumulated = 0;
    lastResetDate = todayStr;
    addLog("info", `[Day Trade Limit] ขึ้นวันใหม่ (${todayStr}) รีเซ็ตยอดจำกัดการเทรดรายวัน`);
  }
}

function isWithinTradingWindow(): boolean {
  const startStr = botSettings.startHour || "13:00";
  const endStr = botSettings.endHour || "22:00";
  
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  
  const parseMinutes = (timeStr: string) => {
    const parts = timeStr.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };
  
  const startMin = parseMinutes(startStr);
  const endMin = parseMinutes(endStr);
  
  if (startMin <= endMin) {
    return currentMinutes >= startMin && currentMinutes <= endMin;
  } else {
    // Over midnight window
    return currentMinutes >= startMin || currentMinutes <= endMin;
  }
}

let trades: Trade[] = [];
let logs: LogEntry[] = [];
const candleHistoryMap = new Map<string, Candle[]>();
let connectionState: ConnectionState = {
  status: "disconnected",
  error: null
};

// MetaTrader 5 (MT5) Integration State
let mt5PendingSignals = new Map<string, { type: "CALL" | "PUT"; lotSize: number; tradeId: string; timestamp: number }>();
let mt5LastConnectedTime: number | null = null;

// Helper to log messages
function addLog(type: LogEntry["type"], message: string) {
  const log: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message
  };
  logs.unshift(log);
  if (logs.length > 200) logs.pop();
  broadcast({ type: "log", data: log });
}

// Generate beautiful historical candles for an asset
function getOrCreateCandleHistory(assetId: string): Candle[] {
  if (candleHistoryMap.has(assetId)) {
    return candleHistoryMap.get(assetId)!;
  }

  const asset = SUPPORTED_ASSETS.find(a => a.id === assetId) || SUPPORTED_ASSETS[0];
  const count = 100;
  const history: Candle[] = [];
  let currentPrice = asset.basePrice;
  const now = Math.floor(Date.now() / 1000);
  const oneMinute = 60;

  for (let i = count; i > 0; i--) {
    const candleTime = now - (i * oneMinute);
    const open = currentPrice;
    
    // Simulating ticks
    let high = open;
    let low = open;
    let close = open;
    for (let t = 0; t < 10; t++) {
      const change = (Math.random() - 0.5) * asset.volatility * 2;
      close += change;
      if (close > high) high = close;
      if (close < low) low = close;
    }
    
    history.push({
      time: candleTime,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      emaShort: null,
      emaLong: null
    });
    
    currentPrice = close;
  }

  calculateEMAs(history, botSettings.emaShort, botSettings.emaLong);
  candleHistoryMap.set(assetId, history);
  return history;
}

// EMA and RSI Indicator Calculation for 3-layered Strategy (Dual EMA + V98.3 + Maha-Thep RSI)
function calculateEMAs(candles: Candle[], shortPeriod: number, longPeriod: number) {
  if (candles.length === 0) return;

  const k13 = 2 / (13 + 1);
  const k34 = 2 / (34 + 1);
  const k50 = 2 / (50 + 1);
  const k200 = 2 / (200 + 1);

  let ema13 = candles[0].close;
  let ema34 = candles[0].close;
  let ema50 = candles[0].close;
  let ema200 = candles[0].close;

  candles[0].emaShort = Number(ema13.toFixed(5));
  candles[0].emaLong = Number(ema34.toFixed(5));
  (candles[0] as any).ema13 = Number(ema13.toFixed(5));
  (candles[0] as any).ema34 = Number(ema34.toFixed(5));
  (candles[0] as any).ema50 = Number(ema50.toFixed(5));
  (candles[0] as any).ema200 = Number(ema200.toFixed(5));
  (candles[0] as any).emaTrend = Number(ema200.toFixed(5));
  (candles[0] as any).rsi2 = 50.0;

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;
    ema13 = close * k13 + ema13 * (1 - k13);
    ema34 = close * k34 + ema34 * (1 - k34);
    ema50 = close * k50 + ema50 * (1 - k50);
    ema200 = close * k200 + ema200 * (1 - k200);

    candles[i].emaShort = Number(ema13.toFixed(5));
    candles[i].emaLong = Number(ema34.toFixed(5));
    (candles[i] as any).ema13 = Number(ema13.toFixed(5));
    (candles[i] as any).ema34 = Number(ema34.toFixed(5));
    (candles[i] as any).ema50 = Number(ema50.toFixed(5));
    (candles[i] as any).ema200 = Number(ema200.toFixed(5));
    (candles[i] as any).emaTrend = Number(ema200.toFixed(5));
  }

  // Calculate RSI with period 2 (Maha-Thep Entry)
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i === 1) {
      avgGain = gain;
      avgLoss = loss;
    } else {
      // Smoothed moving average for RSI(2)
      avgGain = (gain + avgGain) / 2;
      avgLoss = (loss + avgLoss) / 2;
    }

    if (avgLoss === 0) {
      (candles[i] as any).rsi2 = 100.0;
    } else {
      const rs = avgGain / avgLoss;
      (candles[i] as any).rsi2 = Number((100 - (100 / (1 + rs))).toFixed(2));
    }
  }
}

// Broadcast WebSocket Message to All Dashboard Clients
const clients = new Set<ClientWebSocket>();
const wsUsernames = new Map<ClientWebSocket, string>();

function broadcast(msg: { type: string; data: any }) {
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === ClientWebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Broadcast to a specific authenticated user
function userBroadcast(username: string, msg: { type: string; data: any }) {
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (wsUsernames.get(client) === username && client.readyState === ClientWebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Helper to log messages specifically to a user
function addUserLog(username: string, type: LogEntry["type"], message: string) {
  const log: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message
  };

  if (username === "admin") {
    logs.unshift(log);
    if (logs.length > 200) logs.pop();
    broadcast({ type: "log", data: log });
  } else if (users[username]) {
    users[username].logs.unshift(log);
    if (users[username].logs.length > 200) users[username].logs.pop();
    userBroadcast(username, { type: "log", data: log });
    saveUsers();
  }
}

// Initialize active candle history
getOrCreateCandleHistory(botSettings.assetId);

// Core Trading Bot Execution (Simulation Loop)
let simulationInterval: NodeJS.Timeout | null = null;

function startSimulationLoop() {
  if (simulationInterval) clearInterval(simulationInterval);
  
  addLog("info", "เริ่มต้นระบบเทรดอัตโนมัติ (โหมดจำลอง)");
  
  simulationInterval = setInterval(() => {
    if (!botSettings.isActive || botSettings.mode !== "simulation") return;
    
    const asset = SUPPORTED_ASSETS.find(a => a.id === botSettings.assetId) || SUPPORTED_ASSETS[0];
    const history = getOrCreateCandleHistory(botSettings.assetId);
    if (history.length === 0) return;
    
    const now = Math.floor(Date.now() / 1000);
    const activeCandle = history[history.length - 1];
    
    // Check if candle period (1-minute) has expired
    if (now >= activeCandle.time + 60) {
      // 1. Close current candle
      activeCandle.emaShort = Number(activeCandle.emaShort?.toFixed(5) || activeCandle.close.toFixed(5));
      activeCandle.emaLong = Number(activeCandle.emaLong?.toFixed(5) || activeCandle.close.toFixed(5));
      
      // 2. Perform Indicator Checks for 3-layered Strategy (Dual EMA + V98.3 EMA + Maha-Thep RSI)
      const ema13 = (activeCandle as any).ema13 || 0;
      const ema34 = (activeCandle as any).ema34 || 0;
      const ema50 = (activeCandle as any).ema50 || 0;
      const ema200 = (activeCandle as any).ema200 || 0;
      const rsi2 = (activeCandle as any).rsi2 ?? 50;

      let signal: "CALL" | "PUT" | null = null;
      if (ema50 && ema200 && ema13 && ema34 && rsi2 !== undefined) {
        // Dual EMA Trend Filter: Buy when EMA50 > 200, Sell when EMA50 < 200
        // V98.3 EMA (13/34): If EMA13 > 34, Buy only. If EMA13 < 34, Sell only.
        // Maha-Thep Entry (RSI 2): Buy when RSI(2) <= 10, Sell when RSI(2) >= 90.
        if (ema50 > ema200 && ema13 > ema34 && rsi2 <= 10) {
          signal = "CALL";
        } else if (ema50 < ema200 && ema13 < ema34 && rsi2 >= 90) {
          signal = "PUT";
        }
      }

      // Check if there is already a pending trade for this asset
      const hasPending = trades.some(t => t.status === "PENDING" && t.asset === asset.name);
      if (hasPending && signal) {
        addLog("info", `[ระบบอัจฉริยะ] มีออร์เดอร์ที่ยังไม่ปิดของ ${asset.name} ข้ามสัญญาณ ${signal} ชั่วคราวเพื่อความปลอดภัยสูงสุด`);
        signal = null;
      }

      if (signal) {
        checkAndResetDailyLimits();
        
        // A. Time Window Filter
        if (!isWithinTradingWindow()) {
          addLog("info", `[Maha-Thep] ข้ามสัญญาณ ${signal} เนื่องจากอยู่นอกเวลาเทรดที่กำหนด (${botSettings.startHour} - ${botSettings.endHour})`);
          signal = null;
        }
        
        // B. Day Trade Max Trades Limit
        else if (dailyTradesCount >= (botSettings.dailyTradeLimit ?? 5)) {
          addLog("info", `[Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดจำนวนเทรดต่อวันแล้ว (${botSettings.dailyTradeLimit} ไม้)`);
          signal = null;
        }
        
        // C. Daily Profit Target Limit
        else if (dailyProfitLossAccumulated >= getTargetInCurrency(botSettings.dailyProfitTarget ?? 1500, botStats.currency || "USD")) {
          const convertedTarget = getTargetInCurrency(botSettings.dailyProfitTarget ?? 1500, botStats.currency || "USD");
          addLog("success", `[Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงเป้าหมายกำไรรายวันแล้ว (+$${dailyProfitLossAccumulated.toFixed(2)} / เป้า $${convertedTarget.toFixed(2)} ${botStats.currency || "USD"})`);
          signal = null;
        }
        
        // D. Daily Loss Limit
        else if (dailyProfitLossAccumulated <= -(botSettings.dailyLossLimit ?? 50)) {
          addLog("error", `[Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดขาดทุนรายวันแล้ว (-$${Math.abs(dailyProfitLossAccumulated).toFixed(2)} / ลิมิต $${botSettings.dailyLossLimit})`);
          signal = null;
        }
        
        // E. Extra Logging for alignment verification
        if (signal) {
          addLog("success", `[Maha-Thep] สัญญาณ ${signal} ผ่านการกรอง 3 ชั้นเรียบร้อย! (EMA50/200 & EMA13/34 & RSI2)`);
        }
      }

      if (signal) {
        executeSimulatedTrade(signal, activeCandle.close, asset);
      }
      
      // 3. Resolve any pending trades that expire at this candle's close
      resolvePendingSimulatedTrades(activeCandle.close);
      
      // 4. Start next candle
      const newCandleTime = activeCandle.time + 60;
      const newCandle: Candle = {
        time: newCandleTime,
        open: activeCandle.close,
        high: activeCandle.close,
        low: activeCandle.close,
        close: activeCandle.close,
        emaShort: null,
        emaLong: null
      };
      
      history.push(newCandle);
      if (history.length > 100) history.shift();
      
      calculateEMAs(history, botSettings.emaShort, botSettings.emaLong);
      broadcast({ type: "candles", data: history });
      broadcast({ type: "stats", data: botStats });
    } else {
      // Candle is still ticking: Simulate price ticks
      const change = (Math.random() - 0.5) * asset.volatility * 2;
      const currentPrice = Number((activeCandle.close + change).toFixed(5));
      
      activeCandle.close = currentPrice;
      if (currentPrice > activeCandle.high) activeCandle.high = currentPrice;
      if (currentPrice < activeCandle.low) activeCandle.low = currentPrice;
      
      // Recalculate EMAs on the current ticking candle
      calculateEMAs(history, botSettings.emaShort, botSettings.emaLong);
      
      broadcast({ type: "tick", data: { 
        time: activeCandle.time,
        close: activeCandle.close,
        high: activeCandle.high,
        low: activeCandle.low,
        emaShort: activeCandle.emaShort,
        emaLong: activeCandle.emaLong
      }});
    }
  }, 1000);
}

function executeSimulatedTrade(type: "CALL" | "PUT", price: number, asset: Asset) {
  checkAndResetDailyLimits();
  dailyTradesCount++;
  
  const step = 1; // Martingale disabled, step is always 1
  const amount = botSettings.tradeAmount;
  
  if (botStats.balance < amount) {
    addLog("error", `ยอดเงินไม่พอสำหรับการเปิดออร์เดอร์ขนาด $${amount.toFixed(2)} (คงเหลือ $${botStats.balance.toFixed(2)})`);
    botSettings.isActive = false;
    broadcast({ type: "settings", data: botSettings });
    return;
  }
  
  // Deduct balance
  botStats.balance -= amount;
  
  const expiry = new Date(Date.now() + 60000).toLocaleTimeString();
  const tradeId = Math.random().toString(36).substring(2, 9);
  
  const newTrade: Trade = {
    id: tradeId,
    timestamp: new Date().toLocaleTimeString(),
    type,
    amount,
    entryPrice: price,
    exitPrice: null,
    status: "PENDING",
    martingaleStep: step,
    expiryTime: expiry,
    profit: null,
    asset: asset.name
  };
  
  trades.unshift(newTrade);
  if (trades.length > 50) trades.pop();
  
  addLog("trade", `เปิดออร์เดอร์จำลอง ${type} (${asset.name}) ขนาด $${amount.toFixed(2)} ที่ราคา ${price.toFixed(5)} (ล็อตคงที่)`);
  
  broadcast({ type: "trade_placed", data: newTrade });
  broadcast({ type: "stats", data: botStats });
}

function resolvePendingSimulatedTrades(closePrice: number) {
  let updated = false;
  
  trades.forEach(trade => {
    if (trade.status === "PENDING") {
      const isCallWin = trade.type === "CALL" && closePrice > trade.entryPrice;
      const isPutWin = trade.type === "PUT" && closePrice < trade.entryPrice;
      const isDraw = closePrice === trade.entryPrice;
      
      trade.exitPrice = closePrice;
      
      if (isDraw) {
        trade.status = "CANCELLED";
        trade.profit = 0;
        botStats.balance += trade.amount; // Refund
        addLog("info", `ออร์เดอร์ #${trade.id} เสมอ คืนเงิน $${trade.amount}`);
      } else if (isCallWin || isPutWin) {
        trade.status = "WIN";
        const profit = trade.amount * 0.90; // 90% payout
        trade.profit = profit;
        botStats.balance += trade.amount + profit;
        
        botStats.wins++;
        botStats.netProfit += profit;
        botStats.currentStep = 1; // Always 1
        
        dailyProfitLossAccumulated += profit;
        
        addLog("success", `ออร์เดอร์ #${trade.id} ชนะ! กำไร +$${profit.toFixed(2)} (สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
      } else {
        trade.status = "LOSS";
        trade.profit = -trade.amount;
        
        botStats.losses++;
        botStats.netProfit -= trade.amount;
        
        dailyProfitLossAccumulated -= trade.amount;
        botStats.currentStep = 1; // Always 1
        
        addLog("error", `ออร์เดอร์ #${trade.id} แพ้... ขาดทุน -$${trade.amount.toFixed(2)} (สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
      }
      botStats.totalTrades++;
      updated = true;
    }
  });
  
  if (updated) {
    broadcast({ type: "trades", data: trades });
    broadcast({ type: "stats", data: botStats });
  }
}

// Manage HTTP API and WebSocket upgrade - safely parse and clean JSON body
app.use(express.text({ type: "application/json" }));
app.use((req: any, res: any, next: any) => {
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      // Clean null bytes and any non-printable/trailing garbage
      let cleanBody = req.body.replace(/\0/g, "").trim();
      
      // Extract from the first '{' to the last '}' to handle any trailing garbage characters
      const firstBrace = cleanBody.indexOf('{');
      const lastBrace = cleanBody.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        cleanBody = cleanBody.substring(firstBrace, lastBrace + 1);
      }
      
      req.body = JSON.parse(cleanBody);
    } catch (err: any) {
      console.error("Failed to parse cleaned JSON:", err.message, "Original body length:", req.body.length);
      addLog("error", `[Server] ไม่สามารถแปลง JSON จาก EA ได้: ${err.message} (ข้อมูลดิบ: ${req.body.substring(0, 100)})`);
      return res.status(400).json({ error: "Invalid JSON format" });
    }
  } else if (typeof req.body !== "object") {
    // Fallback if body is empty or other type
    req.body = {};
  }
  next();
});

// MT5 Ticking & Signal Webhook Endpoint
app.post("/api/mt5/tick", (req, res) => {
  const { asset, price, ticket, action, profit, balance, currency, login } = req.body;
  if (!asset || typeof price !== "number") {
    return res.status(400).json({ error: "Invalid parameters" });
  }

  // Resolve current active session user
  let activeUser: any = null;
  let s_settings = botSettings;
  let s_stats = botStats;
  let s_trades = trades;
  let s_username = "admin";

  if (login && users[login.trim()]) {
    s_username = login.trim();
    activeUser = users[s_username];
    s_settings = activeUser.settings;
    s_stats = activeUser.stats;
    s_trades = activeUser.trades;
    activeUser.lastActiveAt = new Date().toISOString();
  }

  // Check depositVerified limit
  if (activeUser && !activeUser.depositVerified && s_settings.isActive) {
    addUserLog(s_username, "error", `[MT5] ระบบระงับสัญญาณเทรดเนื่องจากบัญชี MT5 #${s_username} ยังไม่ได้เปิดบัญชี/ยืนยันยอดฝากขั้นต่ำ 3,500 บาท`);
  }

  // Update MT5 Connection Status to Connected
  if (!activeUser) {
    mt5LastConnectedTime = Date.now();
    if (connectionState.status !== "connected" && botSettings.mode === "mt5") {
      connectionState = { status: "connected", error: null };
      broadcast({ type: "connection", data: connectionState });
      addLog("success", `[MT5] EA เชื่อมต่อสำเร็จสำหรับสินทรัพย์ ${asset}`);
    }
  } else {
    userBroadcast(s_username, {
      type: "connection",
      data: { status: "connected", error: null }
    });
  }

  // Sync real-time balance and currency from MT5 EA if provided
  let statsUpdated = false;
  if (typeof balance === "number") {
    if (s_stats.balance !== balance) {
      s_stats.balance = balance;
      statsUpdated = true;
    }
  }
  if (typeof currency === "string" && currency) {
    if (s_stats.currency !== currency) {
      s_stats.currency = currency;
      statsUpdated = true;
    }
  }
  if (statsUpdated) {
    if (activeUser) {
      userBroadcast(s_username, { type: "stats", data: s_stats });
      saveUsers();
    } else {
      broadcast({ type: "stats", data: botStats });
    }
  }

  // Map asset symbol if needed (e.g. "EURUSD.m" to "EURUSD")
  const normAsset = asset.replace(/[^A-Z]/gi, "").substring(0, 6).toUpperCase();
  let supportedAsset = SUPPORTED_ASSETS.find(a => normAsset.includes(a.id) || a.id.includes(normAsset));
  
  // Robust gold mapping fallback
  if (!supportedAsset && (normAsset.includes("GOLD") || normAsset.includes("XAU"))) {
    supportedAsset = SUPPORTED_ASSETS.find(a => a.id === "XAUUSD");
  }
  
  if (!supportedAsset) {
    supportedAsset = SUPPORTED_ASSETS[0];
  }

  const history = getOrCreateCandleHistory(supportedAsset.id);
  const now = Math.floor(Date.now() / 1000);
  const activeCandle = history[history.length - 1];

  if (activeCandle) {
    if (now >= activeCandle.time + 60) {
      // Close candle
      activeCandle.emaShort = Number(activeCandle.emaShort?.toFixed(5) || activeCandle.close.toFixed(5));
      activeCandle.emaLong = Number(activeCandle.emaLong?.toFixed(5) || activeCandle.close.toFixed(5));

      // Trigger Indicator check on candle close (3-layered strategy)
      if (s_settings.isActive && s_settings.mode === "mt5" && (!activeUser || activeUser.depositVerified)) {
        const ema13 = (activeCandle as any).ema13 || 0;
        const ema34 = (activeCandle as any).ema34 || 0;
        const ema50 = (activeCandle as any).ema50 || 0;
        const ema200 = (activeCandle as any).ema200 || 0;
        const rsi2 = (activeCandle as any).rsi2 ?? 50;

        let signal: "CALL" | "PUT" | null = null;
        if (ema50 && ema200 && ema13 && ema34 && rsi2 !== undefined) {
          // Dual EMA Trend Filter: Buy when EMA50 > 200, Sell when EMA50 < 200
          // V98.3 EMA (13/34): If EMA13 > 34, Buy only. If EMA13 < 34, Sell only.
          // Maha-Thep Entry (RSI 2): Buy when RSI(2) <= 10, Sell when RSI(2) >= 90.
          if (ema50 > ema200 && ema13 > ema34 && rsi2 <= 10) {
            signal = "CALL";
          } else if (ema50 < ema200 && ema13 < ema34 && rsi2 >= 90) {
            signal = "PUT";
          }
        }

        // Check if there is already a pending trade
        const s_trades = activeUser ? activeUser.trades : trades;
        const hasPending = s_trades.some(t => t.status === "PENDING" && t.asset === supportedAsset.name);
        if (hasPending && signal) {
          addUserLog(s_username, "info", `[ระบบอัจฉริยะ] มีออร์เดอร์ที่ยังไม่ปิดของ ${supportedAsset.name} ข้ามสัญญาณ ${signal} ชั่วคราวเพื่อความปลอดภัยสูงสุด`);
          signal = null;
        }

        if (signal) {
          // Check daily limits per user or globally
          let s_dailyTradesCount = activeUser ? activeUser.dailyTradesCount : dailyTradesCount;
          let s_dailyProfitLossAccumulated = activeUser ? activeUser.dailyProfitLossAccumulated : dailyProfitLossAccumulated;

          const startStr = s_settings.startHour || "13:00";
          const endStr = s_settings.endHour || "22:00";
          
          const nowTime = new Date();
          const currentMinutes = nowTime.getUTCHours() * 60 + nowTime.getUTCMinutes();
          
          const parseMinutes = (timeStr: string) => {
            const parts = timeStr.split(":");
            const h = parseInt(parts[0], 10) || 0;
            const m = parseInt(parts[1], 10) || 0;
            return h * 60 + m;
          };
          
          const startMin = parseMinutes(startStr);
          const endMin = parseMinutes(endStr);
          
          let withinWindow = false;
          if (startMin <= endMin) {
            withinWindow = currentMinutes >= startMin && currentMinutes <= endMin;
          } else {
            withinWindow = currentMinutes >= startMin || currentMinutes <= endMin;
          }

          // A. Time Window Filter
          if (!withinWindow) {
            addUserLog(s_username, "info", `[Maha-Thep] ข้ามสัญญาณ ${signal} เนื่องจากอยู่นอกเวลาเทรดที่กำหนด (${s_settings.startHour} - ${s_settings.endHour})`);
            signal = null;
          }

          // B. Day Trade Max Trades Limit
          else if (s_dailyTradesCount >= (s_settings.dailyTradeLimit ?? 5)) {
            addUserLog(s_username, "info", `[MT5 - Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดจำนวนไม้ต่อวันแล้ว (${s_settings.dailyTradeLimit} ไม้)`);
            signal = null;
          }

          // C. Daily Profit Target Limit
          else if (s_dailyProfitLossAccumulated >= getTargetInCurrency(s_settings.dailyProfitTarget ?? 1500, s_stats.currency || "USD")) {
            const cur = s_stats.currency || "USD";
            const convertedTarget = getTargetInCurrency(s_settings.dailyProfitTarget ?? 1500, cur);
            addUserLog(s_username, "success", `[MT5 - Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงเป้าหมายกำไรรายวันแล้ว (+${s_dailyProfitLossAccumulated.toFixed(2)} ${cur} / เป้า ${convertedTarget.toFixed(2)} ${cur})`);
            signal = null;
          }

          // D. Daily Loss Limit
          else if (s_dailyProfitLossAccumulated <= -(s_settings.dailyLossLimit ?? 50)) {
            const cur = s_stats.currency || "USD";
            addUserLog(s_username, "error", `[MT5 - Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดขาดทุนรายวันสูงสุดแล้ว (-${Math.abs(s_dailyProfitLossAccumulated).toFixed(2)} ${cur} / ลิมิต ${s_settings.dailyLossLimit} ${cur})`);
            signal = null;
          }

          // E. Extra Logging for alignment verification
          if (signal) {
            addUserLog(s_username, "success", `[Maha-Thep] สัญญาณ ${signal} ผ่านการกรอง 3 ชั้นเรียบร้อย! (EMA50/200 & EMA13/34 & RSI2)`);
          }

          if (signal) {
            if (activeUser) {
              activeUser.dailyTradesCount++;
            } else {
              dailyTradesCount++;
            }
            const step = 1; // Martingale disabled, step is always 1
            const lotSize = s_settings.tradeAmount;
            const tradeId = Math.random().toString(36).substring(2, 9);

            mt5PendingSignals.set(supportedAsset.id, {
              type: signal,
              lotSize: Number(lotSize.toFixed(3)) || 0.01,
              tradeId,
              timestamp: Date.now()
            });

            // Log pending trade on server
            const expiryString = new Date(Date.now() + 60000).toLocaleTimeString();
            const newTrade: Trade = {
              id: tradeId,
              timestamp: new Date().toLocaleTimeString(),
              type: signal,
              amount: lotSize,
              entryPrice: activeCandle.close,
              exitPrice: null,
              status: "PENDING",
              martingaleStep: step,
              expiryTime: expiryString,
              profit: null,
              asset: supportedAsset.name
            };

            s_trades.unshift(newTrade);
            if (s_trades.length > 50) s_trades.pop();

            addUserLog(s_username, "trade", `[MT5] สัญญาณ ${signal} (${supportedAsset.name}) ขนาด ${lotSize.toFixed(2)} Lot (ล็อตคงที่) รอให้ EA ใน MT5 เปิดออร์เดอร์`);
            
            if (activeUser) {
              userBroadcast(s_username, { type: "trade_placed", data: newTrade });
              userBroadcast(s_username, { type: "trades", data: s_trades });
              saveUsers();
            } else {
              broadcast({ type: "trade_placed", data: newTrade });
              broadcast({ type: "trades", data: s_trades });
            }
          }
        }
      }

      // Add new candle
      const newCandle: Candle = {
        time: activeCandle.time + 60,
        open: activeCandle.close,
        high: activeCandle.close,
        low: activeCandle.close,
        close: activeCandle.close,
        emaShort: null,
        emaLong: null
      };
      history.push(newCandle);
      if (history.length > 100) history.shift();
    } else {
      // Ticking
      activeCandle.close = price;
      if (price > activeCandle.high) activeCandle.high = price;
      if (price < activeCandle.low) activeCandle.low = price;
    }

    calculateEMAs(history, s_settings.emaShort, s_settings.emaLong);
    
    // Broadcast tick updates to user or globally
    if (activeUser) {
      userBroadcast(s_username, { type: "candles", data: history });
      userBroadcast(s_username, {
        type: "tick",
        data: {
          time: activeCandle.time,
          close: activeCandle.close,
          high: activeCandle.high,
          low: activeCandle.low,
          emaShort: activeCandle.emaShort,
          emaLong: activeCandle.emaLong
        }
      });
    } else {
      broadcast({ type: "candles", data: history });
      broadcast({
        type: "tick",
        data: {
          time: activeCandle.time,
          close: activeCandle.close,
          high: activeCandle.high,
          low: activeCandle.low,
          emaShort: activeCandle.emaShort,
          emaLong: activeCandle.emaLong
        }
      });
    }
  }

  // Handle trade reports
  if (action === "trade_opened") {
    addUserLog(s_username, "info", `[MT5] EA ยืนยันการเปิดออร์เดอร์สำเร็จ: ตั๋วเลขที่ #${ticket}`);
  } else if (action === "trade_closed" && typeof profit === "number") {
    const lastPendingTrade = s_trades.find(t => t.status === "PENDING" && t.asset === supportedAsset.name);
    if (lastPendingTrade) {
      lastPendingTrade.status = profit > 0 ? "WIN" : (profit < 0 ? "LOSS" : "CANCELLED");
      lastPendingTrade.exitPrice = price;
      lastPendingTrade.profit = profit;

      s_stats.totalTrades++;
      if (profit > 0) {
        s_stats.wins++;
        s_stats.netProfit += profit;
        s_stats.balance += profit;
        s_stats.currentStep = 1; // Always 1
        
        if (activeUser) {
          activeUser.dailyProfitLossAccumulated += profit;
        } else {
          dailyProfitLossAccumulated += profit;
        }
        
        const cur = s_stats.currency || "USD";
        const accumulated = activeUser ? activeUser.dailyProfitLossAccumulated : dailyProfitLossAccumulated;
        addUserLog(s_username, "success", `[MT5] ออร์เดอร์ปิดแล้ว ชนะ! กำไร +${profit.toFixed(2)} ${cur} (ล็อตคงที่ | สะสมวันนี้ ${accumulated.toFixed(2)} ${cur})`);
      } else if (profit < 0) {
        s_stats.losses++;
        s_stats.netProfit += profit;
        s_stats.balance += profit;
        s_stats.currentStep = 1; // Always 1
        
        if (activeUser) {
          activeUser.dailyProfitLossAccumulated += profit;
        } else {
          dailyProfitLossAccumulated += profit;
        }
        
        const cur = s_stats.currency || "USD";
        const accumulated = activeUser ? activeUser.dailyProfitLossAccumulated : dailyProfitLossAccumulated;
        addUserLog(s_username, "error", `[MT5] ออร์เดอร์ปิดแล้ว แพ้... ขาดทุน ${Math.abs(profit).toFixed(2)} ${cur} (ล็อตคงที่ | สะสมวันนี้ ${accumulated.toFixed(2)} ${cur})`);
      } else {
        addUserLog(s_username, "info", `[MT5] ออร์เดอร์ปิดแล้ว เสมอ/คืนทุน`);
      }

      if (activeUser) {
        userBroadcast(s_username, { type: "trades", data: s_trades });
        userBroadcast(s_username, { type: "stats", data: s_stats });
        saveUsers();
      } else {
        broadcast({ type: "trades", data: s_trades });
        broadcast({ type: "stats", data: s_stats });
      }
    }
  }

  // Check if there is a pending signal to send back
  const signalObj = mt5PendingSignals.get(supportedAsset.id);
  if (signalObj && Date.now() - signalObj.timestamp < 15000) {
    mt5PendingSignals.delete(supportedAsset.id);
    return res.json({
      signal: signalObj.type,
      lot_size: signalObj.lotSize,
      trade_id: signalObj.tradeId
    });
  }

  return res.json({ signal: "NONE", lot_size: 0, trade_id: "" });
});

// API Auth: Registration
app.post("/api/auth/register", (req, res) => {
  const { username, password, fullName } = req.body;
  
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }
  
  const trimmedUser = username.trim();
  
  if (users[trimmedUser]) {
    return res.status(400).json({ error: "หมายเลขบัญชี MT5 นี้เคยลงทะเบียนแล้ว" });
  }
  
  // Create user session with default structures
  users[trimmedUser] = {
    username: trimmedUser,
    fullName: fullName.trim(),
    depositVerified: false, // Default is false, wait for admin verification
    registeredAt: new Date().toISOString(),
    settings: {
      isActive: false,
      assetId: "XAUUSD",
      tradeAmount: 0.01,
      martingaleMultiplier: 2.5,
      maxMartingaleSteps: 3,
      emaShort: 5,
      emaLong: 20,
      accountType: "real", // default real for customers
      mode: "mt5",
      v98Enabled: true,
      v98TrendEma: 200,
      dailyTradeLimit: 5,
      startHour: "13:00",
      endHour: "22:00",
      dailyProfitTarget: 100.0,
      dailyLossLimit: 50.0
    },
    stats: {
      balance: 0.0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      netProfit: 0,
      currentStep: 1,
      currency: "USD"
    },
    trades: [],
    logs: [
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: "info",
        message: "ลงทะเบียนบัญชีใหม่สำเร็จเรียบร้อยแล้ว!"
      },
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: "info",
        message: "กรุณาเปิดบัญชีภายใต้ลิงก์พันธมิตรและฝากเงินขั้นต่ำ 3,500 บาท เพื่อเปิดการตรวจสอบระบบ"
      }
    ],
    dailyTradesCount: 0,
    dailyProfitLossAccumulated: 0
  };
  
  saveUsers();
  
  res.json({ success: true, username: trimmedUser });
});

// API Auth: Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }
  
  const trimmedUser = username.trim();
  
  if (!users[trimmedUser]) {
    return res.status(400).json({ error: "ไม่พบหมายเลขบัญชีหรือผู้ใช้นี้ในระบบ" });
  }
  
  res.json({
    success: true,
    user: {
      username: users[trimmedUser].username,
      fullName: users[trimmedUser].fullName,
      depositVerified: users[trimmedUser].depositVerified
    }
  });
});

// API Admin: List all members
app.get("/api/admin/users", (req, res) => {
  const list = Object.values(users).map(u => ({
    username: u.username,
    fullName: u.fullName,
    depositVerified: u.depositVerified,
    registeredAt: u.registeredAt,
    lastActiveAt: u.lastActiveAt,
    balance: u.stats.balance,
    currency: u.stats.currency,
    isActive: u.settings.isActive
  }));
  res.json(list);
});

// API Admin: Toggle Deposit Verified Status
app.post("/api/admin/toggle-deposit", (req, res) => {
  const { username } = req.body;
  if (!username || !users[username]) {
    return res.status(400).json({ error: "ไม่พบข้อมูลผู้ใช้งาน" });
  }
  
  users[username].depositVerified = !users[username].depositVerified;
  
  if (users[username].depositVerified) {
    addUserLog(username, "success", "บัญชีของคุณได้รับการยืนยันยอดฝากขั้นต่ำเรียบร้อยแล้ว! พร้อมเปิดระบบใช้งานส่งสัญญาณ");
  } else {
    addUserLog(username, "info", "บัญชีของคุณถูกปรับสถานะเป็นรอการตรวจสอบเงินฝาก");
  }
  
  saveUsers();
  userBroadcast(username, { type: "deposit_status", data: { verified: users[username].depositVerified } });
  
  res.json({ success: true, verified: users[username].depositVerified });
});

// API Admin: Delete user
app.post("/api/admin/delete-user", (req, res) => {
  const { username } = req.body;
  if (!username || !users[username]) {
    return res.status(400).json({ error: "ไม่พบข้อมูลผู้ใช้งาน" });
  }
  
  if (username === "admin") {
    return res.status(400).json({ error: "ไม่สามารถลบบัญชี Admin ได้" });
  }
  
  delete users[username];
  saveUsers();
  res.json({ success: true });
});

// API Status
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", botActive: botSettings.isActive });
});

// Setup Websocket server on HTTP Connection Upgrade
httpServer.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws: ClientWebSocket) => {
  clients.add(ws);
  
  // Immediately send initial state
  const currentHistory = getOrCreateCandleHistory(botSettings.assetId);
  ws.send(JSON.stringify({ type: "init", data: {
    settings: botSettings,
    stats: botStats,
    trades: trades,
    logs: logs,
    candles: currentHistory,
    connection: connectionState
  }}));
  
  ws.on("message", async (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const { type, data } = payload;
      
      const authenticatedUser = wsUsernames.get(ws);
      
      switch (type) {
        case "auth":
          if (data && data.username && users[data.username]) {
            const user = users[data.username];
            wsUsernames.set(ws, data.username);
            
            // Send user-specific initial state
            const userHistory = getOrCreateCandleHistory(user.settings.assetId);
            ws.send(JSON.stringify({ type: "init", data: {
              settings: user.settings,
              stats: user.stats,
              trades: user.trades,
              logs: user.logs,
              candles: userHistory,
              connection: {
                status: user.settings.isActive ? "connected" : "disconnected",
                error: null
              }
            }}));
          }
          break;
          
        case "start_bot":
          if (authenticatedUser && users[authenticatedUser]) {
            users[authenticatedUser].settings.isActive = true;
            userBroadcast(authenticatedUser, { type: "settings", data: users[authenticatedUser].settings });
            addUserLog(authenticatedUser, "info", "เปิดใช้งานบอทเทรดอัตโนมัติ");
            saveUsers();
          } else {
            botSettings.isActive = true;
            broadcast({ type: "settings", data: botSettings });
            addLog("info", "เปิดใช้งานบอทเทรดอัตโนมัติ");
          }
          break;
          
        case "stop_bot":
          if (authenticatedUser && users[authenticatedUser]) {
            users[authenticatedUser].settings.isActive = false;
            userBroadcast(authenticatedUser, { type: "settings", data: users[authenticatedUser].settings });
            addUserLog(authenticatedUser, "info", "หยุดทำงานบอทเทรดอัตโนมัติ");
            saveUsers();
          } else {
            botSettings.isActive = false;
            broadcast({ type: "settings", data: botSettings });
            addLog("info", "หยุดทำงานบอทเทรดอัตโนมัติ");
          }
          break;
          
        case "update_settings":
          if (authenticatedUser && users[authenticatedUser]) {
            const user = users[authenticatedUser];
            const prevAssetId = user.settings.assetId;
            user.settings = { ...user.settings, ...data };
            userBroadcast(authenticatedUser, { type: "settings", data: user.settings });
            
            if (prevAssetId !== user.settings.assetId) {
              const newHistory = getOrCreateCandleHistory(user.settings.assetId);
              userBroadcast(authenticatedUser, { type: "candles", data: newHistory });
            } else {
              const hist = getOrCreateCandleHistory(user.settings.assetId);
              calculateEMAs(hist, user.settings.emaShort, user.settings.emaLong);
              userBroadcast(authenticatedUser, { type: "candles", data: hist });
            }
            saveUsers();
          } else {
            const prevAssetId = botSettings.assetId;
            const prevMode = botSettings.mode;
            botSettings = { ...botSettings, ...data };
            broadcast({ type: "settings", data: botSettings });
            
            if (botSettings.mode !== prevMode) {
              if (botSettings.mode === "mt5") {
                connectionState = { status: "disconnected", error: null };
                broadcast({ type: "connection", data: connectionState });
                addLog("info", "สลับเข้าสู่โหมด MetaTrader 5 (MT5) - รอการเชื่อมต่อจาก EA");
              } else if (botSettings.mode === "simulation") {
                connectionState = { status: "disconnected", error: null };
                broadcast({ type: "connection", data: connectionState });
                addLog("info", "สลับเข้าสู่โหมดจำลอง (Simulation)");
              }
            }
            
            if (prevAssetId !== botSettings.assetId) {
              const newHistory = getOrCreateCandleHistory(botSettings.assetId);
              broadcast({ type: "candles", data: newHistory });
            } else {
              const hist = getOrCreateCandleHistory(botSettings.assetId);
              calculateEMAs(hist, botSettings.emaShort, botSettings.emaLong);
              broadcast({ type: "candles", data: hist });
            }
          }
          break;
          
        case "reset_stats":
          if (authenticatedUser && users[authenticatedUser]) {
            const user = users[authenticatedUser];
            user.stats = {
              balance: 10000.0,
              totalTrades: 0,
              wins: 0,
              losses: 0,
              netProfit: 0,
              currentStep: 1,
              currency: "USD"
            };
            user.trades = [];
            user.logs = [];
            addUserLog(authenticatedUser, "info", "รีเซ็ตสถิติและการทำงานเรียบร้อยแล้ว");
            userBroadcast(authenticatedUser, { type: "stats", data: user.stats });
            userBroadcast(authenticatedUser, { type: "trades", data: user.trades });
            userBroadcast(authenticatedUser, { type: "logs", data: user.logs });
            saveUsers();
          } else {
            botStats = {
              balance: 10000.0,
              totalTrades: 0,
              wins: 0,
              losses: 0,
              netProfit: 0,
              currentStep: 1,
              currency: "USD"
            };
            trades = [];
            logs = [];
            addLog("info", "รีเซ็ตสถิติและการทำงานเรียบร้อยแล้ว");
            broadcast({ type: "stats", data: botStats });
            broadcast({ type: "trades", data: trades });
            broadcast({ type: "logs", data: logs });
          }
          break;
      }
    } catch (err) {
      console.error("Error processing websocket event", err);
    }
  });
  
  ws.on("close", () => {
    clients.delete(ws);
    wsUsernames.delete(ws);
  });
});

// Start Simulation background loop initially
startSimulationLoop();

// Background check for MT5 liveness
setInterval(() => {
  if (botSettings.mode === "mt5") {
    const isAlive = mt5LastConnectedTime !== null && (Date.now() - mt5LastConnectedTime < 15000);
    const targetStatus = isAlive ? "connected" : "disconnected";
    if (connectionState.status !== targetStatus) {
      connectionState = { 
        status: targetStatus, 
        error: isAlive ? null : "ขาดการเชื่อมต่อกับ EA ใน MT5" 
      };
      broadcast({ type: "connection", data: connectionState });
    }
  }
}, 5000);

// Integrate Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
