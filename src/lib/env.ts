export const env = {
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  paypalEnv: (process.env.PAYPAL_ENV ?? "sandbox") as "sandbox" | "live",
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID ?? "",
  buyerEmail: process.env.PAYPAL_BUYER_EMAIL ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  channel3Key: process.env.CHANNEL3_API_KEY ?? "",
  baseUrl: (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export const paypalApiBase =
  env.paypalEnv === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export function hasPayPal() {
  return Boolean(env.paypalClientId && env.paypalClientSecret);
}
export function hasClaude() {
  return Boolean(env.anthropicKey);
}
export function hasChannel3() {
  return Boolean(env.channel3Key);
}
