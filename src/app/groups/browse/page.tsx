import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import { escapePostgrestLike } from "@/lib/validation";
import type { Group, Country, GroupCategory } from "@/types/db";

export const metadata = { title: "Browse Groups — aidPAL" };

type Search = {
  country?: string;
  category?: string;
  q?: string;
};

export default async function BrowseGroupsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country : "";
  const category = typeof params.category === "string" ? params.category : "";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();

  // All readable groups (RLS already limits to public + member-visible).
  const { data: allGroups } = await supabase
    .from("groups")
    .select(
      "id,name,description,is_private,owner_id,created_at,country_code,city,category_slug,scope"
    )
    .order("created_at", { ascending: false })
    .returns<Group[]>();

  const groups = allGroups ?? [];

  // Reference lookups for display labels (facets derived from groups only).
  const [{ data: countryRows }, { data: categoryRows }] = await Promise.all([
    supabase.from("countries").select("code,name,flag").returns<Country[]>(),
    supabase
      .from("group_categories")
      .select("slug,label")
      .returns<GroupCategory[]>(),
  ]);
  const countryName = new Map((countryRows ?? []).map((c) => [c.code, c]));
  const categoryLabel = new Map(
    (categoryRows ?? []).map((c) => [c.slug, c.label])
  );

  // Tag matches: if a keyword is present, find group ids with a matching tag.
  let tagMatchIds: Set<string> | null = null;
  if (q) {
    const term = escapePostgrestLike(q);
    if (term) {
      const { data: tagRows } = await supabase
        .from("group_tags")
        .select("group_id,tag")
        .ilike("tag", `%${term}%`)
        .limit(200)
        .returns<{ group_id: string; tag: string }[]>();
      tagMatchIds = new Set((tagRows ?? []).map((t) => t.group_id));
    }
  }

  // Derive facet lists ONLY from groups that actually exist (no empty buckets).
  const countryFacet = new Map<string, number>();
  const categoryFacet = new Map<string, number>();
  for (const g of groups) {
    if (g.country_code)
      countryFacet.set(g.country_code, (countryFacet.get(g.country_code) ?? 0) + 1);
    if (g.category_slug)
      categoryFacet.set(
        g.category_slug,
        (categoryFacet.get(g.category_slug) ?? 0) + 1
      );
  }

  // Apply combinable filters.
  const termLower = q.toLocaleLowerCase("en");
  const filtered = groups.filter((g) => {
    if (country && g.country_code !== country) return false;
    if (category && g.category_slug !== category) return false;
    if (q) {
      const nameHit = g.name.toLocaleLowerCase("en").includes(termLower);
      const tagHit = tagMatchIds?.has(g.id) ?? false;
      if (!nameHit && !tagHit) return false;
    }
    return true;
  });

  const globalOnline = filtered.filter(
    (g) => g.country_code == null || g.scope === "global"
  );

  const selectClass =
    "rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  function GroupCard({ g }: { g: Group }) {
    const c = g.country_code ? countryName.get(g.country_code) : undefined;
    return (
      <li className="rounded-2xl border border-border bg-card p-4">
        <Link
          href={`/groups/${g.id}`}
          className="font-medium text-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {g.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          {g.category_slug && (
            <span className="rounded-full bg-side-card px-2 py-0.5">
              {categoryLabel.get(g.category_slug) ?? g.category_slug}
            </span>
          )}
          <span className="rounded-full bg-side-card px-2 py-0.5 capitalize">
            {g.scope}
          </span>
          {c && (
            <span>
              {c.flag ? `${c.flag} ` : ""}
              {c.name}
              {g.city ? ` · ${g.city}` : ""}
            </span>
          )}
          {!c && g.scope === "global" && <span>🌍 Global</span>}
        </div>
        {g.description && (
          <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
            {g.description}
          </p>
        )}
      </li>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-primary">
          Browse Groups
        </h1>
        <Link
          href="/groups"
          className="text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          All groups
        </Link>
      </div>

      {/* Filters */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs text-text-secondary">
            Search name or tag
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="e.g. cleanup"
            className={selectClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="country" className="text-xs text-text-secondary">
            Country
          </label>
          <select id="country" name="country" defaultValue={country} className={selectClass}>
            <option value="">Any country</option>
            {[...countryFacet.keys()]
              .map((code) => countryName.get(code))
              .filter((c): c is Country => Boolean(c))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag ? `${c.flag} ` : ""}
                  {c.name} ({countryFacet.get(c.code)})
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs text-text-secondary">
            Category
          </label>
          <select id="category" name="category" defaultValue={category} className={selectClass}>
            <option value="">Any category</option>
            {[...categoryFacet.keys()]
              .sort((a, b) =>
                (categoryLabel.get(a) ?? a).localeCompare(categoryLabel.get(b) ?? b)
              )
              .map((slug) => (
                <option key={slug} value={slug}>
                  {categoryLabel.get(slug) ?? slug} ({categoryFacet.get(slug)})
                </option>
              ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Filter
        </button>
        {(country || category || q) && (
          <Link
            href="/groups/browse"
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-text-secondary">
          No groups match these filters. Try clearing them or{" "}
          <Link href="/groups/new" className="text-accent underline underline-offset-2">
            create one
          </Link>
          .
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <GroupCard key={g.id} g={g} />
          ))}
        </ul>
      )}

      {/* Global / Online surfacing */}
      {globalOnline.length > 0 && !country && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">
            🌍 Global &amp; online groups
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {globalOnline.map((g) => (
              <GroupCard key={`go-${g.id}`} g={g} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
