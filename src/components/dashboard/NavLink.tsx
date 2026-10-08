"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const activeNavClass =
  "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const linkNavClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-text-secondary transition-colors hover:bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/**
 * Active-aware sidebar nav link. Marks itself active (accent background +
 * aria-current) when the current pathname matches `href`, otherwise renders
 * the muted link style. Reusable across sidebar entries.
 */
export default function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={isActive ? activeNavClass : linkNavClass}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
