/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { LogEntry } from '../types';
import { Terminal, Filter, Trash2 } from 'lucide-react';

interface ActivityLogsProps {
  id: string;
  logs: LogEntry[];
  onClear: () => void;
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({
  id,
  logs,
  onClear,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'trade' | 'info' | 'error'>('all');

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0; // Since unshift puts new logs on top
    }
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'trade') return log.type === 'trade' || log.type === 'success';
    if (filter === 'error') return log.type === 'error';
    if (filter === 'info') return log.type === 'info';
    return true;
  });

  const getLogStyle = (type: LogEntry['type']) => {
    switch (type) {
      case 'trade':
        return 'text-indigo-400 font-medium';
      case 'success':
        return 'text-emerald-400 font-semibold';
      case 'error':
        return 'text-rose-400 font-semibold bg-rose-950/20 px-1 py-0.5 rounded';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div id={id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col gap-3 h-[250px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            บันทึกการทำงาน (System Logs)
          </h2>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800/60">
            <Filter className="w-3 h-3 text-slate-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-transparent border-none text-slate-400 text-xxs outline-none font-medium cursor-pointer"
            >
              <option value="all">ทั้งหมด (All)</option>
              <option value="trade">ธุรกรรม (Trades)</option>
              <option value="info">ระบบ (System)</option>
              <option value="error">ข้อผิดพลาด (Errors)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            title="ล้างประวัติ"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Area */}
      <div
        ref={containerRef}
        className="flex-grow overflow-y-auto pr-1 flex flex-col gap-1.5 font-mono text-[11px] leading-relaxed"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 italic">
            ไม่มีบันทึกข้อมูลในขณะนี้
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex gap-2.5 items-start hover:bg-slate-900/40 p-1 rounded transition-all">
              <span className="text-slate-600 select-none">[{log.timestamp}]</span>
              <span className={getLogStyle(log.type)}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
