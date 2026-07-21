import { useState, useEffect } from 'react';
import { Users, CheckCircle2, XCircle, Trash2, Search, RefreshCw, Eye, ShieldCheck, Wallet, ArrowLeft, LogOut } from 'lucide-react';

interface AdminUser {
  username: string;
  fullName: string;
  depositVerified: boolean;
  registeredAt: string;
  lastActiveAt?: string;
  balance: number;
  currency: string;
  isActive: boolean;
}

interface AdminPanelProps {
  id: string;
  currentUser: { username: string; fullName: string } | null;
  onLogout: () => void;
  onSelectUserImpersonate?: (username: string) => void;
  onBackToClient: () => void;
}

export function AdminPanel({ id, currentUser, onLogout, onSelectUserImpersonate, onBackToClient }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [refreshCount]);

  const handleToggleDeposit = async (username: string) => {
    try {
      const res = await fetch('/api/admin/toggle-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to toggle deposit', err);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ MT5 #${username}?`)) return;
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to delete user', err);
    }
  };

  // Filter list
  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute Stats
  const totalMembers = users.filter(u => u.username !== 'admin').length;
  const activeMembers = users.filter(u => u.username !== 'admin' && u.depositVerified).length;
  const inactiveMembers = users.filter(u => u.username !== 'admin' && !u.depositVerified).length;
  const totalBalanceUSD = users.filter(u => u.username !== 'admin').reduce((acc, curr) => acc + (curr.balance || 0), 0);

  return (
    <div id={id} className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans">
      {/* Admin Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur py-4 px-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                แผงควบคุมระบบเครือข่ายหลังบ้าน (Admin Backoffice)
                <span className="text-xs bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded font-mono">
                  ACTIVE
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                ระบบจัดการสมาชิกลงทะเบียนและตรวจสอบยอดเงินฝากพาร์ทเนอร์ XM ขั้นต่ำ 3,500 บาท
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onBackToClient}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไปหน้าเทรดบอท
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 px-4 py-2 rounded-xl text-xs font-bold text-rose-400 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col gap-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">สมาชิกทั้งหมด</p>
              <h3 className="text-2xl font-bold text-white mt-1.5">{totalMembers} คน</h3>
              <p className="text-xxs text-indigo-400 font-medium mt-1">ลงทะเบียนในระบบสำเร็จ</p>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">เปิดใช้งานแล้ว (Active)</p>
              <h3 className="text-2xl font-bold text-emerald-400 mt-1.5">{activeMembers} คน</h3>
              <p className="text-xxs text-emerald-500 font-medium mt-1">ฝากเงินเรียบร้อย/เทรดส่งสัญญาณได้</p>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ยังไม่เปิดใช้ (Inactive)</p>
              <h3 className="text-2xl font-bold text-rose-400 mt-1.5">{inactiveMembers} คน</h3>
              <p className="text-xxs text-rose-500 font-medium mt-1">รอยืนยันยอดฝากขั้นต่ำ 3,500 บาท</p>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-500/10 text-rose-400">
              <XCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ยอดบาลานซ์สมาชิกรวม</p>
              <h3 className="text-2xl font-bold text-white mt-1.5">${totalBalanceUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
              <p className="text-xxs text-indigo-400 font-medium mt-1">ยอดรวมพอร์ตสมาชิกในเซิร์ฟเวอร์</p>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* User Management Section */}
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/10 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                รายชื่อเครือข่ายสมาชิกทั้งหมดในระบบ
              </h2>
              <p className="text-xxs text-slate-500">ตรวจสอบความถูกต้องบัญชี XM, ความคืบหน้าการฝากเงิน 3,500 บาท และส่งอัพเดทสิทธิ์การเทรด</p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-grow sm:flex-grow-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="ค้นหา MT5 หรือชื่อผู้ใช้..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 focus:outline-none focus:border-indigo-500 text-white w-full sm:w-64"
                />
              </div>

              <button
                onClick={() => setRefreshCount(prev => prev + 1)}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-slate-500 font-medium uppercase tracking-wider">
                  <th className="py-3 px-4 text-xxs font-semibold">หมายเลข MT5 ID</th>
                  <th className="py-3 px-4 text-xxs font-semibold">ชื่อ-นามสกุลจริง</th>
                  <th className="py-3 px-4 text-xxs font-semibold">วันที่สมัคร</th>
                  <th className="py-3 px-4 text-xxs font-semibold">บาลานซ์พอร์ตจริง</th>
                  <th className="py-3 px-4 text-xxs font-semibold">เปิดบอทอัตโนมัติ</th>
                  <th className="py-3 px-4 text-xxs font-semibold">สถานะการฝากเงิน (3,500 THB)</th>
                  <th className="py-3 px-4 text-xxs font-semibold text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40 font-mono">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-600 italic">
                      ไม่พบข้อมูลสมาชิกในระบบ
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    user.username !== 'admin' && (
                      <tr key={user.username} className="hover:bg-slate-900/10 text-slate-300">
                        <td className="py-3 px-4 font-bold text-white">
                          #{user.username}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-200">{user.fullName}</td>
                        <td className="py-3 px-4 text-slate-500 text-xxs font-sans">
                          {new Date(user.registeredAt).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-3 px-4 text-emerald-400 font-bold">
                          {user.balance > 0 ? `${user.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${user.currency || 'USD'}` : '0.00 USD'}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className={`px-2 py-0.5 rounded text-xxs font-bold ${
                            user.isActive 
                              ? 'bg-indigo-500/10 text-indigo-400' 
                              : 'bg-slate-800/80 text-slate-500'
                          }`}>
                            {user.isActive ? 'เปิดใช้งาน (RUNNING)' : 'ปิดการทำงาน'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          {user.depositVerified ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xxs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Active (ยืนยันแล้ว)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xxs font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              Inactive (รอยืนยันยอดฝาก)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {onSelectUserImpersonate && (
                              <button
                                onClick={() => onSelectUserImpersonate(user.username)}
                                className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 hover:text-white transition-all cursor-pointer"
                                title="ดูแผงการตั้งค่าบอท"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => handleToggleDeposit(user.username)}
                              className={`px-2.5 py-1 text-xxs font-bold rounded-lg border transition-all cursor-pointer ${
                                user.depositVerified
                                  ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-400'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400'
                              }`}
                            >
                              {user.depositVerified ? 'ระงับสัญญาณ' : 'ยืนยันยอดฝาก'}
                            </button>

                            <button
                              onClick={() => handleDeleteUser(user.username)}
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/20 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                              title="ลบบัญชีผู้ใช้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
