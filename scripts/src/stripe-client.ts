import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

async function credentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  if (process.env.STRIPE_SECRET_KEY) return { secretKey: process.env.STRIPE_SECRET_KEY };
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : null;
  if (!hostname || !token) throw new Error("Stripe connection is not configured.");
  const response = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`, {
    headers: { Accept: "application/json", X_REPLIT_TOKEN: token }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Stripe connection unavailable (${response.status}).`);
  const data = await response.json() as { items?: { settings?: { secret_key?: string; webhook_secret?: string } }[] };
  const settings = data.items?.[0]?.settings;
  if (!settings?.secret_key) throw new Error("Connect Stripe to enable checkout.");
  return { secretKey: settings.secret_key, webhookSecret: settings.webhook_secret };
}
export async function getUncachableStripeClient() {
  const { secretKey } = await credentials();
  return new Stripe(secretKey);
}
export async function getStripeSync() {
  const { secretKey, webhookSecret } = await credentials();
  return new StripeSync({
    poolConfig: { connectionString: process.env.DATABASE_URL },
    stripeSecretKey: secretKey, stripeWebhookSecret: webhookSecret ?? "",
  });
}
