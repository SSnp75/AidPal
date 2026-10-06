import { isSupabaseConfigured } from "@/lib/supabase/config";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import { safeNextPath } from "@/lib/validation";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SupabaseNotConfigured />;
  }

  const params = await searchParams;
  const next = safeNextPath(params.next ?? null);
  const authError = params.error === "auth";

  return <LoginForm next={next} authError={authError} />;
}
