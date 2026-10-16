import Link from "next/link";
import Avatar from "./Avatar";
import NavLink from "./NavLink";
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
} from "./navIcons";

interface Stats {
  posts: number;
  followers: number;
  following: number;
}

const activeNavClass =
  "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const linkNavClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-text-secondary transition-colors hover:bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

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
            <NavLink href="/trending" icon={<TrendingIcon />} label="Trending" />
          </li>
          <li>
            <NavLink href="/friends" icon={<FriendsIcon />} label="Friends" />
          </li>
          <li>
            <NavLink href="/messages" icon={<MessagesIcon />} label="Messages" />
          </li>
          <li>
            <Link href="/groups" className={linkNavClass}>
              <GroupsIcon />
              <span>Groups</span>
            </Link>
          </li>
          <li>
            <NavLink href="/events" icon={<EventsIcon />} label="Events" />
          </li>
          <li>
            <Link href="/photos" className={linkNavClass}>
              <PhotosIcon />
              <span>Photos</span>
            </Link>
          </li>
          <li>
            <Link href="/saved" className={linkNavClass}>
              <BookmarkNavIcon />
              <span>Saved</span>
            </Link>
          </li>
          <li>
            <Link href="/activity" className={linkNavClass}>
              <ActivityNavIcon />
              <span>Activity</span>
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

      {/* Create Event call-to-action */}
      <Link
        href="/events/new"
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <EventsIcon />
        <span>Create Event</span>
      </Link>
    </aside>
  );
}
