/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ConnectionState, BotSettings } from '../types';
import { ShieldCheck, ShieldAlert, Cpu, Terminal, Copy, Check, RefreshCw, HelpCircle, AlertCircle, ExternalLink } from 'lucide-react';

interface MT5PanelProps {
  id: string;
  connection: ConnectionState;
  settings: BotSettings;
  onSelectMT5Mode: () => void;
}

export const MT5Panel: React.FC<MT5PanelProps> = ({
  id,
  connection,
  settings,
  onSelectMT5Mode,
}) => {
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  // Dynamically build server URL from window.location
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.run.app';

  const mql5Code = `//+------------------------------------------------------------------+
//|                                              EMA_Crossover_Bot.mq5|
//|                                  Copyright 2026, IQ Option & MT5 |
//|                                             https://ai.studio/   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, AI Trading Bot"
#property link      "https://ai.studio/"
#property version   "1.00"
#property strict

// Include standard trade class
#include <Trade\\Trade.mqh>
CTrade trade;

// Input parameters
input string   ServerUrl           = "${currentOrigin}"; // Server URL
input double   LotSize             = 0.01;                  // Base Lot Size
input bool     UseMartingale       = false;                 // Use Martingale multiplier (Set to false)
input double   MartingaleMultiplier= 1.0;                   // Martingale Multiplier
input int      MaxMartingaleSteps  = 1;                     // Max Martingale Steps
input int      TradeExpirySeconds  = 60;                    // Trade Expiry (60s to simulate Binary Options)
input double   TakeProfitPips      = 0.0;                   // Take Profit in Pips (0 = None)
input double   StopLossPips        = 0.0;                   // Stop Loss in Pips (0 = None)
input int      MagicNumber         = 123456;                // Unique Magic Number
input int      PollDebounceSeconds = 1;                     // Minimum seconds between server checks

// Global variables
datetime       last_poll_time      = 0;
ulong          active_ticket       = 0;
datetime       active_trade_time   = 0;
string         active_trade_id     = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(1);
   trade.SetExpertMagicNumber(MagicNumber);
   Print("EMA Crossover Bot Initialized with server: ", ServerUrl);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
}

//+------------------------------------------------------------------+
//| Timer event function (handles tick polling and trade closure)    |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(ServerUrl == "YOUR_SERVER_URL_HERE" || ServerUrl == "")
   {
      Comment("Please set your ServerUrl input parameter!");
      return;
   }

   datetime now = TimeLocal();
   
   // 1. Check if the active position has expired
   CheckAndCloseExpiredTrades();

   // 2. Poll server for price ticks & signals
   if(now - last_poll_time >= PollDebounceSeconds)
   {
      SendTickAndCheckSignals();
      last_poll_time = now;
   }
}

//+------------------------------------------------------------------+
//| Check and close expired trades                                   |
//+------------------------------------------------------------------+
void CheckAndCloseExpiredTrades()
{
   if(active_ticket > 0 && TradeExpirySeconds > 0)
   {
      if(PositionSelectByTicket(active_ticket))
      {
         datetime pos_time = (datetime)PositionGetInteger(POSITION_TIME);
         if(TimeCurrent() - pos_time >= TradeExpirySeconds)
         {
            double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP) + PositionGetDouble(POSITION_COMMISSION);
            double close_price = PositionGetDouble(POSITION_PRICE_CURRENT);
            
            Print("Position expired. Closing ticket #", active_ticket, " with profit: ", profit);
            if(trade.PositionClose(active_ticket))
            {
               // Report closed trade to server
               ReportTradeClosed(active_ticket, close_price, profit);
               active_ticket = 0;
               active_trade_id = "";
            }
         }
      }
      else
      {
         // Ticket is no longer active (maybe closed by TP/SL or user)
         double profit = GetClosedPositionProfit(active_ticket);
         ReportTradeClosed(active_ticket, SymbolInfoDouble(_Symbol, SYMBOL_BID), profit);
         active_ticket = 0;
         active_trade_id = "";
      }
   }
}

//+------------------------------------------------------------------+
//| Get profit of a closed position from history                    |
//+------------------------------------------------------------------+
double GetClosedPositionProfit(ulong ticket)
{
   double profit = 0.0;
   if(HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 86400))
   {
      int total = HistoryDealsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong deal_ticket = HistoryDealGetTicket(i);
         ulong deal_position = HistoryDealGetInteger(deal_ticket, DEAL_POSITION_ID);
         if(deal_position == ticket)
         {
            profit += HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
         }
      }
   }
   return profit;
}

///+------------------------------------------------------------------+
//| Send tick data to server and process response                    |
//+------------------------------------------------------------------+
void SendTickAndCheckSignals()
{
   // Trim trailing slash from ServerUrl if it exists
   string clean_url = ServerUrl;
   if(StringLen(clean_url) > 0 && StringSubstr(clean_url, StringLen(clean_url) - 1, 1) == "/")
   {
      clean_url = StringSubstr(clean_url, 0, StringLen(clean_url) - 1);
   }
   string url = clean_url + "/api/mt5/tick";
   string headers = "Content-Type: application/json\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\\r\\n";
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   
   string body = "{\\"asset\\":\\"" + _Symbol + "\\",\\"price\\":" + DoubleToString(bid, _Digits) + 
                 ",\\"balance\\":" + DoubleToString(balance, 2) + 
                 ",\\"currency\\":\\"" + currency + "\\",\\"login\\":\\"" + IntegerToString(login) + "\\"}";
   
   char post_data[];
   char result_data[];
   string result_headers;
   
   // Copy exactly StringLen(body) characters to exclude trailing null terminator
   StringToCharArray(body, post_data, 0, StringLen(body));
   
   int res = WebRequest("POST", url, headers, 3000, post_data, result_data, result_headers);
   
   if(res == 200)
   {
      string response_text = CharArrayToString(result_data);
      string signal = GetJsonStringValue(response_text, "signal");
      double lot_size = GetJsonDoubleValue(response_text, "lot_size");
      string trade_id = GetJsonStringValue(response_text, "trade_id");
      
      if(signal == "CALL" || signal == "PUT")
      {
         if(active_ticket == 0)
         {
            ExecuteTrade(signal, lot_size, trade_id);
         }
         else
         {
            Print("Signal received (", signal, ") but a trade is already active (Ticket #", active_ticket, ")");
         }
      }
   }
   else
   {
      Print("WebRequest failed, error code: ", res);
   }
}

//+------------------------------------------------------------------+
//| Report trade closed to server                                    |
//+------------------------------------------------------------------+
void ReportTradeClosed(ulong ticket, double price, double profit)
{
   string clean_url = ServerUrl;
   if(StringLen(clean_url) > 0 && StringSubstr(clean_url, StringLen(clean_url) - 1, 1) == "/")
   {
      clean_url = StringSubstr(clean_url, 0, StringLen(clean_url) - 1);
   }
   string url = clean_url + "/api/mt5/tick";
   string headers = "Content-Type: application/json\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\\r\\n";
   
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   
   string body = "{\\"asset\\":\\"" + _Symbol + "\\",\\"price\\":" + DoubleToString(price, _Digits) + 
                 ",\\"ticket\\":" + IntegerToString(ticket) + 
                 ",\\"action\\":\\"trade_closed\\",\\"profit\\":" + DoubleToString(profit, 2) +
                 ",\\"balance\\":" + DoubleToString(balance, 2) + 
                 ",\\"currency\\":\\"" + currency + "\\",\\"login\\":\\"" + IntegerToString(login) + "\\"}";
                  
   char post_data[];
   char result_data[];
   string result_headers;
   
   StringToCharArray(body, post_data, 0, StringLen(body));
   WebRequest("POST", url, headers, 3000, post_data, result_data, result_headers);
}

//+------------------------------------------------------------------+
//| Report trade opened to server                                    |
//+------------------------------------------------------------------+
void ReportTradeOpened(ulong ticket, double price)
{
   string clean_url = ServerUrl;
   if(StringLen(clean_url) > 0 && StringSubstr(clean_url, StringLen(clean_url) - 1, 1) == "/")
   {
      clean_url = StringSubstr(clean_url, 0, StringLen(clean_url) - 1);
   }
   string url = clean_url + "/api/mt5/tick";
   string headers = "Content-Type: application/json\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\\r\\n";
   
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   
   string body = "{\\"asset\\":\\"" + _Symbol + "\\",\\"price\\":" + DoubleToString(price, _Digits) + 
                 ",\\"ticket\\":" + IntegerToString(ticket) + 
                 ",\\"action\\":\\"trade_opened\\",\\"balance\\":" + DoubleToString(balance, 2) + 
                 ",\\"currency\\":\\"" + currency + "\\",\\"login\\":\\"" + IntegerToString(login) + "\\"}";
                  
   char post_data[];
   char result_data[];
   string result_headers;
   
   StringToCharArray(body, post_data, 0, StringLen(body));
   WebRequest("POST", url, headers, 3000, post_data, result_data, result_headers);
}

//+------------------------------------------------------------------+
//| Execute Buy or Sell position                                     |
//+------------------------------------------------------------------+
void ExecuteTrade(string direction, double lot, string trade_id)
{
   double price = 0.0;
   double sl = 0.0;
   double tp = 0.0;
   
   if(direction == "CALL") // BUY
   {
      price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      if(StopLossPips > 0) sl = price - (StopLossPips * _Point * 10);
      if(TakeProfitPips > 0) tp = price + (TakeProfitPips * _Point * 10);
      
      Print("Opening BUY Position. Lot: ", lot, " Price: ", price);
      if(trade.Buy(lot, _Symbol, price, sl, tp, "EMA Cross CALL"))
      {
         active_ticket = trade.ResultOrder();
         if(active_ticket == 0) active_ticket = trade.ResultDeal();
         
         if(active_ticket > 0)
         {
            active_trade_id = trade_id;
            ReportTradeOpened(active_ticket, price);
            Print("BUY Trade Opened. Ticket #", active_ticket);
         }
      }
   }
   else if(direction == "PUT") // SELL
   {
      price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(StopLossPips > 0) sl = price + (StopLossPips * _Point * 10);
      if(TakeProfitPips > 0) tp = price - (TakeProfitPips * _Point * 10);
      
      Print("Opening SELL Position. Lot: ", lot, " Price: ", price);
      if(trade.Sell(lot, _Symbol, price, sl, tp, "EMA Cross PUT"))
      {
         active_ticket = trade.ResultOrder();
         if(active_ticket == 0) active_ticket = trade.ResultDeal();
         
         if(active_ticket > 0)
         {
            active_trade_id = trade_id;
            ReportTradeOpened(active_ticket, price);
            Print("SELL Trade Opened. Ticket #", active_ticket);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Helper: Extract string value from simple JSON                    |
//+------------------------------------------------------------------+
string GetJsonStringValue(string json, string key)
{
   string search_key = "\\"" + key + "\\":";
   int pos = StringFind(json, search_key);
   if(pos == -1) return "";
   
   int val_start = pos + StringLen(search_key);
   while(val_start < StringLen(json) && 
         (StringSubstr(json, val_start, 1) == " " || StringSubstr(json, val_start, 1) == "\\\""))
   {
      val_start++;
   }
   
   int val_end = val_start;
   while(val_end < StringLen(json) && 
         StringSubstr(json, val_end, 1) != "\\\"" && 
         StringSubstr(json, val_end, 1) != "," && 
         StringSubstr(json, val_end, 1) != "}")
   {
      val_end++;
   }
   
   return StringSubstr(json, val_start, val_end - val_start);
}

//+------------------------------------------------------------------+
//| Helper: Extract double value from simple JSON                    |
//+------------------------------------------------------------------+
double GetJsonDoubleValue(string json, string key)
{
   string val_str = GetJsonStringValue(json, key);
   return StringToDouble(val_str);
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(mql5Code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isModeActive = settings.mode === 'mt5';

  return (
    <div id={id} className={`p-5 rounded-xl border flex flex-col gap-4 transition-all ${
      isModeActive 
        ? 'border-indigo-500/40 bg-indigo-950/5' 
        : 'border-slate-800 bg-slate-900/30'
    }`}>
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className={`w-5 h-5 ${isModeActive ? 'text-indigo-400' : 'text-slate-400'}`} />
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
            เชื่อมต่อกับ MetaTrader 5 (MT5)
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-1 text-xxs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {showGuide ? 'ซ่อนคู่มือ' : 'แสดงคู่มือติดตั้ง'}
        </button>
      </div>

      {/* Mode Selector Button */}
      {!isModeActive && (
        <button
          type="button"
          onClick={onSelectMT5Mode}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg transition-all text-xs cursor-pointer shadow-lg shadow-indigo-950/20"
        >
          <Cpu className="w-4 h-4" />
          สลับมาใช้โหมดเชื่อมต่อเทรดจริงบน MT5
        </button>
      )}

      {/* Connection Status Banner */}
      {isModeActive && (
        <div className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${
          connection.status === 'connected' 
            ? 'text-emerald-400 bg-emerald-950/25 border-emerald-500/20' 
            : 'text-amber-400 bg-amber-950/25 border-amber-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {connection.status === 'connected' ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-amber-400" />
            )}
            <div>
              <span className="font-semibold block uppercase text-xxs tracking-wider mb-0.5">สถานะเชื่อมต่อ MT5 EA:</span>
              <span>{connection.status === 'connected' ? 'กำลังรับราคาและส่งสัญญาณแบบเรียลไทม์!' : 'รอการส่งข้อมูล (Tick/Request) จาก EA ใน MT5...'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Guide Box */}
      {showGuide && (
        <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800 text-xxs text-slate-300 flex flex-col gap-2.5 leading-relaxed">
          <div className="font-bold text-xs text-indigo-400 flex items-center gap-1.5 border-b border-slate-800/80 pb-1.5 mb-1">
            <HelpCircle className="w-4 h-4" />
            วิธีติดตั้งระบบเทรดอัตโนมัติบน MetaTrader 5
          </div>
          
          <div className="flex flex-col gap-2">
            <h4 className="font-semibold text-white">ขั้นตอนที่ 1: อนุญาต WebRequest ใน MT5</h4>
            <ol className="list-decimal pl-4 flex flex-col gap-1 text-slate-400">
              <li>เปิดโปรแกรม <strong className="text-slate-200">MetaTrader 5</strong> บนคอมพิวเตอร์ของคุณ</li>
              <li>ไปที่เมนู <strong className="text-slate-200">Tools -&gt; Options</strong> (หรือกด Ctrl+O)</li>
              <li>เลือกแท็บ <strong className="text-slate-200">Expert Advisors</strong></li>
              <li>ติ๊กถูกที่ช่อง <strong className="text-emerald-400">"Allow WebRequest for listed URL"</strong></li>
              <li>ดับเบิลคลิกเพื่อเพิ่ม URL นี้เข้าไปในรายการ: <br />
                <span className="font-mono bg-slate-900 text-indigo-400 px-2 py-0.5 rounded inline-block mt-1 select-all">{currentOrigin}</span>
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-900 pt-2.5">
            <h4 className="font-semibold text-white">ขั้นตอนที่ 2: สร้างและติดตั้ง EA (Expert Advisor)</h4>
            <ol className="list-decimal pl-4 flex flex-col gap-1 text-slate-400">
              <li>ใน MT5 กดปุ่ม <strong className="text-slate-200">F4</strong> เพื่อเปิดโปรแกรม <strong className="text-slate-200">MetaEditor</strong></li>
              <li>กดปุ่ม <strong className="text-slate-200">New</strong> -&gt; เลือก <strong className="text-slate-200">Expert Advisor (template)</strong> -&gt; ตั้งชื่อว่า <code className="text-indigo-400">EMA_Crossover_Bot</code></li>
              <li>ลบโค้ดเดิมออกทั้งหมด และคัดลอกโค้ด MQL5 จากกล่องข้อความด้านล่างนี้ไปวางแทน</li>
              <li>กดปุ่ม <strong className="text-emerald-400">Compile</strong> ด้านบน (ต้องไม่มีข้อผิดพลาดสีแดง)</li>
              <li>กลับมาที่หน้าต่าง MT5 ลากตัวบอทจากเมนู Navigator ลงบนกราฟที่ต้องการเทรด (เช่น <strong className="text-white">EURUSD</strong>) และกดติ๊กถูก <strong className="text-emerald-400">"Allow Algo Trading"</strong></li>
            </ol>
          </div>
        </div>
      )}

      {/* Code Box */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xxs text-slate-400 font-medium bg-slate-950 px-3 py-2 rounded-t-lg border border-slate-800 border-b-0">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            EMA_Crossover_Bot.mq5 (MQL5 Code)
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">คัดลอกแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>คัดลอกโค้ด</span>
              </>
            )}
          </button>
        </div>
        <div className="bg-slate-950 rounded-b-lg border border-slate-800 p-3 overflow-x-auto max-h-[250px] font-mono text-[10px] text-slate-300 leading-normal select-all">
          <pre>{mql5Code}</pre>
        </div>
      </div>
    </div>
  );
};
