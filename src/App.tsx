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
import { AuthPanel } from './components/AuthPanel';
import { AdminPanel } from './components/AdminPanel';
import { Wallet, Award, Activity, RotateCcw, AlertTriangle, ShieldCheck, HelpCircle, LogOut, ExternalLink } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ username: string; fullName: string; depositVerified: boolean } | null>(() => {
    const saved = localStorage.getItem('xm_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [impersonatingUser, setImpersonatingUser] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'client' | 'admin'>(() => {
    const saved = localStorage.getItem('xm_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.username === 'admin') return 'admin';
      } catch (e) {}
    }
    return 'client';
  });

  const [settings, setSettings] = useState<BotSettings>({
    isActive: false,
    assetId: 'XAUUSD',
    tradeAmount: 0.01,
    martingaleMultiplier: 1.0,
    maxMartingaleSteps: 1,
    emaShort: 5,
    emaLong: 20,
    accountType: 'practice',
    mode: 'mt5',
    v98Enabled: true,
    v98TrendEma: 200,
    dailyTradeLimit: 5,
    startHour: '13:00',
    endHour: '22:00',
    dailyProfitTarget: 1500.0,
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
      
      // Auto-authenticate socket connection if user session exists
      const saved = localStorage.getItem('xm_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          ws.send(JSON.stringify({ type: 'auth', data: { username: parsed.username } }));
        } catch (e) {}
      }
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
          case 'deposit_status':
            setCurrentUser((prev) => {
              if (prev) {
                const updated = { ...prev, depositVerified: data.verified };
                localStorage.setItem('xm_user', JSON.stringify(updated));
                return updated;
              }
              return prev;
            });
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

  useEffect(() => {
    if (clientConnected && currentUser) {
      const authUser = impersonatingUser || currentUser.username;
      sendEvent('auth', { username: authUser });
    }
  }, [currentUser, clientConnected, impersonatingUser]);

  const handleLogout = () => {
    localStorage.removeItem('xm_user');
    setCurrentUser(null);
    setImpersonatingUser(null);
    setViewMode('client');
    if (socketRef.current) {
      socketRef.current.close();
    }
    // Automatically trigger reconnect as guest fallback
    setTimeout(() => {
      connectWebSocket();
    }, 100);
  };

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

  if (!currentUser) {
    return (
      <AuthPanel
        id="xm_auth_gate"
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          localStorage.setItem('xm_user', JSON.stringify(user));
          if (user.username === 'admin') {
            setViewMode('admin');
          } else {
            setViewMode('client');
          }
        }}
      />
    );
  }

  if (viewMode === 'admin' && currentUser.username === 'admin') {
    return (
      <AdminPanel
        id="xm_admin_dashboard"
        currentUser={currentUser}
        onLogout={handleLogout}
        onSelectUserImpersonate={(username) => {
          setImpersonatingUser(username);
          setViewMode('client');
        }}
        onBackToClient={() => setViewMode('client')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col selection:bg-indigo-500/30">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 font-sans">
                MT5 EA GOLD AUTO-TRADER
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-medium px-1.5 py-0.5 rounded tracking-wide font-mono">
                  v3.1
                </span>
              </h1>
              <p className="text-[10px] text-slate-500 font-medium">
                ระบบบอทเทรดทองคำอัจฉริยะ (Indicator EMA Cross + Fixed Lot + V98.3 Golden Trend Logic)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
            {/* User Profile Badge */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xxs font-medium text-slate-300">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>
                {currentUser.username === 'admin' && impersonatingUser
                  ? `โหมดทดสอบ: #${impersonatingUser}`
                  : `พอร์ต: ${currentUser.fullName} (#${currentUser.username})`}
              </span>
              {currentUser.username !== 'admin' && (
                <span className={`px-1.5 py-0.5 rounded font-bold ${
                  currentUser.depositVerified 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {currentUser.depositVerified ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>

            {/* Admin toggle if authorized */}
            {currentUser.username === 'admin' && (
              <button
                onClick={() => {
                  setImpersonatingUser(null);
                  setViewMode('admin');
                }}
                className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xxs font-bold transition-all cursor-pointer"
              >
                กลับแผงแอดมิน
              </button>
            )}

            {/* Server Status Icon */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-xl text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${clientConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              <span className="text-slate-400 font-medium uppercase tracking-wide">
                เซิร์ฟเวอร์: {clientConnected ? 'ออนไลน์' : 'ออฟไลน์'}
              </span>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xxs font-bold text-rose-400 transition-all cursor-pointer"
              title="ออกจากระบบ"
            >
              <LogOut className="w-3.5 h-3.5" />
              ออก
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex flex-col gap-6">
        
        {/* Admin Impersonating / Simulation alert */}
        {currentUser.username === 'admin' && impersonatingUser && (
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-300">
                  คุณกำลังสวมบทบาทเป็น MT5 ID #{impersonatingUser}
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  คุณสามารถควบคุม ปรับเปลี่ยนค่า หรือตรวจสอบความปลอดภัยของลูกค้ารายนี้ได้ ข้อมูลจะอัพเดทเข้าสู่อีเมล/พอร์ตของลูกค้าโดยตรง
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setImpersonatingUser(null);
                setViewMode('admin');
              }}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xxs rounded-xl transition-all cursor-pointer animate-pulse"
            >
              กลับแผงควบคุมหลัก (Admin Control)
            </button>
          </div>
        )}

        {/* Deposit Unverified Warning Banner for regular customers */}
        {currentUser.username !== 'admin' && !currentUser.depositVerified && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-rose-400">
                  รอยืนยันสิทธิ์การรับสัญญาณเทรดอัตโนมัติ (Waiting Minimum Deposit Verification)
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  บัญชี MT5 ของท่านอยู่ระหว่างรอแอดมินยืนยันยอดเงินฝากขั้นต่ำ 3,500 บาท ภายใต้ลิงก์พาร์ทเนอร์ XM กรุณาตรวจสอบให้แน่ใจว่ายอดเงินฝากของท่านพร้อมแล้ว แอดมินจะทำการอนุมัติสิทธิ์ให้ท่านทันที
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 shrink-0 w-full md:w-auto justify-end">
              <a
                href="https://www.xmglobal.com/referral?token=MTKcgIwhVPRAksq6hx-X_w"
                target="_blank"
                rel="noreferrer referrer"
                className="px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xxs transition-all flex items-center gap-1 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                ลิงก์พาร์ทเนอร์ XM
              </a>
            </div>
          </div>
        )}

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
            title="ระบบบริหารเงินทุน"
            value="ล็อตคงที่ (Fixed Lot)"
            subtitle={`ขนาดล็อตปัจจุบัน ${settings.tradeAmount.toFixed(2)} Lot`}
            icon={ShieldCheck}
            color="indigo"
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
