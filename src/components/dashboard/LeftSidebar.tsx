import Link from "next/link";
import Avatar from "./Avatar";

interface Stats {
  posts: number;
  followers: number;
  following: number;
}

const iconClass = "h-5 w-5 shrink-0";

function HomeIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function TrendingIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 17 6-6 4 4 7-7" />
      <path d="M17 8h4v4" />
    </svg>
  );
}
function FriendsIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 3.5a3 3 0 0 1 0 5.8" />
      <path d="M21 20c0-2.3-1.4-4-3.5-4.7" />
    </svg>
  );
}
function GroupsIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function PhotosIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </svg>
  );
}
function BookmarkNavIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.8 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.2 6.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  );
}

const activeNavClass =
  "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const linkNavClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-text-secondary transition-colors hover:bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const disabledNavClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-text-secondary/40 cursor-not-allowed";

export default function LeftSidebar({
  displayName,
  handle,
  stats,
}: {
  displayName: string;
  handle: string;
  stats: Stats;
}) {
  return (
    <aside
      aria-label="Profile and navigation"
      className="hidden flex-col gap-6 min-[992px]:flex"
    >
      {/* Profile card */}
      <div className="rounded-2xl border border-side-border bg-side-card p-5 text-center">
        <div className="flex justify-center">
          <Avatar name={displayName} sizeClass="h-20 w-20 text-xl" />
        </div>
        <p className="mt-3 text-lg font-semibold text-text-primary">
          {displayName}
        </p>
        <p className="text-sm text-text-secondary">@{handle}</p>

        <dl className="mt-4 flex items-center justify-between border-t border-border pt-4 text-center">
          <div className="flex-1">
            <dt className="text-xs text-text-secondary">Posts</dt>
            <dd className="text-base font-semibold text-text-primary">
              {stats.posts}
            </dd>
          </div>
          <div className="flex-1 border-x border-border">
            <dt className="text-xs text-text-secondary">Followers</dt>
            <dd className="text-base font-semibold text-text-primary">
              {stats.followers}
            </dd>
          </div>
          <div className="flex-1">
            <dt className="text-xs text-text-secondary">Following</dt>
            <dd className="text-base font-semibold text-text-primary">
              {stats.following}
            </dd>
          </div>
        </dl>
      </div>

      {/* Navigation menu */}
      <nav
        aria-label="Primary"
        className="rounded-2xl border border-side-border bg-side-card p-3"
      >
        <ul className="flex flex-col gap-1">
          <li>
            <Link href="/" aria-current="page" className={activeNavClass}>
              <HomeIcon />
              <span>Home</span>
            </Link>
          </li>
          <li>
            <button type="button" disabled aria-disabled="true" className={disabledNavClass}>
              <TrendingIcon />
              <span>Trending</span>
            </button>
          </li>
          <li>
            <button type="button" disabled aria-disabled="true" className={disabledNavClass}>
              <FriendsIcon />
              <span>Friends</span>
            </button>
          </li>
          <li>
            <Link href="/groups" className={linkNavClass}>
              <GroupsIcon />
              <span>Groups</span>
            </Link>
          </li>
          <li>
            <button type="button" disabled aria-disabled="true" className={disabledNavClass}>
              <PhotosIcon />
              <span>Photos</span>
            </button>
          </li>
          <li>
            <Link href="/saved" className={linkNavClass}>
              <BookmarkNavIcon />
              <span>Saved</span>
            </Link>
          </li>
          <li>
            <Link href="/profile/edit" className={linkNavClass}>
              <SettingsIcon />
              <span>Settings</span>
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
