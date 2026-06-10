// file: frontend/app/api/transfer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import XPayABI from '@/lib/contracts/XPay.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
});

export async function POST(req: NextRequest) {
  try {
    const { fromAddress, toAddress, amount } = await req.json();

    if (!fromAddress || !toAddress || !amount) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }
    const amt = parseFloat(amount);
    if (amt <= 0) {
      return NextResponse.json({ error: 'Số tiền phải lớn hơn 0' }, { status: 400 });
    }

    const relayAccount = privateKeyToAccount(process.env.RELAY_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account: relayAccount,
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
    });

    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'transferFor',
      args: [
        fromAddress as `0x${string}`,
        toAddress as `0x${string}`,
        BigInt(Math.floor(amt)),
      ],
      account: relayAccount,
    });

    const txHash = await walletClient.writeContract(request);
    return NextResponse.json({ success: true, txHash });
  } catch (e: any) {
    console.error('Relay transfer error:', e);
    return NextResponse.json({ error: e.shortMessage || e.message }, { status: 500 });
  }
}