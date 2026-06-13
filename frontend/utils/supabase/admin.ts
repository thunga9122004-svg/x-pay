// file: frontend/utils/supabase/admin.ts
// Client dùng service role key — CHỈ dùng trong API routes (server-side), không import vào client component.
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}