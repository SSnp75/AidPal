const PLACEHOLDER_URL = "https://YOUR-PROJECT-ref.supabase.co";
const PLACEHOLDER_KEY = "your-anon-key";

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!url || !anonKey) return null;
  if (url === PLACEHOLDER_URL || anonKey === PLACEHOLDER_KEY) return null;

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
