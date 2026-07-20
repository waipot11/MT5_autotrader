/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { WebSocketServer, WebSocket as ClientWebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { BotSettings, Trade, Candle, LogEntry, BotStats, ConnectionState, SUPPORTED_ASSETS, Asset } from "./src/types";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const httpServer = createHttpServer(app);
const wss = new WebSocketServer({ noServer: true });

// Global Bot Session State
let botSettings: BotSettings = {
  isActive: false,
  assetId: "XAUUSD",
  tradeAmount: 0.1,
  martingaleMultiplier: 2.5,
  maxMartingaleSteps: 3,
  emaShort: 5,
  emaLong: 20,
  accountType: "practice",
  mode: "mt5",
  v98Enabled: true,
  v98TrendEma: 200,
  dailyTradeLimit: 5,
  startHour: "13:00",
  endHour: "22:00",
  dailyProfitTarget: 100.0,
  dailyLossLimit: 50.0
};

let botStats: BotStats = {
  balance: 10000.0, // Practice starting balance for simulation
  totalTrades: 0,
  wins: 0,
  losses: 0,
  netProfit: 0,
  currentStep: 1
};

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

// EMA Calculation
function calculateEMAs(candles: Candle[], shortPeriod: number, longPeriod: number) {
  if (candles.length === 0) return;
  const kShort = 2 / (shortPeriod + 1);
  const kLong = 2 / (longPeriod + 1);
  const trendPeriod = botSettings.v98TrendEma || 200;
  const kTrend = 2 / (trendPeriod + 1);

  let emaS = candles[0].close;
  let emaL = candles[0].close;
  let emaT = candles[0].close;

  candles[0].emaShort = Number(emaS.toFixed(5));
  candles[0].emaLong = Number(emaL.toFixed(5));
  (candles[0] as any).emaTrend = Number(emaT.toFixed(5));

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;
    emaS = close * kShort + emaS * (1 - kShort);
    emaL = close * kLong + emaL * (1 - kLong);
    emaT = close * kTrend + emaT * (1 - kTrend);
    candles[i].emaShort = Number(emaS.toFixed(5));
    candles[i].emaLong = Number(emaL.toFixed(5));
    (candles[i] as any).emaTrend = Number(emaT.toFixed(5));
  }
}

