// src/utils/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.NODE_ENV === "production") {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "Missing Supabase config in production: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
}

/**
 * Client Supabase côté serveur (RSC). On NE MODIFIE PAS les cookies ici.
 * Les mutations (set/remove) doivent se faire dans une Route Handler ou Server Action
 * où l'on a accès à la réponse (ex: POST /auth/logout).
 */
export async function serverClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON!,
    {
      cookies: {
        get(name: string) {
          try {
            return cookieStore.get(name)?.value;
          } catch {
            return undefined;
          }
        },
        set(_name: string, _value: string, _options?: any) {
          // no-op en RSC
        },
        remove(_name: string, _options?: any) {
          // no-op en RSC
        },
      },
    }
  );
}
