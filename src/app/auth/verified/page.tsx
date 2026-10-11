import Link from "next/link";

export const metadata = {
  title: "Email verified — aidPAL",
};

export default function VerifiedPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-success">
            Email verified
          </h1>
          <p className="text-sm text-foreground/70">
            Your email address has been confirmed and your account is ready. Set
            up your profile to get started on aidPAL.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link
            href="/profile/edit"
            className="w-full rounded-md bg-accent px-4 py-2.5 text-center font-medium text-white transition-colors hover:bg-accent-light"
          >
            Complete your profile
          </Link>
          <Link
            href="/groups"
            className="w-full rounded-md border border-foreground/15 px-4 py-2.5 text-center font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            Browse groups
          </Link>
        </div>
      </div>
    </div>
  );
}
