import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import XPayABI from '@/lib/contracts/XPay.json';
import { createAdminClient } from '@/utils/supabase/admin';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

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
    const amt = parseFloat(amount);
    if (amt <= 0 || amt > 1000) {
      return NextResponse.json({ error: 'Số tiền không hợp lệ (1-1000)' }, { status: 400 });
    }

    const relayAccount = privateKeyToAccount(process.env.RELAY_PRIVATE_KEY as `0x${string}`);
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
      const { request: regReq } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: XPayABI,
        functionName: 'registerFor',
        args: [userAddress as `0x${string}`],
        account: relayAccount,
      });
      const regHash = await walletClient.writeContract(regReq);
      await publicClient.waitForTransactionReceipt({ hash: regHash });
    }

    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'depositFor',
      args: [userAddress as `0x${string}`, BigInt(Math.floor(amt))],
      account: relayAccount,
    });

    const txHash = await walletClient.writeContract(request);

    // Ghi lịch sử giao dịch
    try {
      const admin = createAdminClient();
      await admin.from('transactions').insert({
        type: 'deposit',
        from_address: null,
        to_address: userAddress,
        amount: Math.floor(amt),
        tx_hash: txHash,
        status: 'success',
      });
    } catch (logErr) {
      console.error('Lỗi ghi lịch sử giao dịch (deposit):', logErr);
      // Không throw — giao dịch on-chain đã thành công, không nên fail response
    }

    return NextResponse.json({ success: true, txHash });
  } catch (e: any) {
    console.error('Relay deposit error:', e);
    return NextResponse.json({ error: e.shortMessage || e.message }, { status: 500 });
  }
}