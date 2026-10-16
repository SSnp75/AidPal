"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isTabActive } from "@/lib/nav";
import {
  HomeIcon,
  TrendingIcon,
  FriendsIcon,
  MessagesIcon,
  GroupsIcon,
  EventsIcon,
  PhotosIcon,
  BookmarkNavIcon,
  ActivityNavIcon,
  SettingsIcon,
} from "@/components/dashboard/navIcons";

// Nav row styling copied from LeftSidebar so the drawer list matches the
// desktop sidebar exactly.
const activeNavClass =
  "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const linkNavClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-text-secondary transition-colors hover:bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

// Full primary nav — all 10 destinations, matching the desktop LeftSidebar.
const NAV_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "Home", icon: <HomeIcon /> },
  { href: "/trending", label: "Trending", icon: <TrendingIcon /> },
  { href: "/friends", label: "Friends", icon: <FriendsIcon /> },
  { href: "/messages", label: "Messages", icon: <MessagesIcon /> },
  { href: "/groups", label: "Groups", icon: <GroupsIcon /> },
  { href: "/events", label: "Events", icon: <EventsIcon /> },
  { href: "/photos", label: "Photos", icon: <PhotosIcon /> },
  { href: "/saved", label: "Saved", icon: <BookmarkNavIcon /> },
  { href: "/activity", label: "Activity", icon: <ActivityNavIcon /> },
  { href: "/profile/edit", label: "Settings", icon: <SettingsIcon /> },
];

/**
 * Hamburger button + slide-in LEFT drawer, shown ONLY below 992px.
 *
 * Mounted inside the server `NavBar`. The logout form is a server-action form
 * built in `NavBar` and passed in as a prop (a client component cannot define
 * an inline `"use server"` action).
 */
export default function MobileNav({
  isAuthed,
  logoutForm,
}: {
  isAuthed: boolean;
  logoutForm: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Move focus into the drawer on open; restore to the hamburger on close.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    } else {
      openerRef.current?.focus();
    }
  }, [open]);

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="min-[992px]:hidden">
      <button
        ref={openerRef}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-text-primary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      {open && (
        <>
          {/* Dimmed overlay — click to close. */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />

          {/* Slide-in left panel. */}
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto border-r border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-text-primary">
                aidPAL
              </span>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12" />
                  <path d="m18 6-12 12" />
                </svg>
              </button>
            </div>

            <nav aria-label="Primary" className="mt-1">
              <ul className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ href, label, icon }) => {
                  const active = isTabActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={close}
                        className={active ? activeNavClass : linkNavClass}
                      >
                        {icon}
                        <span>{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <Link
              href="/groups/new"
              onClick={close}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-side-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              + Create a Group
            </Link>

            {isAuthed && <div onClick={close}>{logoutForm}</div>}
          </div>
        </>
      )}
    </div>
  );
}
