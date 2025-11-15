// src/utils/supabase/action.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

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
export async function actionClient() {
  // cookies() est synchrone, mais on laisse async pour ne rien casser à l'appel
  const cookieStore = cookies();

  return createServerClient(SUPABASE_URL!, SUPABASE_ANON!, {
    // 🔑 On passe directement le store de Next, typé comme CookieMethodsServer
    cookies: cookieStore as unknown as CookieMethodsServer,

    // ✅ Empêche Supabase d'utiliser PKCE pour les liens email
    auth: {
      flowType: "implicit",
      // Pour les Server Actions on évite de persister côté serveur
      persistSession: false,
    },
  });
}
