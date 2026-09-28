import { createClient } from "@supabase/supabase-js";
import type { AuthContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

type RuntimeGlobals = typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
const env = (n: string) => (globalThis as RuntimeGlobals).process?.env?.[n]?.trim() || undefined;

function url() {
  const u = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  if (!u) throw new Error("SUPABASE_URL is required");
  return u;
}
function key() {
  const k = env("SUPABASE_PUBLISHABLE_KEY") ?? env("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (k) return k;
  const set = env("SUPABASE_PUBLISHABLE_KEYS");
  if (set) {
    try {
      const p = JSON.parse(set) as Record<string, unknown>;
      const f = [p["default"], ...Object.values(p)].find((v): v is string => typeof v === "string" && v.startsWith("sb_publishable_"));
      if (f) return f;
    } catch { /* ignore */ }
  }
  const legacy = env("SUPABASE_ANON_KEY") ?? env("VITE_SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase publishable key is required");
}

// Forwards the verified OAuth token so RLS runs as the signed-in user.
export function supabaseForUser(ctx: AuthContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("Sign-in required");
  return createClient<Database>(url(), key(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
