// src/config/pricing.ts

export type PlanKey = "weekly" | "monthly";

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
    key: "weekly",
    name: "Hebdomadaire",
    description: "Accès complet à ZoneStat pendant 7 jours.",
    priceIdEnv: "STRIPE_PRICE_WEEKLY",
    priceLabel: "9,99 € / 7 jours",
    highlight: true,
  },
  {
    key: "monthly",
    name: "Mensuel",
    description: "Accès complet à ZoneStat, facturé chaque mois.",
    priceIdEnv: "STRIPE_PRICE_MONTHLY",
    priceLabel: "29,99 € / mois",
  },
];

export function getPriceIdFromEnv(plan: PricingPlan): string | null {
  const id = process.env[plan.priceIdEnv];
  return id && id.trim().length > 0 ? id : null;
}
