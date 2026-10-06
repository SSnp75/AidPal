import { getInitials } from "@/lib/avatar";

/**
 * Circular gradient avatar showing a person's initials.
 * The gradient is decorative; the accessible name comes from surrounding context.
 */
export default function Avatar({
  name,
  sizeClass = "h-11 w-11 text-sm",
}: {
  name: string;
  sizeClass?: string;
}) {
  return (
    <div
      className={`brand-gradient flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizeClass}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
