// src/utils/supabase/action.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (process.env.NODE_ENV === "production") {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error("Missing Supabase config in production: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}

/**
 * Client Supabase à utiliser UNIQUEMENT dans les Server Actions / Route Handlers,
 * là où les cookies sont MUTABLES.
 */
export async function actionClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL!, SUPABASE_ANON!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options?: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options?: any) {
        cookieStore.delete({ name, ...(options ?? {}) } as any);
      },
    },
    // ✅ Empêche Supabase d'utiliser PKCE pour les liens email
    auth: {
      flowType: "implicit",
      // Pour les Server Actions on évite de persister côté serveur
      persistSession: false,
    },
  });
}
