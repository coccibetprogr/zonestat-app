// src/lib/utils.ts

// Helper simple pour concaténer des classes CSS/Tailwind
export function cn(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}
