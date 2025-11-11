// src/utils/security/origin.ts
// Helper centralisé pour valider l’Origin en environnement proxy (Vercel/Cloudflare) sans se faire spoof.

const TRUSTED_HINT_HEADERS = ["x-vercel-id", "cf-ray", "x-forwarded-proto"];

function norm(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function fromHost(host: string | null | undefined, protoHint?: string | null): string | null {
  if (!host) return null;
  const h = host.trim();
  if (!h) return null;
  if (protoHint) return `${protoHint}://${h}`;
  const hostname = h.split(":")[0]?.toLowerCase() || "";
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.");
  return `${isLocal ? "http" : "https"}://${h}`;
}

function trustedProxyPresent(h: Headers): boolean {
  if (process.env.TRUST_PROXY !== "true") return false;
  for (const name of TRUSTED_HINT_HEADERS) {
    if (h.get(name)) return true;
  }
  return false;
}

// ⚠️ Nouvelle signature : plus besoin de reqUrl
export function getAllowedOriginsFromHeaders(h: Headers): Set<string> {
  const set = new Set<string>();

  // 1) NEXT_PUBLIC_SITE_URL prioritaire
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const siteOrigin = site ? norm(site) : null;
  if (siteOrigin) set.add(siteOrigin);

  // 2) Host de la requête (avec x-forwarded-proto quand présent)
  const proto = h.get("x-forwarded-proto") || null;
  const host = h.get("host");
  const fromHostDirect = fromHost(host, proto);
  if (fromHostDirect) set.add(fromHostDirect);

  // 3) x-forwarded-host si proxy de confiance
  if (trustedProxyPresent(h)) {
    const xfh = h.get("x-forwarded-host");
    const fromXFH = fromHost(xfh, proto);
    if (fromXFH) set.add(fromXFH);
  }

  return set;
}

export function isOriginAllowed(originHeader: string | null, allowed: Set<string>): boolean {
  const o = norm(originHeader || "");
  if (!o) return false;
  for (const cand of allowed) {
    const n = norm(cand);
    if (n === o) return true;
  }
  return false;
}
