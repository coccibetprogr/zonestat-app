// src/utils/safeNext.ts
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  try {
    next = next.replace(/\\/g, "/");        // normaliser backslashes
    if (!next.startsWith("/")) return "/";  // doit commencer par "/"
    if (next.startsWith("//")) return "/";  // pas de //evil.com
    if (/[\r\n]/.test(next)) return "/";    // pas de CRLF
    return next;
  } catch {
    return "/";
  }
}