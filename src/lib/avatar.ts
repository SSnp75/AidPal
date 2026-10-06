/**
 * Derive initials from a display name.
 * Takes the first letter of up to two words, uppercased.
 * Falls back to "?" when no usable input is provided.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + second).toUpperCase() || "?";
}
