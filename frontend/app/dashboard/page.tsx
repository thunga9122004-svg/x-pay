// file: x-pay/frontend/app/dashboard/page.tsx
'use client'
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import { createPublicClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import XPayABI from '@/lib/contracts/XPay.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
});

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [depositAmount, setDepositAmount] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'deposit' | 'transfer'>('deposit');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const createAndSaveWallet = useCallback(async (userId: string) => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const addr = account.address;
    await supabase.from('wallets').update({
      wallet_address: addr,
      encrypted_private_key: pk,
    }).eq('user_id', userId);
    setWalletAddress(addr);
    return addr;
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }
      setUser(user);

      const { data: wallet } = await supabase
        .from('wallets')
        .select('wallet_address, encrypted_private_key')
        .eq('user_id', user.id)
        .single();

      if (wallet?.wallet_address) {
        setWalletAddress(wallet.wallet_address);
      } else {
        await createAndSaveWallet(user.id);
      }
      setLoading(false);
    };
    init();
  }, []);

  const fetchBalance = useCallback(async (addr?: string) => {
    const address = (addr || walletAddress) as `0x${string}`;
    if (!address) return;
    try {
      const bal = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: XPayABI,
        functionName: 'getBalance',
        args: [address],
      });
      setBalance((bal as bigint).toString());
    } catch (e) { console.error(e); }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) fetchBalance(walletAddress);
  }, [walletAddress]);

  async function handleDeposit() {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return setMessage('❌ Nhập số tiền hợp lệ');
    if (amount > 1000) return setMessage('❌ Tối đa 1000 USD mỗi lần nạp');
    if (!walletAddress) return setMessage('❌ Chưa có ví');

    setTxLoading(true); setMessage('');
    try {
      const res = await fetch('/api/relay/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: walletAddress, amount: depositAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('✅ Nạp thành công! Số dư cập nhật sau ~15 giây.');
      setDepositAmount('');
      setTimeout(() => fetchBalance(), 15000);
    } catch (e: any) {
      setMessage('❌ ' + e.message);
    }
    setTxLoading(false);
  }

  async function handleTransfer() {
    if (!transferTo || !transferAmount) return setMessage('❌ Điền đầy đủ thông tin');
    if (!walletAddress) return setMessage('❌ Chưa có ví');

    setTxLoading(true); setMessage('');
    try {
      const res = await fetch('/api/relay/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAddress: walletAddress, toAddress: transferTo, amount: transferAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('✅ Chuyển tiền thành công! Cập nhật sau ~15 giây.');
      setTransferTo(''); setTransferAmount('');
      setTimeout(() => fetchBalance(), 15000);
    } catch (e: any) {
      setMessage('❌ ' + e.message);
    }
    setTxLoading(false);
  }

  async function handleDeleteAccount() {
    if (!user) return;
    await supabase.from('wallets').update({
      wallet_address: null,
      encrypted_private_key: null,
      balance: 0,
    }).eq('user_id', user.id);
    await supabase.auth.signOut();
    router.replace("/");
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Đang khởi tạo tài khoản...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const fullName = (user.user_metadata?.full_name as string) ?? user.email ?? '';
  const email = user.email ?? '';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">

        {/* Profile */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-6">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Avatar" width={56} height={56}
                className="rounded-full ring-2 ring-indigo-100 dark:ring-indigo-900" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xl font-bold text-indigo-600">
                {fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-white truncate">{fullName}</p>
              <p className="text-sm text-zinc-400 truncate">{email}</p>
              <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-green-50 dark:bg-green-950 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Google
              </span>
            </div>
            <button onClick={handleLogout}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Balance */}
        <div className="bg-indigo-600 rounded-2xl p-6 text-white">
          <p className="text-indigo-200 text-xs mb-1">Địa chỉ ví</p>
          <p className="font-mono text-sm text-indigo-100 mb-4">
            {walletAddress ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}` : 'Đang tạo...'}
          </p>
          <p className="text-indigo-200 text-xs mb-1">Số dư</p>
          <p className="text-4xl font-bold tracking-tight">
            ${balance}
            <span className="text-lg font-normal text-indigo-300 ml-2">USD</span>
          </p>
          <button onClick={() => fetchBalance()}
            className="mt-3 text-indigo-300 hover:text-white text-xs underline transition-colors">
            🔄 Cập nhật số dư
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
            message.startsWith('✅')
              ? 'bg-green-50 text-green-700 border-green-100 dark:bg-green-950 dark:text-green-400 dark:border-green-900'
              : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-900'
          }`}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
          <div className="flex border-b border-zinc-100 dark:border-zinc-800">
            {(['deposit', 'transfer'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                }`}>
                {t === 'deposit' ? '💰 Nạp tiền' : '📤 Chuyển tiền'}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'deposit' ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">Tối đa $1,000 USD mỗi lần nạp</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Số tiền USD"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button onClick={handleDeposit} disabled={txLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                    {txLoading ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Nạp'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Địa chỉ ví người nhận (0x...)"
                  value={transferTo}
                  onChange={e => setTransferTo(e.target.value)}
                  className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Số tiền USD"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button onClick={handleTransfer} disabled={txLoading}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                    {txLoading ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Gửi'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Test mode */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">🧪 Chế độ test</p>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-500 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
              Xóa tài khoản & ví (reset để test lại)
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-500 font-medium text-center">Xác nhận xóa?</p>
              <p className="text-xs text-zinc-400 text-center">Tài khoản Google vẫn còn, chỉ xóa ví trong hệ thống</p>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  Huỷ
                </button>
                <button onClick={handleDeleteAccount}
                  className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors">
                  Xác nhận xóa
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}