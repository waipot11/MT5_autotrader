import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, UserPlus, ExternalLink, Copy, Check, ShieldAlert, Award, ChevronRight, HelpCircle } from 'lucide-react';

interface AuthPanelProps {
  id: string;
  onLoginSuccess: (user: { username: string; fullName: string; depositVerified: boolean }) => void;
}

export function AuthPanel({ id, onLoginSuccess }: AuthPanelProps) {
  const [viewMode, setViewMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const referralLink = "https://www.xmglobal.com/referral?token=MTKcgIwhVPRAksq6hx-X_w";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('กรุณากรอกหมายเลขบัญชี MT5');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess(data.user);
      } else {
        setError(data.error || 'หมายเลขบัญชี MT5 หรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (err) {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ระบบได้');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim() || !fullName.trim() || !password) {
      setError('กรุณากรอกข้อมูลสมัครสมาชิกให้ครบถ้วน');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          fullName: fullName.trim(),
          password
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('สมัครลงทะเบียนบัญชีในระบบสำเร็จแล้ว! กรุณาเข้าสู่ระบบด้วยหมายเลข MT5 ของท่าน');
        setViewMode('login');
        setPassword('');
      } else {
        setError(data.error || 'เกิดข้อผิดพลาดในการสมัครสมาชิก');
      }
    } catch (err) {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ระบบได้');
    }
  };

  return (
    <div id={id} className="min-h-screen bg-[#06080c] flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden selection:bg-indigo-500/30">
      
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl -z-10 animate-pulse"></div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 rounded-3xl border border-slate-900 bg-slate-950/40 backdrop-blur-md overflow-hidden shadow-2xl">
        
        {/* Left Section: Info Panel & Partner Program */}
        <div className="md:col-span-5 p-6 sm:p-8 bg-slate-950 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-900/60">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 font-bold font-mono text-xs">
                GOLD
              </span>
              <h2 className="text-sm font-bold text-white tracking-wide uppercase">
                XM EA Network Auto-Trader
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold text-slate-100 tracking-tight leading-snug">
                ยินดีต้อนรับสู่ระบบส่งสัญญาณการเทรดอัจฉริยะแบบกลุ่มเครือข่าย
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                ระบบเชื่อมต่อและกระจายสัญญาณ EA เทรดทองคำ (XAUUSD) อัตโนมัติด้วย V98.3 Golden Trend Logic สู่หมายเลขบัญชี MT5 ของท่านเพื่อสร้างพอร์ตเทรดที่มีประสิทธิภาพร่วมกัน
              </p>
            </div>

            {/* Steps guidelines */}
            <div className="flex flex-col gap-3.5 mt-2 bg-slate-900/30 p-4 rounded-2xl border border-slate-900">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                <Award className="w-4 h-4 text-amber-500" />
                เงื่อนไขสิทธิ์การใช้ระบบฟรี
              </h4>
              
              <div className="flex gap-2.5 items-start">
                <span className="w-4 h-4 mt-0.5 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center font-bold text-xxs font-mono shrink-0">1</span>
                <p className="text-xxs text-slate-400 leading-relaxed">สมัครเปิดบัญชี MT5 จริงภายใต้ลิงก์พาร์ทเนอร์ XM เพื่อเข้าร่วมระบบเครือข่าย</p>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="w-4 h-4 mt-0.5 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center font-bold text-xxs font-mono shrink-0">2</span>
                <p className="text-xxs text-slate-400 leading-relaxed">ฝากเงินขั้นต่ำเข้าระบบเทรดจริงจำนวน 3,500 บาท ขึ้นไป (ประมาณ $100)</p>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="w-4 h-4 mt-0.5 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center font-bold text-xxs font-mono shrink-0">3</span>
                <p className="text-xxs text-slate-400 leading-relaxed">ลงทะเบียนชื่อและหมายเลขบัญชี MT5 ของท่านบนหน้านี้เพื่อรับสัญญาณเทรดอัตโนมัติฟรี</p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-900 flex items-center justify-between text-xxs text-slate-500">
            <span>XM Auto-Trader Network Team</span>
            <span className="font-mono text-indigo-400">v3.0.4</span>
          </div>
        </div>

        {/* Right Section: Interactive Auth Form */}
        <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {viewMode === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="mb-1">
                <h2 className="text-xl font-bold text-white flex items-center gap-2 font-sans tracking-tight">
                  <LogIn className="w-5 h-5 text-indigo-400" />
                  เข้าสู่ระบบผู้ใช้งานเครือข่าย
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-sans">
                  เข้าสู่บอร์ดตั้งค่าและตรวจสอบสัญญาณการเทรดอัตโนมัติรายบุคคล
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xxs font-semibold uppercase tracking-wider text-slate-400">หมายเลขบัญชี MT5 ID</label>
                <input
                  id="login_username_input"
                  type="text"
                  placeholder="กรอกหมายเลขบัญชี MT5 (เช่น 62457573)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all font-mono"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xxs font-semibold uppercase tracking-wider text-slate-400">รหัสผ่านเพื่อล็อกอินเข้าระบบ</label>
                  <span className="text-xxs text-slate-600 hover:text-indigo-400 transition-colors cursor-help flex items-center gap-0.5">
                    <HelpCircle className="w-3 h-3" />
                    ลืมรหัสผ่าน?
                  </span>
                </div>
                <input
                  id="login_password_input"
                  type="password"
                  placeholder="กรอกรหัสผ่านระบบบอทของท่าน (ถ้าลืมแอดมินสามารถรีเซ็ตได้)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all"
                />
              </div>

              <button
                id="login_submit_button"
                type="submit"
                className="mt-2 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-xs text-white shadow-lg shadow-indigo-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                เข้าสู่แผงควบคุมหลัก
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('register');
                    setError('');
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 font-medium cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  เป็นสมาชิกใหม่ใช่หรือไม่? สมัครร่วมเครือข่ายฟรี
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div className="mb-1">
                <h2 className="text-xl font-bold text-white flex items-center gap-2 font-sans tracking-tight">
                  <UserPlus className="w-5 h-5 text-indigo-400" />
                  ลงทะเบียนร่วมกลุ่มบอทเครือข่าย
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-sans">
                  ลงทะเบียนพอร์ตเพื่อเชื่อมต่อระบบสัญญาณ Martingale คุมอัตราการสูญเสียต่ำ
                </p>
              </div>

              {/* Step 1: Partner link panel */}
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xxs font-bold uppercase tracking-wider text-indigo-300">ขั้นตอนที่ 1: สมัครเปิดบัญชี XM ผ่านลิงก์พาร์ทเนอร์</h4>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded tracking-wide">
                    จำเป็นสำหรับการรับสิทธิ์
                  </span>
                </div>

                <p className="text-xxs text-slate-400 leading-relaxed">
                  กรุณาลงทะเบียนพอร์ตเทรดจริงภายใต้ลิงก์พันธมิตรด้านล่างนี้ และฝากเงินขั้นต่ำ 3,500 บาท เพื่อเข้าเครือข่ายระบบส่งสัญญาณ
                </p>

                <div className="flex gap-2 w-full mt-0.5">
                  <div className="flex-grow px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xxs font-mono text-indigo-300 overflow-x-auto whitespace-nowrap select-all scrollbar-none flex items-center">
                    {referralLink}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-2 rounded-xl border border-slate-800 hover:border-indigo-500 bg-slate-900 text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-1 text-xxs cursor-pointer shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                  </button>
                  <a
                    href={referralLink}
                    target="_blank"
                    rel="noreferrer referrer"
                    className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xxs transition-all flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    ไปยังหน้า XM
                  </a>
                </div>
              </div>

              {/* Step 2 Form inputs */}
              <div className="flex flex-col gap-3 mt-1.5">
                <h4 className="text-xxs font-bold uppercase tracking-wider text-slate-400">ขั้นตอนที่ 2: กรอกข้อมูลลงทะเบียนของท่าน</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xxs font-semibold uppercase tracking-wider text-slate-500">ชื่อ-นามสกุลจริงผู้ใช้</label>
                    <input
                      id="register_name_input"
                      type="text"
                      placeholder="กรอกชื่อ-นามสกุลผู้เทรด"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xxs font-semibold uppercase tracking-wider text-slate-500">หมายเลขบัญชี MT5 ID</label>
                    <input
                      id="register_username_input"
                      type="text"
                      placeholder="เช่น 62457573"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xxs font-semibold uppercase tracking-wider text-slate-500">กำหนดรหัสผ่านล็อกอินเข้าแผงระบบ</label>
                  <input
                    id="register_password_input"
                    type="password"
                    placeholder="ตั้งรหัสผ่านสำหรับลงชื่อเข้าใช้บอร์ด (ใช้รหัสผ่านทั่วไปเพื่อความปลอดภัย)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all"
                    required
                  />
                </div>
              </div>

              <button
                id="register_submit_button"
                type="submit"
                className="mt-3 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold text-xs text-white shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                ยืนยันการลงทะเบียนเครือข่าย
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('login');
                    setError('');
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 font-medium cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  มีบัญชีแล้วหรือต้องการกดยืนยัน? เข้าสู่ระบบที่นี่
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
