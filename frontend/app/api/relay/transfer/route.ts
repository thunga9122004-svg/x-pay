// file: frontend/app/api/relay/transfer/route.ts
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
    const { fromAddress, toAddress, amount } = await req.json();

    if (!fromAddress || !toAddress || !amount) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }
    const amt = parseFloat(amount);
    if (amt <= 0) {
      return NextResponse.json({ error: 'Số tiền phải lớn hơn 0' }, { status: 400 });
    }
    if (fromAddress.toLowerCase() === toAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Không thể chuyển cho chính mình' }, { status: 400 });
    }

    const relayAccount = privateKeyToAccount(process.env.RELAY_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account: relayAccount,
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
    });

    // Kiểm tra người gửi đã registered chưa
    const senderReg = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'isRegistered',
      args: [fromAddress as `0x${string}`],
    });
    if (!senderReg) {
      return NextResponse.json({ error: 'Ví của bạn chưa được đăng ký. Hãy nạp tiền trước.' }, { status: 400 });
    }

    // Kiểm tra số dư
    const senderBalance = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'getBalance',
      args: [fromAddress as `0x${string}`],
    });
    if ((senderBalance as bigint) < BigInt(Math.floor(amt))) {
      return NextResponse.json({ error: 'Số dư không đủ' }, { status: 400 });
    }

    // Auto-register người nhận nếu chưa có
    const recipientReg = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: XPayABI,
      functionName: 'isRegistered',
      args: [toAddress as `0x${string}`],
    });

    if (!recipientReg) {
      const { request: regReq } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: XPayABI,
        functionName: 'registerFor',
        args: [toAddress as `0x${string}`],
        account: relayAccount,
      });
      const regHash = await walletClient.writeContract(regReq);
      await publicClient.waitForTransactionReceipt({ hash: regHash });
    }

    // Thực hiện chuyển tiền
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

    // Ghi lịch sử giao dịch
    try {
      const admin = createAdminClient();
      await admin.from('transactions').insert({
        type: 'transfer',
        from_address: fromAddress,
        to_address: toAddress,
        amount: Math.floor(amt),
        tx_hash: txHash,
        status: 'success',
      });
    } catch (logErr) {
      console.error('Lỗi ghi lịch sử giao dịch (transfer):', logErr);
    }

    return NextResponse.json({ success: true, txHash });
  } catch (e: any) {
    console.error('Relay transfer error:', e);
    return NextResponse.json({ error: e.shortMessage || e.message }, { status: 500 });
  }
}