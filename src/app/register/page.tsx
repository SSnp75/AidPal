import { isSupabaseConfigured } from "@/lib/supabase/config";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <RegisterForm />
    </div>
  );
}
