/**
 * utils/supabase/client.ts
 * -----------------------------------------------------
 * Client Supabase pour l'environnement navigateur.
 * - Auth implicit flow (non-PKCE) → compatible multi-appareils
 * - Gestion de la session via cookies (Next.js côté client)
 * - Prépare aussi un client PKCE pour le mode sécurisé local
 * -----------------------------------------------------
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// 🧩 Config : URL et clé publique
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ⚠️ Vérifie la config
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[supabase/client] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant");
}

/**
 * 🔐 Client "implicit" (non-PKCE)
 *  → Utilisé pour login par OTP/email/magiclink/reset password
 *  → Compatible quand l'utilisateur ouvre son mail sur un autre device
 */
export const supabaseImplicit: SupabaseClient = createBrowserClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  },
);

/**
 * 🔒 Client "pkce" (optionnel)
 *  → Authentification sécurisée par code_verifier (si besoin futur)
 *  → À utiliser pour login interactif côté navigateur (évite XSRF)
 */
export const supabasePkce: SupabaseClient = createBrowserClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);

/**
 * 🧭 Helper (fallback automatique)
 *  Utilise PKCE si le localStorage contient un code_verifier,
 *  sinon revient à implicit → évite les erreurs “Lien invalide”.
 */
export const supabaseClient: SupabaseClient = (() => {
  try {
    const hasVerifier =
      typeof window !== "undefined" &&
      !!localStorage.getItem("supabase.code_verifier");
    return hasVerifier ? supabasePkce : supabaseImplicit;
  } catch {
    return supabaseImplicit;
  }
})();
