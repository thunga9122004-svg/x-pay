import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import XPayABI from '@/lib/contracts/XPay.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RELAY_PRIVATE_KEY = process.env.RELAY_PRIVATE_KEY as `0x${string}`;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
});

export async function POST(req: NextRequest) {
  try {
    const { userAddress, amount } = await req.json();

    if (!userAddress || !amount) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }
    if (parseFloat(amount) > 1000) {
      return NextResponse.json({ error: 'Tối đa 1000 USD' }, { status: 400 });
    }

    const relayAccount = privateKeyToAccount(RELAY_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account: relayAccount,
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
    });

    // Auto-register nếu chưa
    const isReg = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'isRegistered',
      args: [userAddress as `0x${string}`],
    });

    if (!isReg) {
      // Gọi register với account của user — relay không thể register thay
      // Contract cần chính user gọi register
      // → Dùng user's private key cho bước này
      const { userPrivateKey } = await req.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Cần register trước', needsRegister: true },
        { status: 400 }
      );
    }

    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'deposit',
      args: [userAddress as `0x${string}`, parseEther(amount.toString())],
      account: relayAccount,
    });

    const txHash = await walletClient.writeContract(request);
    return NextResponse.json({ success: true, txHash });
  } catch (e: any) {
    return NextResponse.json({ error: e.shortMessage || e.message }, { status: 500 });
  }
}