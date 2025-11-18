// src/utils/supabase/client.ts
// -----------------------------------------------------
// Client Supabase côté navigateur (browser)
// - AUCUN import "next/headers" ici
// - Pour les composants client ("use client") uniquement
// -----------------------------------------------------

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[supabase/client] Config Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
  );
}

let _browserClient: SupabaseClient | null = null;

/**
 * Factory principale pour le client Supabase côté navigateur.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!_browserClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        "[supabase/client] Supabase non configuré côté client (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquants)",
      );
    }

    _browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return _browserClient;
}

/**
 * Export historique utilisé par /auth/update-password :
 *   import { supabaseImplicit as supabase } from "@/utils/supabase/client";
 *
 * On expose une instance singleton du client browser.
 */
export const supabaseImplicit: SupabaseClient = getSupabaseBrowserClient();

/**
 * Alias compatibles avec différents styles d'import
 * pour éviter de casser ton code existant.
 */

// ex: import { client } from "@/utils/supabase/client";
export function client(): SupabaseClient {
  return getSupabaseBrowserClient();
}

// ex: import { createClient } from "@/utils/supabase/client";
export function createClient(): SupabaseClient {
  return getSupabaseBrowserClient();
}

// ex: import supabase from "@/utils/supabase/client";
const defaultClient = supabaseImplicit;
export default defaultClient;