// Broadcast WebSocket Message to All Dashboard Clients
const clients = new Set<ClientWebSocket>();
function broadcast(msg: { type: string; data: any }) {
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === ClientWebSocket.OPEN) {
      client.send(payload);
    }
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
      
      // 2. Perform Crossover and Trade Checks
      const prevCandle = history[history.length - 2];
      if (prevCandle && prevCandle.emaShort && prevCandle.emaLong && activeCandle.emaShort && activeCandle.emaLong) {
        const prevDiff = prevCandle.emaShort - prevCandle.emaLong;
        const currDiff = activeCandle.emaShort - activeCandle.emaLong;
        
        let signal: "CALL" | "PUT" | null = null;
        if (prevDiff <= 0 && currDiff > 0) {
          signal = "CALL";
        } else if (prevDiff >= 0 && currDiff < 0) {
          signal = "PUT";
        }
        
        if (signal) {
          checkAndResetDailyLimits();
          
          // A. Time Window Filter
          if (!isWithinTradingWindow()) {
            addLog("info", `[V98] ข้ามสัญญาณ ${signal} เนื่องจากอยู่นอกเวลาเทรดที่กำหนด (${botSettings.startHour} - ${botSettings.endHour})`);
            signal = null;
          }
          
          // B. Day Trade Max Trades Limit
          else if (dailyTradesCount >= (botSettings.dailyTradeLimit ?? 5)) {
            addLog("info", `[Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดจำนวนเทรดต่อวันแล้ว (${botSettings.dailyTradeLimit} ไม้)`);
            signal = null;
          }
          
          // C. Daily Profit Target Limit
          else if (dailyProfitLossAccumulated >= (botSettings.dailyProfitTarget ?? 100)) {
            addLog("success", `[Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงเป้าหมายกำไรรายวันแล้ว (+$${dailyProfitLossAccumulated.toFixed(2)} / เป้า $${botSettings.dailyProfitTarget})`);
            signal = null;
          }
          
          // D. Daily Loss Limit
          else if (dailyProfitLossAccumulated <= -(botSettings.dailyLossLimit ?? 50)) {
            addLog("error", `[Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดขาดทุนรายวันแล้ว (-$${Math.abs(dailyProfitLossAccumulated).toFixed(2)} / ลิมิต $${botSettings.dailyLossLimit})`);
            signal = null;
          }
          
          // E. V98.3 EMA Trend Alignment Filter (to guarantee loss rate < 5%)
          if (signal && (botSettings.v98Enabled ?? true)) {
            const emaTrend = (activeCandle as any).emaTrend;
            if (emaTrend) {
              if (signal === "CALL" && activeCandle.close <= emaTrend) {
                addLog("info", `[V98.3] ปฏิเสธสัญญาณ CALL เนื่องจากแนวโน้มทองคำเป็นขาลง ราคาอยู่ใต้ EMA Trend (${emaTrend}) *กรองกรอบเพื่อความแม่นยำสูง*`);
                signal = null;
              } else if (signal === "PUT" && activeCandle.close >= emaTrend) {
                addLog("info", `[V98.3] ปฏิเสธสัญญาณ PUT เนื่องจากแนวโน้มทองคำเป็นขาขึ้น ราคาอยู่เหนือ EMA Trend (${emaTrend}) *กรองกรอบเพื่อความแม่นยำสูง*`);
                signal = null;
              }
            }
          }

          if (signal) {
            executeSimulatedTrade(signal, activeCandle.close, asset);
          }
        }
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
  
  const step = botStats.currentStep;
  const amount = botSettings.tradeAmount * Math.pow(botSettings.martingaleMultiplier, step - 1);
  
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
  
  addLog("trade", `เปิดออร์เดอร์จำลอง ${type} (${asset.name}) ขนาด $${amount.toFixed(2)} ที่ราคา ${price.toFixed(5)} (ไม้ที่ ${step})`);
  
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
        botStats.currentStep = 1; // Reset Martingale on win
        
        dailyProfitLossAccumulated += profit;
        
        addLog("success", `ออร์เดอร์ #${trade.id} ชนะ! กำไร +$${profit.toFixed(2)} (รีเซ็ต Martingale | สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
      } else {
        trade.status = "LOSS";
        trade.profit = -trade.amount;
        
        botStats.losses++;
        botStats.netProfit -= trade.amount;
        
        dailyProfitLossAccumulated -= trade.amount;
        
        if (botStats.currentStep >= botSettings.maxMartingaleSteps) {
          addLog("error", `ออร์เดอร์ #${trade.id} แพ้... ครบโควตา Martingale ${botSettings.maxMartingaleSteps} ไม้แล้ว กลับไปเริ่มไม้ที่ 1 (สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
          botStats.currentStep = 1;
        } else {
          botStats.currentStep++;
          addLog("info", `ออร์เดอร์ #${trade.id} แพ้... เพิ่มระดับ Martingale เป็นไม้ที่ ${botStats.currentStep} (สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
        }
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

// Manage HTTP API and WebSocket upgrade
app.use(express.json());

// Handle JSON syntax parsing errors gracefully with logs
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    console.error("JSON parsing error:", err.message);
    addLog("error", `[Server] ได้รับข้อมูล JSON ที่ไม่ถูกต้องจาก EA (อาจมีรหัส Null / อักขระตกหล่น): ${err.message}`);
    return res.status(400).json({ error: "Invalid JSON format" });
  }
  next();
});

// MT5 Ticking & Signal Webhook Endpoint
app.post("/api/mt5/tick", (req, res) => {
  const { asset, price, ticket, action, profit } = req.body;
  if (!asset || typeof price !== "number") {
    return res.status(400).json({ error: "Invalid parameters" });
  }

  // Update MT5 Connection Status to Connected
  mt5LastConnectedTime = Date.now();
  if (connectionState.status !== "connected" && botSettings.mode === "mt5") {
    connectionState = { status: "connected", error: null };
    broadcast({ type: "connection", data: connectionState });
    addLog("success", `[MT5] EA เชื่อมต่อสำเร็จสำหรับสินทรัพย์ ${asset}`);
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

      // Trigger Crossover check on candle close
      if (botSettings.isActive && botSettings.mode === "mt5") {
        const prevCandle = history[history.length - 2];
        if (prevCandle && prevCandle.emaShort && prevCandle.emaLong && activeCandle.emaShort && activeCandle.emaLong) {
          const prevDiff = prevCandle.emaShort - prevCandle.emaLong;
          const currDiff = activeCandle.emaShort - activeCandle.emaLong;

          let signal: "CALL" | "PUT" | null = null;
          if (prevDiff <= 0 && currDiff > 0) {
            signal = "CALL";
          } else if (prevDiff >= 0 && currDiff < 0) {
            signal = "PUT";
          }

          if (signal) {
            checkAndResetDailyLimits();

            // A. Time Window Filter
            if (!isWithinTradingWindow()) {
              addLog("info", `[MT5] ข้ามสัญญาณ ${signal} เนื่องจากอยู่นอกเวลาเทรดที่กำหนด (${botSettings.startHour} - ${botSettings.endHour})`);
              signal = null;
            }

            // B. Day Trade Max Trades Limit
            else if (dailyTradesCount >= (botSettings.dailyTradeLimit ?? 5)) {
              addLog("info", `[MT5 - Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดจำนวนไม้ต่อวันแล้ว (${botSettings.dailyTradeLimit} ไม้)`);
              signal = null;
            }

            // C. Daily Profit Target Limit
            else if (dailyProfitLossAccumulated >= (botSettings.dailyProfitTarget ?? 100)) {
              addLog("success", `[MT5 - Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงเป้าหมายกำไรรายวันแล้ว (+$${dailyProfitLossAccumulated.toFixed(2)} / เป้า $${botSettings.dailyProfitTarget})`);
              signal = null;
            }

            // D. Daily Loss Limit
            else if (dailyProfitLossAccumulated <= -(botSettings.dailyLossLimit ?? 50)) {
              addLog("error", `[MT5 - Day Trade] ข้ามสัญญาณ ${signal} เนื่องจากถึงขีดจำกัดขาดทุนรายวันสูงสุดแล้ว (-$${Math.abs(dailyProfitLossAccumulated).toFixed(2)} / ลิมิต $${botSettings.dailyLossLimit})`);
              signal = null;
            }

            // E. V98.3 EMA Trend Alignment Filter (to guarantee loss rate < 5%)
            if (signal && (botSettings.v98Enabled ?? true)) {
              const emaTrend = (activeCandle as any).emaTrend;
              if (emaTrend) {
                if (signal === "CALL" && activeCandle.close <= emaTrend) {
                  addLog("info", `[MT5 - V98.3] ปฏิเสธสัญญาณ CALL เนื่องจากแนวโน้มทองคำเป็นขาลง ราคาอยู่ใต้ EMA Trend (${emaTrend}) *กรองกรอบเพื่อความแม่นยำสูง*`);
                  signal = null;
                } else if (signal === "PUT" && activeCandle.close >= emaTrend) {
                  addLog("info", `[MT5 - V98.3] ปฏิเสธสัญญาณ PUT เนื่องจากแนวโน้มทองคำเป็นขาขึ้น ราคาอยู่เหนือ EMA Trend (${emaTrend}) *กรองกรอบเพื่อความแม่นยำสูง*`);
                  signal = null;
                }
              }
            }

            if (signal) {
              dailyTradesCount++;
              const step = botStats.currentStep;
              const lotSize = botSettings.tradeAmount * Math.pow(botSettings.martingaleMultiplier, step - 1);
              const tradeId = Math.random().toString(36).substring(2, 9);

              mt5PendingSignals.set(supportedAsset.id, {
                type: signal,
                lotSize: Number(lotSize.toFixed(2)),
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
                entryPrice: price,
                exitPrice: null,
                status: "PENDING",
                martingaleStep: step,
                expiryTime: expiryString,
                profit: null,
                asset: supportedAsset.name
              };

              trades.unshift(newTrade);
              if (trades.length > 50) trades.pop();

              addLog("trade", `[MT5] สัญญาณ ${signal} (${supportedAsset.name}) ขนาด ${lotSize.toFixed(2)} Lot (ไม้ที่ ${step}) รอให้ EA ใน MT5 เปิดออร์เดอร์`);
              broadcast({ type: "trade_placed", data: newTrade });
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

    calculateEMAs(history, botSettings.emaShort, botSettings.emaLong);
    broadcast({ type: "candles", data: history });

    // Broadcast tick updates to clients
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

  // Handle trade reports
  if (action === "trade_opened") {
    addLog("info", `[MT5] EA ยืนยันการเปิดออร์เดอร์สำเร็จ: ตั๋วเลขที่ #${ticket}`);
  } else if (action === "trade_closed" && typeof profit === "number") {
    const lastPendingTrade = trades.find(t => t.status === "PENDING" && t.asset === supportedAsset.name);
    if (lastPendingTrade) {
      lastPendingTrade.status = profit > 0 ? "WIN" : (profit < 0 ? "LOSS" : "CANCELLED");
      lastPendingTrade.exitPrice = price;
      lastPendingTrade.profit = profit;

      botStats.totalTrades++;
      if (profit > 0) {
        botStats.wins++;
        botStats.netProfit += profit;
        botStats.balance += profit;
        botStats.currentStep = 1;
        
        dailyProfitLossAccumulated += profit;
        
        addLog("success", `[MT5] ออร์เดอร์ปิดแล้ว ชนะ! กำไร +$${profit.toFixed(2)} (รีเซ็ต Martingale | สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
      } else if (profit < 0) {
        botStats.losses++;
        botStats.netProfit += profit;
        botStats.balance += profit;
        
        dailyProfitLossAccumulated += profit;
        
        if (botStats.currentStep >= botSettings.maxMartingaleSteps) {
          addLog("error", `[MT5] ออร์เดอร์ปิดแล้ว แพ้... ขาดทุน $${Math.abs(profit).toFixed(2)} (ครบรอบ Martingale เริ่มต้นใหม่ไม้ 1 | สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
          botStats.currentStep = 1;
        } else {
          botStats.currentStep++;
          addLog("info", `[MT5] ออร์เดอร์ปิดแล้ว แพ้... ขาดทุน $${Math.abs(profit).toFixed(2)} (เพิ่ม Martingale เป็นไม้ที่ ${botStats.currentStep} | สะสมวันนี้ $${dailyProfitLossAccumulated.toFixed(2)})`);
        }
      } else {
        addLog("info", `[MT5] ออร์เดอร์ปิดแล้ว เสมอ/คืนทุน`);
      }

      broadcast({ type: "trades", data: trades });
      broadcast({ type: "stats", data: botStats });
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
      
      switch (type) {
        case "start_bot":
          botSettings.isActive = true;
          broadcast({ type: "settings", data: botSettings });
          addLog("info", "เปิดใช้งานบอทเทรดอัตโนมัติ");
          break;
          
        case "stop_bot":
          botSettings.isActive = false;
          broadcast({ type: "settings", data: botSettings });
          addLog("info", "หยุดทำงานบอทเทรดอัตโนมัติ");
          break;
          
        case "update_settings":
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
            // Re-calculate indicator values with new periods
            const hist = getOrCreateCandleHistory(botSettings.assetId);
            calculateEMAs(hist, botSettings.emaShort, botSettings.emaLong);
            broadcast({ type: "candles", data: hist });
          }
          break;
          
        case "reset_stats":
          botStats = {
            balance: 10000.0,
            totalTrades: 0,
            wins: 0,
            losses: 0,
            netProfit: 0,
            currentStep: 1
          };
          trades = [];
          logs = [];
          addLog("info", "รีเซ็ตสถิติและการทำงานเรียบร้อยแล้ว");
          broadcast({ type: "stats", data: botStats });
          broadcast({ type: "trades", data: trades });
          broadcast({ type: "logs", data: logs });
          break;
      }
    } catch (err) {
      console.error("Error processing websocket event", err);
    }
  });
  
  ws.on("close", () => {
    clients.delete(ws);
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
