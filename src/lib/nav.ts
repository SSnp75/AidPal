/**
 * Pure active-tab matching for the mobile bottom tab bar.
 *
 * NavLink only does exact `pathname === href` matching, which cannot express
 * "`/groups/*` highlights the Groups tab". This helper adds nested-route
 * matching for everything except Home.
 *
 * Rules:
 * - Home (`href === "/"`) matches ONLY the exact root path, so Home does not
 *   light up on every nested route.
 * - Every other tab matches its own path OR any nested route beneath it
 *   (`/groups` and `/groups/123` both activate Groups), but NOT a sibling that
 *   merely shares a prefix (`/groups-archive` does NOT match `/groups`).
 */
export function isTabActive(pathname: string, href: string): boolean {
  // Normalise a trailing slash on href (except the root itself).
  const base = href !== "/" && href.endsWith("/") ? href.slice(0, -1) : href;

  if (base === "/") {
    return pathname === "/";
  }

  return pathname === base || pathname.startsWith(base + "/");
}
