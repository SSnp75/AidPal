import { isSupabaseConfigured } from "@/lib/supabase/config";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  if (!isSupabaseConfigured()) {
    return <SupabaseNotConfigured />;
  }
  return <RegisterForm />;
}
