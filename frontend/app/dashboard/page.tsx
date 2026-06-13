'use client'
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import { createPublicClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import XPayABI from '@/lib/contracts/XPay.json';
import {
  ScanLine, X, Copy, Check, History,
  ArrowDownLeft, ArrowUpRight, ExternalLink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const PAGE_SIZE = 10;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
});

type Tx = {
  id: string;
  type: 'deposit' | 'transfer';
  from_address: string | null;
  to_address: string;
  amount: number;
  tx_hash: string;
  status: string;
  created_at: string;
};

function shortAddr(addr?: string | null) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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

  // ── QR Modal state ─────────────────────────────────────────────────────
  const [showQR, setShowQR] = useState(false);
  const [qrView, setQrView] = useState<'scan' | 'mine'>('scan');
  const [copied, setCopied] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // ── History state ─────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txPage, setTxPage] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);
  const [txListLoading, setTxListLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);

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

  // ── Lịch sử giao dịch ─────────────────────────────────────────────────
  const loadHistory = useCallback(async (page: number) => {
    if (!walletAddress) return;
    setTxListLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`from_address.eq.${walletAddress},to_address.eq.${walletAddress}`)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!error && data) {
      setTxs(prev => (page === 0 ? (data as Tx[]) : [...prev, ...(data as Tx[])]));
      setTxHasMore(data.length === PAGE_SIZE);
      setTxPage(page);
    }
    setTxListLoading(false);
  }, [walletAddress, supabase]);

  function openHistory() {
    setShowHistory(true);
    setTxs([]);
    setTxHasMore(true);
    loadHistory(0);
  }

  // ── QR Scanner lifecycle ─────────────────────────────────────────────────
  const isScanningRef = useRef(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner && isScanningRef.current) {
      isScanningRef.current = false;
      try {
        await scanner.stop();
      } catch {
        // already stopped, ignore
      }
      try {
        scanner.clear();
      } catch {
        // ignore
      }
    }
    scannerRef.current = null;
  }, []);

  useEffect(() => {
    if (showQR && qrView === 'scan') {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 230 },
        (decodedText) => {
          if (ADDRESS_REGEX.test(decodedText)) {
            setTransferTo(decodedText);
            setTab('transfer');
            setMessage('');
            stopScanner().then(() => setShowQR(false));
          } else {
            setMessage('❌ Mã QR không chứa địa chỉ ví hợp lệ');
          }
        },
        () => {} // ignore scan errors per-frame
      ).then(() => {
        isScanningRef.current = true;
      }).catch(() => {
        setMessage('❌ Không thể truy cập camera. Hãy cấp quyền camera cho trang web.');
      });

      return () => {
        stopScanner();
      };
    }
  }, [showQR, qrView, stopScanner]);

  function closeQRModal() {
    stopScanner();
    setShowQR(false);
    setQrView('scan');
  }

  function openQRModal() {
    // Laptop/PC (màn hình rộng) → mở thẳng "Mã QR của tôi"
    // Điện thoại (màn hình hẹp) → mở camera quét
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    setQrView(isDesktop ? 'mine' : 'scan');
    setShowQR(true);
  }

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Nạp tiền ─────────────────────────────────────────────────────────────
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

  // ── Chuyển tiền ──────────────────────────────────────────────────────────
  async function handleTransfer() {
    if (!transferTo || !transferAmount) return setMessage('❌ Điền đầy đủ thông tin');
    if (!walletAddress) return setMessage('❌ Chưa có ví');

    // Kiểm tra định dạng địa chỉ ví trước
    if (!ADDRESS_REGEX.test(transferTo)) {
      return setMessage('❌ Địa chỉ ví không tồn tại');
    }

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
          <div className="flex items-start justify-between">
            <div>
              <p className="text-indigo-200 text-xs mb-1">Địa chỉ ví</p>
              <p className="font-mono text-sm text-indigo-100 mb-4">
                {walletAddress ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}` : 'Đang tạo...'}
              </p>
            </div>
            <button
              onClick={openQRModal}
              title="Quét / Hiện mã QR"
              className="bg-white/15 hover:bg-white/25 rounded-xl p-2.5 transition-colors"
            >
              <ScanLine size={20} />
            </button>
          </div>
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

        {/* Lịch sử giao dịch */}
        <button
          onClick={openHistory}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 py-3.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <History size={18} />
          Lịch sử giao dịch
        </button>

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
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Địa chỉ ví người nhận (0x...)"
                    value={transferTo}
                    onChange={e => setTransferTo(e.target.value)}
                    className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                  />
                  <button
                    onClick={openQRModal}
                    title="Quét mã QR"
                    className="border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <ScanLine size={18} />
                  </button>
                </div>
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

      {/* ── QR Modal ── */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <p className="font-semibold text-zinc-900 dark:text-white">
                {qrView === 'scan' ? 'Quét mã QR' : 'Mã QR của tôi'}
              </p>
              <button onClick={closeQRModal} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {qrView === 'scan' ? (
                <div className="space-y-3">
                  <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 aspect-square" />
                  <p className="text-xs text-zinc-400 text-center">
                    Đưa camera vào mã QR của địa chỉ ví người nhận
                  </p>
                  <button
                    onClick={() => {
                      stopScanner();
                      setQrView('mine');
                    }}
                    className="w-full text-center text-sm font-medium text-indigo-600 hover:text-indigo-700 underline py-2"
                  >
                    Mã QR của tôi
                  </button>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col items-center">
                  {walletAddress && (
                    <div className="bg-white p-4 rounded-2xl border border-zinc-100">
                      <QRCodeSVG value={walletAddress} size={200} />
                    </div>
                  )}
                  <div className="w-full">
                    <p className="text-xs text-zinc-400 mb-1 text-center">Địa chỉ ví của bạn</p>
                    <button
                      onClick={copyAddress}
                      className="w-full flex items-center justify-center gap-2 font-mono text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-100 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors break-all"
                    >
                      {copied ? <Check size={14} className="text-green-500 shrink-0" /> : <Copy size={14} className="shrink-0" />}
                      <span className="truncate">{walletAddress}</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setQrView('scan')}
                    className="w-full text-center text-sm font-medium text-indigo-600 hover:text-indigo-700 underline py-1"
                  >
                    ← Quay lại quét mã
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── History Panel ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <p className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <History size={18} /> Lịch sử giao dịch
              </p>
              <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X size={20} />
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {txs.length === 0 && !txListLoading && (
                <p className="text-center text-sm text-zinc-400 py-10">Chưa có giao dịch nào</p>
              )}

              {txs.map(t => {
                const isOut = t.type === 'transfer' && t.from_address?.toLowerCase() === walletAddress?.toLowerCase();
                const isDeposit = t.type === 'deposit';
                const label = isDeposit ? 'Nạp tiền' : isOut ? 'Chuyển đi' : 'Nhận tiền';
                const counterparty = isDeposit
                  ? null
                  : isOut ? t.to_address : t.from_address;

                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTx(t)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isOut ? 'bg-red-50 text-red-500 dark:bg-red-950' : 'bg-green-50 text-green-600 dark:bg-green-950'
                    }`}>
                      {isOut ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
                      <p className="text-xs text-zinc-400">
                        {counterparty ? shortAddr(counterparty) : 'Hệ thống'} · {formatDate(t.created_at)}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold shrink-0 ${isOut ? 'text-red-500' : 'text-green-600'}`}>
                      {isOut ? '-' : '+'}${t.amount}
                    </p>
                  </button>
                );
              })}

              {txHasMore && txs.length > 0 && (
                <div className="p-4">
                  <button
                    onClick={() => loadHistory(txPage + 1)}
                    disabled={txListLoading}
                    className="w-full py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {txListLoading ? 'Đang tải...' : 'Tải thêm'}
                  </button>
                </div>
              )}

              {txListLoading && txs.length === 0 && (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction Detail Modal ── */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <p className="font-semibold text-zinc-900 dark:text-white">Chi tiết giao dịch</p>
              <button onClick={() => setSelectedTx(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {(() => {
                const t = selectedTx;
                const isOut = t.type === 'transfer' && t.from_address?.toLowerCase() === walletAddress?.toLowerCase();
                const isDeposit = t.type === 'deposit';
                const label = isDeposit ? 'Nạp tiền' : isOut ? 'Chuyển đi' : 'Nhận tiền';

                return (
                  <>
                    <div className="text-center">
                      <div className={`inline-flex w-12 h-12 rounded-full items-center justify-center mb-2 ${
                        isOut ? 'bg-red-50 text-red-500 dark:bg-red-950' : 'bg-green-50 text-green-600 dark:bg-green-950'
                      }`}>
                        {isOut ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                      </div>
                      <p className="text-sm text-zinc-400">{label}</p>
                      <p className={`text-3xl font-bold ${isOut ? 'text-red-500' : 'text-green-600'}`}>
                        {isOut ? '-' : '+'}${t.amount}
                      </p>
                    </div>

                    <div className="space-y-2 text-sm">
                      {!isDeposit && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Từ</span>
                            <span className="font-mono text-zinc-700 dark:text-zinc-300">{shortAddr(t.from_address)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Đến</span>
                            <span className="font-mono text-zinc-700 dark:text-zinc-300">{shortAddr(t.to_address)}</span>
                          </div>
                        </>
                      )}
                      {isDeposit && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Vào ví</span>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">{shortAddr(t.to_address)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Thời gian</span>
                        <span className="text-zinc-700 dark:text-zinc-300">{formatDate(t.created_at)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Trạng thái</span>
                        <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          Thành công
                        </span>
                      </div>
                    </div>

                    <a
                      href={`https://sepolia.etherscan.io/tx/${t.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-700 rounded-xl py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Xem trên Etherscan <ExternalLink size={14} />
                    </a>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}