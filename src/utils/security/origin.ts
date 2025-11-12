const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function normalizeOrigin(input: string): string {
  try {
    const u = new URL(input);
    return u.origin.toLowerCase();
  } catch {
    return "";
  }
}
function expectedOrigin(): string {
  if (!RAW_SITE_URL) return "";
  return normalizeOrigin(RAW_SITE_URL);
}
function getHost(headers: Headers): string {
  return (headers.get("host") ?? "").toLowerCase();
}
function buildOriginFromHost(host: string): string {
  if (!host) return "";
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${scheme}://${host}`;
}
export function getRequestOrigin(headers: Headers): string {
  const hdrOrigin = headers.get("origin");
  if (hdrOrigin) {
    const o = normalizeOrigin(hdrOrigin);
    if (o) return o;
  }
  return normalizeOrigin(buildOriginFromHost(getHost(headers)));
}
export function isAllowedOrigin(headers: Headers): boolean {
  const reqOrigin = getRequestOrigin(headers);
  const exp = expectedOrigin();
  if (reqOrigin && exp && reqOrigin === exp) return true;
  const host = getHost(headers);
  if (host && ALLOWED_HOSTS.includes(host)) return true;
  return false;
}
export function forbidOrigin(): Response {
  return new Response("Forbidden origin", { status: 403 });
}
export type AllowedOrigins = { origins: string[]; hosts: string[] };
export function getAllowedOriginsFromHeaders(headers: Headers): AllowedOrigins {
  const origins = new Set<string>();
  const hosts = new Set<string>();
  const reqOrigin = getRequestOrigin(headers);
  if (reqOrigin) origins.add(reqOrigin);
  const exp = expectedOrigin();
  if (exp) origins.add(exp);
  const headerHost = getHost(headers);
  if (headerHost) {
    hosts.add(headerHost);
    const derived = normalizeOrigin(buildOriginFromHost(headerHost));
    if (derived) origins.add(derived);
  }
  for (const host of ALLOWED_HOSTS) {
    hosts.add(host);
    const fromHost = normalizeOrigin(buildOriginFromHost(host));
    if (fromHost) origins.add(fromHost);
  }
  return { origins: [...origins], hosts: [...hosts] };
}
export function isOriginAllowed(
  rawOrigin: string | null | undefined,
  allowed: AllowedOrigins
): boolean {
  if (!rawOrigin) return false;
  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) return false;
  if (allowed.origins.includes(normalized)) return true;
  try {
    const host = new URL(normalized).host;
    if (host && allowed.hosts.includes(host)) return true;
  } catch {}
  return false;
}
