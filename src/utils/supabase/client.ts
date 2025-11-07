// src/utils/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.NODE_ENV === "production") {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "Missing Supabase config in production: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
}

export const supabase = createBrowserClient(
  SUPABASE_URL!,
  SUPABASE_ANON!
);
