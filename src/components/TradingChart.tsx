/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { Candle, SUPPORTED_ASSETS } from '../types';
import { TrendingUp, TrendingDown, Eye } from 'lucide-react';

interface TradingChartProps {
  id: string;
  candles: Candle[];
  activeAssetId: string;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  id,
  candles,
  activeAssetId
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 350 });

  // Handle responsive resize correctly
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 300),
          height: Math.max(height, 280)
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const asset = SUPPORTED_ASSETS.find(a => a.id === activeAssetId) || SUPPORTED_ASSETS[0];

  // We display the last 40 candles for a clean dense chart
  const visibleCandlesCount = 35;
  const visibleCandles = candles.slice(-visibleCandlesCount);

  if (visibleCandles.length === 0) {
    return (
      <div className="w-full h-[350px] bg-slate-950 flex items-center justify-center rounded-xl border border-slate-800">
        <span className="text-sm text-slate-500 font-medium">กำลังเตรียมข้อมูลกราฟ...</span>
      </div>
    );
  }

  // Calculate min & max prices for auto-scaling Y-axis
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  visibleCandles.forEach(c => {
    const vals = [c.low, c.high, c.open, c.close];
    if (c.emaShort) vals.push(c.emaShort);
    if (c.emaLong) vals.push(c.emaLong);
    
    vals.forEach(v => {
      if (v < minPrice) minPrice = v;
      if (v > maxPrice) maxPrice = v;
    });
  });

  // Add 10% padding to top and bottom of Y-axis range
  const priceRange = maxPrice - minPrice;
  const padding = priceRange * 0.1 || asset.volatility * 10;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;
  const yRange = yMax - yMin;

  const paddingLeft = 10;
  const paddingRight = 65; // Room for price axis
  const paddingTop = 20;
  const paddingBottom = 25; // Room for timestamps

  const chartWidth = dimensions.width - paddingLeft - paddingRight;
  const chartHeight = dimensions.height - paddingTop - paddingBottom;

  // Coordinate converters
  const getX = (index: number) => {
    if (visibleCandles.length <= 1) return paddingLeft;
    return paddingLeft + (index / (visibleCandles.length - 1)) * chartWidth;
  };

  const getY = (price: number) => {
    return paddingTop + chartHeight - ((price - yMin) / yRange) * chartHeight;
  };

  // Generate gridline prices (5 levels)
  const gridLevels = 5;
  const gridPrices: number[] = [];
  for (let i = 0; i < gridLevels; i++) {
    gridPrices.push(yMin + (i / (gridLevels - 1)) * yRange);
  }

  // Create SVG path for EMA Short
  let emaShortPath = '';
  visibleCandles.forEach((c, idx) => {
    if (c.emaShort) {
      const x = getX(idx);
      const y = getY(c.emaShort);
      if (idx === 0 || emaShortPath === '') {
        emaShortPath = `M ${x} ${y}`;
      } else {
        emaShortPath += ` L ${x} ${y}`;
      }
    }
  });

  // Create SVG path for EMA Long
  let emaLongPath = '';
  visibleCandles.forEach((c, idx) => {
    if (c.emaLong) {
      const x = getX(idx);
      const y = getY(c.emaLong);
      if (idx === 0 || emaLongPath === '') {
        emaLongPath = `M ${x} ${y}`;
      } else {
        emaLongPath += ` L ${x} ${y}`;
      }
    }
  });

  const latestCandle = visibleCandles[visibleCandles.length - 1];

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      {/* Chart Header */}
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-xs font-mono font-bold tracking-wider">
            {asset.name}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Digital Option 1m</span>
          </div>
        </div>
        
        {/* Real-time price display */}
        <div className="flex items-center gap-4 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            <span className="text-slate-400 text-xs">EMA {visibleCandles[0]?.emaShort ? '5' : ''}:</span>
            <span className="text-orange-400 text-xs font-semibold">{latestCandle.emaShort?.toFixed(5) || '-'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span className="text-slate-400 text-xs">EMA {visibleCandles[0]?.emaLong ? '20' : ''}:</span>
            <span className="text-cyan-400 text-xs font-semibold">{latestCandle.emaLong?.toFixed(5) || '-'}</span>
          </div>
          <div className="text-right">
            <span className={`text-sm font-bold ${latestCandle.close >= latestCandle.open ? 'text-emerald-400' : 'text-rose-400'}`}>
              {latestCandle.close.toFixed(5)}
            </span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div ref={containerRef} className="w-full flex-grow h-[320px] bg-slate-950/90 rounded-xl border border-slate-800 relative overflow-hidden select-none">
        <svg id={id} width="100%" height="100%">
          <defs>
            <linearGradient id="grid-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="live-line-glow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          {gridPrices.map((price, idx) => {
            const y = getY(price);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth + paddingLeft}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="0.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={chartWidth + paddingLeft + 8}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="start"
                >
                  {price.toFixed(5)}
                </text>
              </g>
            );
          })}

          {/* Candlesticks & Signal arrows */}
          {visibleCandles.map((candle, idx) => {
            const x = getX(idx);
            const yOpen = getY(candle.open);
            const yClose = getY(candle.close);
            const yHigh = getY(candle.high);
            const yLow = getY(candle.low);

            const isGreen = candle.close >= candle.open;
            const strokeColor = isGreen ? '#10b981' : '#f43f5e';
            const fillColor = isGreen ? '#10b981' : '#f43f5e';
            const candleWidth = Math.max(chartWidth / visibleCandles.length * 0.6, 3);

            // Crossover check (Draw dynamic crossover arrow on the chart!)
            let crossoverSignal: 'CALL' | 'PUT' | null = null;
            if (idx > 0) {
              const prev = visibleCandles[idx - 1];
              if (prev && prev.emaShort && prev.emaLong && candle.emaShort && candle.emaLong) {
                const prevDiff = prev.emaShort - prev.emaLong;
                const currDiff = candle.emaShort - candle.emaLong;
                if (prevDiff <= 0 && currDiff > 0) crossoverSignal = 'CALL';
                else if (prevDiff >= 0 && currDiff < 0) crossoverSignal = 'PUT';
              }
            }

            return (
              <g key={idx} className="transition-all duration-300">
                {/* Wick */}
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={strokeColor}
                  strokeWidth="1.2"
                />
                {/* Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={Math.min(yOpen, yClose)}
                  width={candleWidth}
                  height={Math.max(Math.abs(yOpen - yClose), 1)}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth="1.2"
                  rx="1"
                />

                {/* Draw EMA crossover signal circles/arrows directly on chart */}
                {crossoverSignal && (
                  <g>
                    <circle
                      cx={x}
                      cy={crossoverSignal === 'CALL' ? yLow + 18 : yHigh - 18}
                      r="9"
                      fill={crossoverSignal === 'CALL' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}
                      stroke={crossoverSignal === 'CALL' ? '#10b981' : '#f43f5e'}
                      strokeWidth="1"
                    />
                    <path
                      d={
                        crossoverSignal === 'CALL'
                          ? `M ${x} ${yLow + 21} L ${x} ${yLow + 15} M ${x} ${yLow + 15} L ${x - 3} ${yLow + 18} M ${x} ${yLow + 15} L ${x + 3} ${yLow + 18}`
                          : `M ${x} ${yHigh - 21} L ${x} ${yHigh - 15} M ${x} ${yHigh - 15} L ${x - 3} ${yHigh - 18} M ${x} ${yHigh - 15} L ${x + 3} ${yHigh - 18}`
                      }
                      stroke={crossoverSignal === 'CALL' ? '#10b981' : '#f43f5e'}
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* EMA Short Line (Orange) */}
          {emaShortPath && (
            <path
              d={emaShortPath}
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_2px_rgba(249,115,22,0.4)]"
            />
          )}

          {/* EMA Long Line (Cyan) */}
          {emaLongPath && (
            <path
              d={emaLongPath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]"
            />
          )}

          {/* Live Price Horizontal Line and Marker */}
          {latestCandle && (
            <g>
              <line
                x1={paddingLeft}
                y1={getY(latestCandle.close)}
                x2={chartWidth + paddingLeft}
                y2={getY(latestCandle.close)}
                stroke="rgba(99, 102, 241, 0.4)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {/* Highlight active price box */}
              <rect
                x={chartWidth + paddingLeft + 4}
                y={getY(latestCandle.close) - 7}
                width={56}
                height={14}
                fill="#4f46e5"
                rx="3"
              />
              <text
                x={chartWidth + paddingLeft + 32}
                y={getY(latestCandle.close) + 3}
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {latestCandle.close.toFixed(5)}
              </text>
              
              {/* Blinking live beacon */}
              <circle
                cx={getX(visibleCandles.length - 1)}
                cy={getY(latestCandle.close)}
                r="4"
                fill="#4f46e5"
              />
              <circle
                cx={getX(visibleCandles.length - 1)}
                cy={getY(latestCandle.close)}
                r="8"
                fill="none"
                stroke="#818cf8"
                strokeWidth="1"
                className="animate-ping"
              />
            </g>
          )}

          {/* Timestamps (horizontal axis) */}
          {visibleCandles.map((candle, idx) => {
            if (idx % 7 === 0) {
              const x = getX(idx);
              const timeString = new Date(candle.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <text
                  key={idx}
                  x={x}
                  y={chartHeight + paddingTop + 16}
                  fill="#475569"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {timeString}
                </text>
              );
            }
            return null;
          })}
        </svg>

        {/* Floating Indicator Badges */}
        <div className="absolute top-3 left-3 bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1 text-xxs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-slate-300 font-mono">LIVE FEED STREAMING</span>
        </div>
      </div>
    </div>
  );
};
