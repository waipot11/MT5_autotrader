/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BotSettings, SUPPORTED_ASSETS } from '../types';
import { Play, Square, Settings, Award, DollarSign, Activity, AlertTriangle } from 'lucide-react';

interface BotControlsProps {
  id: string;
  settings: BotSettings;
  onUpdate: (data: Partial<BotSettings>) => void;
  onToggleActive: () => void;
}

export const BotControls: React.FC<BotControlsProps> = ({
  id,
  settings,
  onUpdate,
  onToggleActive,
}) => {
  return (
    <div id={id} className="p-5 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
            การตั้งค่าบอทเทรด
          </h2>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xxs font-medium bg-indigo-500/10 text-indigo-400 uppercase tracking-wider font-mono">
          {settings.mode === 'simulation' ? 'โหมดจำลอง' : 'MetaTrader 5 (MT5)'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Asset Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            สินทรัพย์ที่จะเทรด
          </label>
          <select
            disabled={settings.isActive}
            value={settings.assetId}
            onChange={(e) => onUpdate({ assetId: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
          >
            {SUPPORTED_ASSETS.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} (Active ID: {asset.activeId})
              </option>
            ))}
          </select>
        </div>

        {/* Account Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-slate-500" />
            ประเภทบัญชี
          </label>
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              disabled={settings.isActive}
              type="button"
              onClick={() => onUpdate({ accountType: 'practice' })}
              className={`py-1.5 text-xs font-medium rounded-md transition-all ${
                settings.accountType === 'practice'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              ทดลอง (Practice)
            </button>
            <button
              disabled={settings.isActive}
              type="button"
              onClick={() => onUpdate({ accountType: 'real' })}
              className={`py-1.5 text-xs font-medium rounded-md transition-all ${
                settings.accountType === 'real'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              เงินจริง (Real)
            </button>
          </div>
        </div>

        {/* Base Trade Amount */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-slate-500" />
            {settings.mode === 'mt5' ? 'ล็อตเริ่มต้น (Base Lot)' : 'จำนวนเงินเริ่มต้นต่อไม้ ($)'}
          </label>
          <input
            disabled={settings.isActive}
            type="number"
            min={settings.mode === 'mt5' ? 0.01 : 1}
            max={settings.mode === 'mt5' ? 10.0 : 1000}
            step={settings.mode === 'mt5' ? 0.01 : 0.5}
            value={settings.tradeAmount}
            onChange={(e) => {
              const minVal = settings.mode === 'mt5' ? 0.01 : 1;
              onUpdate({ tradeAmount: Math.max(minVal, parseFloat(e.target.value) || minVal) });
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
          />
        </div>

        {/* Martingale System Status */}
        <div className="col-span-1 sm:col-span-2 p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/15 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
            <AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0" />
            สถานะระบบ Martingale: ปิดใช้งาน (Fixed Lot)
          </div>
          <p className="text-[10px] text-slate-400 leading-normal">
            ระบบบริหารเงินทุนแบบ Martingale ถูกยกเลิกเพื่อลดความเสี่ยงในการล้างพอร์ตตามคำขอ โดยระบบจะทำการออกออร์เดอร์ทุกไม้ด้วยขนาดล็อตเริ่มต้นที่กำหนด (เช่น 0.01 Lot) คงที่ตลอดทุกรอบการเทรดเพื่อความปลอดภัยขั้นสูงสุด
          </p>
        </div>

        {/* EMA Technical Periods */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400">
              EMA {settings.emaShort} (เส้นสั้น)
            </label>
            <input
              disabled={settings.isActive}
              type="number"
              min="2"
              max="50"
              value={settings.emaShort}
              onChange={(e) => onUpdate({ emaShort: Math.max(2, parseInt(e.target.value, 10) || 5) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400">
              EMA {settings.emaLong} (เส้นยาว)
            </label>
            <input
              disabled={settings.isActive}
              type="number"
              min="10"
              max="100"
              value={settings.emaLong}
              onChange={(e) => onUpdate({ emaLong: Math.max(10, parseInt(e.target.value, 10) || 20) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* V98.3 Golden Logic & Day Trade Limit Section */}
      <div className="p-4 rounded-xl bg-slate-950/50 border border-indigo-500/10 flex flex-col gap-3.5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            ระบบกรอง V98.3 & DAY TRADE LIMIT (มหาเทพ)
          </span>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              disabled={settings.isActive}
              type="checkbox"
              checked={settings.v98Enabled ?? true}
              onChange={(e) => onUpdate({ v98Enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
            <span className="ml-1.5 text-[10px] text-slate-400 font-medium">เปิดใช้งาน</span>
          </label>
        </div>

        {(settings.v98Enabled ?? true) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Trend Filter EMA 200 */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                กรองเทรนด์หลัก (EMA {settings.v98TrendEma ?? 200})
                <span className="text-emerald-400 font-bold">*ลดอัตราแพ้ &lt; 5%</span>
              </span>
              <input
                disabled={settings.isActive}
                type="number"
                min="50"
                max="500"
                value={settings.v98TrendEma ?? 200}
                onChange={(e) => onUpdate({ v98TrendEma: Math.max(50, parseInt(e.target.value, 10) || 200) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            {/* Trading time windows */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-400">ช่วงเวลาเข้าออร์เดอร์ (UTC)</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  disabled={settings.isActive}
                  type="text"
                  placeholder="13:00"
                  value={settings.startHour ?? "13:00"}
                  onChange={(e) => onUpdate({ startHour: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <input
                  disabled={settings.isActive}
                  type="text"
                  placeholder="22:00"
                  value={settings.endHour ?? "22:00"}
                  onChange={(e) => onUpdate({ endHour: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Daily Trade Limit */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-400">จำกัดไม้เทรดต่อวัน (รอบ)</span>
              <input
                disabled={settings.isActive}
                type="number"
                min="1"
                max="50"
                value={settings.dailyTradeLimit ?? 5}
                onChange={(e) => onUpdate({ dailyTradeLimit: Math.max(1, parseInt(e.target.value, 10) || 5) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            {/* Target & Drawdown */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-400">เป้ากำไร / ตัดขาดทุน ต่อวัน ($)</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  disabled={settings.isActive}
                  type="number"
                  min="5"
                  value={settings.dailyProfitTarget ?? 100}
                  onChange={(e) => onUpdate({ dailyProfitTarget: Math.max(5, parseFloat(e.target.value) || 100) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1.5 text-center text-xs font-mono text-emerald-400 outline-none focus:border-emerald-500 disabled:opacity-50"
                  placeholder="TP ($)"
                  title="Daily Profit Target (TP)"
                />
                <input
                  disabled={settings.isActive}
                  type="number"
                  min="5"
                  value={settings.dailyLossLimit ?? 50}
                  onChange={(e) => onUpdate({ dailyLossLimit: Math.max(5, parseFloat(e.target.value) || 50) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1.5 text-center text-xs font-mono text-rose-400 outline-none focus:border-rose-500 disabled:opacity-50"
                  placeholder="SL ($)"
                  title="Daily Drawdown Limit (SL)"
                />
              </div>
            </div>
          </div>
        )}
        <div className="text-[10px] text-slate-500 leading-normal">
          💡 <span className="text-slate-400 font-semibold">สูตรลับ V98.3:</span> บอทจะทำการตรวจสอบ <strong className="text-indigo-300">EMA {settings.emaShort}/{settings.emaLong}</strong> แต่จะออกออร์เดอร์ก็ต่อเมื่อราคาสอดคล้องกับแนวโน้มหลักของ <strong className="text-indigo-300">EMA {settings.v98TrendEma ?? 200}</strong> เท่านั้น พร้อมควบคุมเวลาเทรดช่วงตลาดลอนดอน/นิวยอร์กที่มีสภาพคล่องและสเปรดต่ำ ช่วยกรองสัญญาณหลอกได้อย่างแม่นยำ
        </div>
      </div>

      {/* Target Profit per Round preview */}
      <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800 text-xxs text-slate-400 flex flex-col gap-1.5">
        <div className="text-xs font-semibold text-slate-300 border-b border-slate-800/50 pb-1 mb-1">
          เป้าหมายและขนาดล็อตต่อรอบการทำงาน (Risk Management):
        </div>
        <div className="flex justify-between items-center font-mono py-0.5">
          <span>ขนาดล็อตเริ่มต้นต่อไม้ (Base Lot):</span>
          <span className="text-indigo-400 font-bold">{settings.tradeAmount.toFixed(2)} Lot</span>
        </div>
        <div className="flex justify-between items-center font-mono py-0.5">
          <span>เป้าหมายกำไรต่อวัน / ต่อรอบ (TP):</span>
          <span className="text-emerald-400 font-bold">฿1,500.00 บาท (≈ $44.12 USD)</span>
        </div>
        <div className="flex justify-between items-center font-mono py-0.5">
          <span>ขีดจำกัดตัดขาดทุนรายวัน (SL):</span>
          <span className="text-rose-400 font-bold">${settings.dailyLossLimit ?? 50.0} USD</span>
        </div>
      </div>

      {/* Activation Button */}
      <button
        id="toggle_bot_button"
        type="button"
        onClick={onToggleActive}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg text-sm cursor-pointer ${
          settings.isActive
            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-950/20 active-pulse'
            : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-950/20'
        }`}
      >
        {settings.isActive ? (
          <>
            <Square className="w-4 h-4 fill-white" />
            หยุดระบบเทรดอัตโนมัติ (STOP)
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-white" />
            เริ่มระบบเทรดอัตโนมัติ (START RUN)
          </>
        )}
      </button>
    </div>
  );
};
