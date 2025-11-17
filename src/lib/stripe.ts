// src/lib/stripe.ts
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY (Stripe secret key)");
}

// ⚠️ Important : PAS d'apiVersion ici, sinon TypeScript impose "2025-10-29.clover"
export const stripe = new Stripe(STRIPE_SECRET_KEY);
