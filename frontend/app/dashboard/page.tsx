// file: x-pay/frontend/app/dashboard/page.tsx
'use client'
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Chưa đăng nhập → về trang login
        router.replace("/");
      } else {
        setUser(user);
      }
      setLoading(false);
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black min-h-screen">
        <p className="text-zinc-500 text-sm">Đang tải...</p>
      </div>
    );
  }

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const fullName = user.user_metadata?.full_name as string | undefined ?? user.email;
  const email = user.email;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black min-h-screen font-sans">
      <main className="flex flex-col items-center gap-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-md px-10 py-12 w-full max-w-sm text-center">
        {/* Avatar */}
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={80}
            height={80}
            className="rounded-full ring-2 ring-zinc-200 dark:ring-zinc-700"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-500">
            {fullName?.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Tên */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-black dark:text-white">
            {fullName}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{email}</p>
        </div>

        {/* Badge đăng nhập thành công */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/40 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Đã đăng nhập với Google
        </span>

        {/* Nút đăng xuất */}
        <button
          onClick={handleLogout}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-full border border-solid border-black/[.1] dark:border-white/[.15] px-5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 text-black dark:text-white"
        >
          Đăng xuất
        </button>
      </main>
    </div>
  );
}