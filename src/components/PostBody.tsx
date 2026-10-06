import { Fragment } from "react";
import { linkify } from "@/lib/linkify";

/**
 * Renders post text with any http(s) URLs turned into safe clickable links.
 * Non-URL text is rendered as-is (React escapes it), and only http/https
 * schemes are linkified to avoid javascript:-style injection.
 */
export default function PostBody({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <p className={className}>
      {linkify(text).map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent underline underline-offset-2 transition-colors hover:text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {seg.value}
          </a>
        ) : (
          <Fragment key={i}>{seg.value}</Fragment>
        )
      )}
    </p>
  );
}
