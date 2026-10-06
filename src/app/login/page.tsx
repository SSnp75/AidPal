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
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const params = await searchParams;
  const next = safeNextPath(params.next ?? null);
  const authError = params.error === "auth";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <LoginForm next={next} authError={authError} />
    </div>
  );
}
