export default function SupabaseNotConfigured() {
  return (
    <div className="mx-auto max-w-lg mt-16 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <h2 className="text-xl font-semibold text-text-primary mb-3">
        Supabase is not configured
      </h2>
      <p className="text-text-secondary mb-4">
        This app requires a Supabase project to work. Follow the setup steps in{" "}
        <code className="font-mono text-accent">README.md</code> and{" "}
        <code className="font-mono text-accent">.env.example</code> to add your
        project URL and anon key.
      </p>
      <ol className="text-left text-sm text-text-secondary space-y-1 list-decimal list-inside">
        <li>
          Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code>
        </li>
        <li>
          Paste your Supabase <strong>URL</strong> and <strong>anon key</strong>
        </li>
        <li>Restart the dev server</li>
      </ol>
    </div>
  );
}
