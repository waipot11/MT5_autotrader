/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BotSettings, Trade, Candle, LogEntry, BotStats, ConnectionState, SUPPORTED_ASSETS } from './types';
import { MetricCard } from './components/MetricCard';
import { BotControls } from './components/BotControls';
import { TradingChart } from './components/TradingChart';
import { ActivityLogs } from './components/ActivityLogs';
import { MT5Panel } from './components/MT5Panel';
import { Wallet, Award, Activity, RotateCcw, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

export default function App() {
  const [settings, setSettings] = useState<BotSettings>({
    isActive: false,
    assetId: 'XAUUSD',
    tradeAmount: 0.01,
    martingaleMultiplier: 2.5,
    maxMartingaleSteps: 3,
    emaShort: 5,
    emaLong: 20,
    accountType: 'practice',
    mode: 'mt5',
    v98Enabled: true,
    v98TrendEma: 200,
    dailyTradeLimit: 5,
    startHour: '13:00',
    endHour: '22:00',
    dailyProfitTarget: 100.0,
    dailyLossLimit: 50.0,
  });

  const [stats, setStats] = useState<BotStats>({
    balance: 10000.0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    netProfit: 0,
    currentStep: 1,
    currency: 'USD',
  });

  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'disconnected',
    error: null,
  });

  const [clientConnected, setClientConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to backend WebSocket
  const connectWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Connecting to backend WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setClientConnected(true);
      console.log('Backend WebSocket connected!');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        switch (type) {
          case 'init':
            setSettings(data.settings);
            setStats(data.stats);
            setTrades(data.trades);
            setLogs(data.logs);
            setCandles(data.candles);
            setConnection(data.connection);
            break;
          case 'settings':
            setSettings(data);
            break;
          case 'stats':
            setStats(data);
            break;
          case 'candles':
            setCandles(data);
            break;
          case 'tick':
            // Real-time ticking candle
            setCandles((prev) => {
              if (prev.length === 0) return prev;
              const nextCandles = [...prev];
              const lastIdx = nextCandles.length - 1;
              nextCandles[lastIdx] = {
                ...nextCandles[lastIdx],
                close: data.close,
                high: data.high,
                low: data.low,
                emaShort: data.emaShort,
                emaLong: data.emaLong,
              };
              return nextCandles;
            });
            break;
          case 'trade_placed':
            setTrades((prev) => [data, ...prev]);
            break;
          case 'trades':
            setTrades(data);
            break;
          case 'log':
            setLogs((prev) => [data, ...prev]);
            break;
          case 'logs':
            setLogs(data);
            break;
          case 'connection':
            setConnection(data);
            break;
        }
      } catch (err) {
        console.error('Error parsing backend WS message:', err);
      }
    };

    ws.onclose = () => {
      setClientConnected(false);
      console.log('Backend WebSocket closed. Attempting reconnect...');
      triggerClientReconnect();
    };

    ws.onerror = (err) => {
      console.error('Backend WebSocket error:', err);
    };
  };

  const triggerClientReconnect = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      connectWebSocket();
    }, 3000);
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  // Helper to send events to server
  const sendEvent = (type: string, data?: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, data }));
    }
  };

  const handleUpdateSettings = (updated: Partial<BotSettings>) => {
    sendEvent('update_settings', updated);
  };

  const handleToggleBot = () => {
    if (settings.isActive) {
      sendEvent('stop_bot');
    } else {
      sendEvent('start_bot');
    }
  };

  const handleSelectMT5Mode = () => {
    handleUpdateSettings({ mode: 'mt5' });
  };

  const handleClearLogs = () => {
    sendEvent('reset_stats');
  };

  const getWinRate = () => {
    if (stats.totalTrades === 0) return '0%';
    return `${Math.round((stats.wins / stats.totalTrades) * 100)}%`;
  };

  const formatCurrency = (val: number) => {
    const symbol = stats.currency === 'THB' ? '฿' : (stats.currency === 'USD' ? '$' : (stats.currency || '$'));
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${isNegative ? '-' : ''}${symbol}${formatted}`;
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col selection:bg-indigo-500/30">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 font-sans">
                MT5 EA GOLD AUTO-TRADER
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-medium px-1.5 py-0.5 rounded tracking-wide font-mono">
                  v3.0
                </span>
              </h1>
              <p className="text-[10px] text-slate-500 font-medium">
                ระบบบอทเทรดทองคำอัจฉริยะ (Indicator EMA Cross + Martingale + V98.3 Golden Trend Logic)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Server Status Icon */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${clientConnected ? 'bg-emerald-500 active-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-slate-400 font-medium select-none uppercase tracking-wide">
                เซิร์ฟเวอร์บอท: {clientConnected ? 'ออนไลน์' : 'ออฟไลน์'}
              </span>
            </div>

            {/* Global Reset */}
            <button
              id="reset_all_stats_button"
              type="button"
              onClick={handleClearLogs}
              className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-md text-[10px] font-bold text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              ล้างสถิติทั้งหมด
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex flex-col gap-6">
        
        {/* Metric Cards Banner */}
        <div id="stats-banner" className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            id="metric_balance"
            title={settings.mode === 'simulation' ? 'จำลองบาลานซ์ (Balance)' : 'กำไร/ยอดบาลานซ์ MT5'}
            value={formatCurrency(stats.balance)}
            subtitle={settings.mode === 'simulation' ? 'โหมดจำลอง (Demo)' : `ดึงบัญชีจริง (${stats.currency || 'USD'})`}
            icon={Wallet}
            color="indigo"
          />
          <MetricCard
            id="metric_winrate"
            title="อัตราชนะ (Win Rate)"
            value={getWinRate()}
            subtitle={`${stats.wins} ชนะ / ${stats.losses} แพ้`}
            icon={Award}
            color="emerald"
          />
          <MetricCard
            id="metric_netprofit"
            title="กำไรสุทธิ (Net Profit)"
            value={(stats.netProfit >= 0 ? '+' : '') + formatCurrency(stats.netProfit)}
            subtitle="หักลบค่าคอมมิชชั่น 10%"
            icon={Activity}
            color={stats.netProfit >= 0 ? 'emerald' : 'rose'}
          />
          <MetricCard
            id="metric_totaltrades"
            title="สัญญาทั้งหมด (Trades)"
            value={stats.totalTrades}
            subtitle="จำนวนออร์เดอร์ที่ปิดแล้ว"
            icon={Activity}
            color="indigo"
          />
          <MetricCard
            id="metric_currentstep"
            title="ระดับตัวคูณ (Martingale)"
            value={`ไม้ที่ ${stats.currentStep}`}
            subtitle={`ขนาดล็อตถัดไป ${(settings.tradeAmount * Math.pow(settings.martingaleMultiplier, stats.currentStep - 1)).toFixed(settings.mode === 'mt5' ? 2 : 1)} ${settings.mode === 'mt5' ? 'Lot' : 'USD'}`}
            icon={AlertTriangle}
            color={stats.currentStep > 1 ? 'amber' : 'slate'}
          />
        </div>

        {/* Dynamic Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (Width: 4/12) -> Controls and Connections */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <BotControls
              id="bot_controls_panel"
              settings={settings}
              onUpdate={handleUpdateSettings}
              onToggleActive={handleToggleBot}
            />

            <MT5Panel
              id="mt5_connection_panel"
              connection={connection}
              settings={settings}
              onSelectMT5Mode={handleSelectMT5Mode}
            />
          </div>

          {/* Right Column (Width: 7/12) -> Live Trading Chart and Log Terminals */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Live Trading Chart Widget */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col gap-3">
              <TradingChart
                id="live_trading_chart"
                candles={candles}
                activeAssetId={settings.assetId}
              />
            </div>

            {/* Terminal logs */}
            <ActivityLogs
              id="system_activity_logs"
              logs={logs}
              onClear={handleClearLogs}
            />

            {/* Recent Orders History Panel */}
            <div id="recent_trades_panel" className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col gap-3">
              <div className="border-b border-slate-800/80 pb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  ประวัติออร์เดอร์ที่เพิ่งดำเนินการ (Recent Orders)
                </h2>
                <span className="text-xxs text-slate-500 font-medium">แสดงล่าสุด 50 รายการ</span>
              </div>

              <div className="overflow-x-auto max-h-[220px]">
                <table className="w-full text-left border-collapse text-xxs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-slate-500">
                      <th className="py-2 font-medium">เวลาเริ่ม</th>
                      <th className="py-2 font-medium">สินทรัพย์</th>
                      <th className="py-2 font-medium">ทิศทาง</th>
                      <th className="py-2 font-medium">ขนาดไม้</th>
                      <th className="py-2 font-medium">ราคาเปิด</th>
                      <th className="py-2 font-medium">ราคาปิด</th>
                      <th className="py-2 font-medium">ไม้ที่</th>
                      <th className="py-2 font-medium">สถานะ</th>
                      <th className="py-2 font-medium text-right">กำไร/ขาดทุน</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {trades.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-4 text-center text-slate-600 italic">
                            ไม่มีออร์เดอร์ประวัติการเทรดในเซสชันนี้
                          </td>
                        </tr>
                      ) : (
                        trades.map((trade) => (
                          <motion.tr
                            key={trade.id}
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="border-b border-slate-900/40 hover:bg-slate-900/10"
                          >
                            <td className="py-2 text-slate-400">{trade.timestamp}</td>
                            <td className="py-2 font-bold text-slate-300">{trade.asset}</td>
                            <td className="py-2">
                              <span className={`px-1.5 py-0.5 rounded font-bold text-xxs ${
                                trade.type === 'CALL'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {trade.type}
                              </span>
                            </td>
                            <td className="py-2 text-slate-300 font-semibold">
                              {trade.amount.toFixed(2)} Lot
                            </td>
                            <td className="py-2 text-slate-400">{trade.entryPrice.toFixed(5)}</td>
                            <td className="py-2 text-slate-400">
                              {trade.exitPrice !== null ? trade.exitPrice.toFixed(5) : '-'}
                            </td>
                            <td className="py-2 text-slate-400">{trade.martingaleStep}</td>
                            <td className="py-2">
                              <span className={`font-bold ${
                                trade.status === 'WIN'
                                  ? 'text-emerald-400'
                                  : trade.status === 'LOSS'
                                  ? 'text-rose-400'
                                  : trade.status === 'PENDING'
                                  ? 'text-amber-400 animate-pulse'
                                  : 'text-slate-400'
                              }`}>
                                {trade.status === 'WIN' ? 'WIN' : trade.status === 'LOSS' ? 'LOSS' : trade.status}
                              </span>
                            </td>
                            <td className={`py-2 text-right font-bold font-mono ${
                              trade.profit !== null && trade.profit > 0
                                ? 'text-emerald-400'
                                : trade.profit !== null && trade.profit < 0
                                ? 'text-rose-400'
                                : 'text-slate-500'
                            }`}>
                              {trade.profit !== null
                                ? `${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}`
                                : '-'}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
