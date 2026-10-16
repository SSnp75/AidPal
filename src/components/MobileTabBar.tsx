"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTabActive } from "@/lib/nav";
import {
  HomeIcon,
  GroupsIcon,
  MessagesIcon,
  EventsIcon,
  SettingsIcon,
} from "@/components/dashboard/navIcons";

// Fixed bottom tab bar, shown ONLY below 992px (hidden at >=992px via
// min-[992px]:hidden). Five primary destinations. Active styling mirrors
// NavLink (accent color/weight + aria-current). /groups/* highlights Groups
// via the pure isTabActive helper. Touch-friendly: >=44px tap targets, visible
// text labels (also the accessible name), no hover dependency.
const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/groups", label: "Groups", Icon: GroupsIcon },
  { href: "/messages", label: "Messages", Icon: MessagesIcon },
  { href: "/events", label: "Events", Icon: EventsIcon },
  { href: "/profile/edit", label: "You", Icon: SettingsIcon },
] as const;

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card min-[992px]:hidden"
      // Keep the tabs clear of the iOS home indicator / Android gesture bar.
      // Progressive enhancement: resolves to 0 where env() is unsupported.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = isTabActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                  active
                    ? "font-medium text-accent"
                    : "text-text-secondary"
                }`}
              >
                <Icon />
                <span className="text-[10px] leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
