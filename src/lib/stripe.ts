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
  // On pin explicitement la version attendue par ton package Stripe
  apiVersion: "2025-10-29.clover" as Stripe.LatestApiVersion,
  appInfo: {
    name: "ZoneStat",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://zonestat.app",
  },
});
