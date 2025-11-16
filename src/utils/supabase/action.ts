// src/utils/supabase/action.ts
// -----------------------------------------------------
// Client Supabase pour les Server Actions / Route Handlers
// - Compatible Next.js 16 (cookies() async)
// - Lecture/écriture des cookies MUTABLES
// -----------------------------------------------------

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.NODE_ENV === "production") {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "Missing Supabase config in production: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
}

/**
 * Client Supabase à utiliser UNIQUEMENT dans les Server Actions / Route Handlers,
 * là où les cookies sont MUTABLES.
 */
export async function actionClient(): Promise<SupabaseClient> {
  // 🔑 Next 16 : cookies() est ASYNC → on doit faire await
  const cookieStore = await cookies();

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON!, {
    // On passe un objet avec get/set/remove comme dans serverClient()
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options?: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...(options ?? {}) });
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[supabase/action] Échec d'écriture du cookie (Server Action ?)",
              error,
            );
          }
        }
      },
      remove(name: string, options?: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...(options ?? {}) });
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[supabase/action] Échec de suppression du cookie (Server Action ?)",
              error,
            );
          }
        }
      },
    } as any,
  });

  return supabase;
}
