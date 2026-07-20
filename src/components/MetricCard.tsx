/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  id: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'emerald' | 'rose' | 'amber' | 'blue' | 'slate';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'slate',
}) => {
  const getColors = () => {
    switch (color) {
      case 'emerald':
        return {
          bg: 'bg-emerald-950/20',
          border: 'border-emerald-500/20',
          text: 'text-emerald-400',
          iconBg: 'bg-emerald-500/10',
          iconText: 'text-emerald-400',
        };
      case 'rose':
        return {
          bg: 'bg-rose-950/20',
          border: 'border-rose-500/20',
          text: 'text-rose-400',
          iconBg: 'bg-rose-500/10',
          iconText: 'text-rose-400',
        };
      case 'amber':
        return {
          bg: 'bg-amber-950/20',
          border: 'border-amber-500/20',
          text: 'text-amber-400',
          iconBg: 'bg-amber-500/10',
          iconText: 'text-amber-400',
        };
      case 'blue':
        return {
          bg: 'bg-blue-950/20',
          border: 'border-blue-500/20',
          text: 'text-blue-400',
          iconBg: 'bg-blue-500/10',
          iconText: 'text-blue-400',
        };
      default:
        return {
          bg: 'bg-slate-900/40',
          border: 'border-slate-800',
          text: 'text-slate-200',
          iconBg: 'bg-slate-800/50',
          iconText: 'text-slate-400',
        };
    }
  };

  const colors = getColors();

  return (
    <div
      id={id}
      className={`p-4 rounded-xl border ${colors.bg} ${colors.border} flex items-center justify-between transition-all duration-200`}
    >
      <div>
        <span className="text-xs font-medium text-slate-400 tracking-wide uppercase">
          {title}
        </span>
        <h3 className={`text-xl font-bold tracking-tight font-mono mt-1 ${colors.text}`}>
          {value}
        </h3>
        {subtitle && (
          <p className="text-xxs text-slate-500 mt-0.5 tracking-wide">
            {subtitle}
          </p>
        )}
      </div>
      <div className={`p-2.5 rounded-lg ${colors.iconBg} ${colors.iconText}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
};
