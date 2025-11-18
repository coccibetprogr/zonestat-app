// src/lib/stripe.ts
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY (Stripe secret key)");
}

// ⚠️ Important : client Stripe uniquement côté serveur
if (typeof window !== "undefined") {
  throw new Error("Stripe server client must not load in the browser");
}

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // On laisse Stripe utiliser la version configurée sur ton compte
  // plutôt que de pinner une apiVersion potentiellement invalide.
  appInfo: {
    name: "ZoneStat",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://zonestat.app",
  },
});
