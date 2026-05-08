// Stripe product and price IDs for the Pro tier
export const STRIPE_CONFIG = {
  pro: {
    product_ids: ["prod_UIqFAvGC0BpKLw", "prod_UIqFd052fVxrfi"],
    monthly: {
      price_id: "price_1TKEZ8Au9zmnWASMQhAbBuTl",
      amount: 9, // €9/mo
    },
    yearly: {
      price_id: "price_1TKEZRAu9zmnWASMP1nQpiqI",
      amount: 90, // €90/year (~€7.50/mo, saves €18 vs €9 monthly × 12 = €108)
    },
  },
} as const;

export type SubscriptionStatus = {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
};
