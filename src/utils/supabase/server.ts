/**
 * utils/supabase/server.ts
 * -----------------------------------------------------
 * Factory Supabase côté serveur (Next.js 16)
 * - Corrigé pour await cookies()
 * - Lecture/écriture des cookies SSR
 * - Compatible RSC / layout / middleware
 * -----------------------------------------------------
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[supabase/server] Config Supabase manquante (URL ou clé publique)");
}

/**
 * Crée un client Supabase complet (lecture/écriture)
 * pour les layouts ou les pages serveur.
 */
export async function serverClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options?: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...(options ?? {}) });
        } catch {
          // Certaines exécutions RSC interdisent l’écriture — on ignore.
        }
      },
      remove(name: string, options?: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...(options ?? {}) });
        } catch {
          // idem
        }
      },
    },
  });

  return supabase;
}

/**
 * Crée un client Supabase lecture seule (middleware, API)
 */
export async function serverClientReadOnly(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {
        /* lecture seule */
      },
      remove() {
        /* lecture seule */
      },
    },
  });

  return supabase;
}

/**
 * Helper pour récupérer directement l'utilisateur côté serveur.
 */
export async function getServerUser() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
