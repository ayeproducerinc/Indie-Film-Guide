import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

async function credentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  // A preview-only key must never activate billing in the published app.
  if (process.env.NODE_ENV !== "production" && process.env.STRIPE_TEST_SECRET_KEY) {
    const testKey = process.env.STRIPE_TEST_SECRET_KEY;
    if (!testKey.startsWith("sk_test_") && !testKey.startsWith("rk_test_"))
      throw new Error("STRIPE_TEST_SECRET_KEY must be a Stripe test-mode key.");
    return { secretKey: testKey };
  }
  // Manual-key mode is used only when the native runtime connection isn't available.
  // Never mix keys from one account with a webhook secret from another.
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
let sync: StripeSync | undefined;
export async function getStripeSync() {
  if (sync) return sync;
  const { secretKey, webhookSecret } = await credentials();
  sync = new StripeSync({
    poolConfig: { connectionString: process.env.DATABASE_URL },
    stripeSecretKey: secretKey, stripeWebhookSecret: webhookSecret ?? "",
  });
  return sync;
}
