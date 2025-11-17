// src/config/pricing.ts

export type PlanKey = "monthly" | "yearly";

export type PricingPlan = {
  key: PlanKey;
  name: string;
  description: string;
  priceIdEnv: string; // nom de la variable d'env (STRIPE_PRICE_...)
  priceLabel: string;
  highlight?: boolean;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    key: "monthly",
    name: "Mensuel",
    description: "Accès complet à ZoneStat, facturé chaque mois.",
    priceIdEnv: "STRIPE_PRICE_MONTHLY",
    priceLabel: "9,90 € / mois",
    highlight: true,
  },
  {
    key: "yearly",
    name: "Annuel",
    description: "2 mois offerts en payant à l’année.",
    priceIdEnv: "STRIPE_PRICE_YEARLY",
    priceLabel: "99 € / an",
  },
];

export function getPriceIdFromEnv(plan: PricingPlan): string | null {
  const id = process.env[plan.priceIdEnv];
  return id && id.trim().length > 0 ? id : null;
}
