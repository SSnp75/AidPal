export default function SupabaseNotConfigured() {
  return (
    <div className="mx-auto max-w-lg mt-16 rounded-xl border border-yellow-700/40 bg-yellow-950/30 p-8 text-center">
      <h2 className="text-xl font-semibold text-yellow-300 mb-3">
        Supabase is not configured
      </h2>
      <p className="text-gray-300 mb-4">
        This app requires a Supabase project to work. Follow the setup steps in{" "}
        <code className="text-yellow-400">README.md</code> and{" "}
        <code className="text-yellow-400">.env.example</code> to add your
        project URL and anon key.
      </p>
      <ol className="text-left text-sm text-gray-400 space-y-1 list-decimal list-inside">
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code>
        </li>
        <li>
          Paste your Supabase <strong>URL</strong> and <strong>anon key</strong>
        </li>
        <li>Restart the dev server</li>
      </ol>
    </div>
  );
}
