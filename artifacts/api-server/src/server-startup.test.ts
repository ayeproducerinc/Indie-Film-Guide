import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import app from "./app";
import { startServer } from "./server-startup";
import { billingState } from "./lib/listing-config";
import { beginCheckout } from "./lib/billing";

test("startup serves health immediately while Stripe initialization is still pending", async () => {
  let finish!: () => void;
  let completed = false;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const server = startServer(app, 0, async () => {
    billingState.initializing = true;
    billingState.available = false;
    try { await gate; completed = true; }
    finally { billingState.initializing = false; }
  });
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${origin}/api/healthz`, { signal: AbortSignal.timeout(3000) });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(completed, false, "Health must not wait for Stripe backfill.");
    await assert.rejects(beginCheckout(randomUUID(), origin, {} as Stripe), /unavailable/i);
    const webhook = await fetch(`${origin}/api/stripe/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "not-a-real-signature" },
      body: "{}",
    });
    assert.equal(webhook.status, 503);
    assert.equal(webhook.headers.get("retry-after"), "5");
    const unsigned = await fetch(`${origin}/api/stripe/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(unsigned.status, 400);
    finish();
    await gate;
    assert.equal((await fetch(`${origin}/api/healthz`)).status, 200);
  } finally {
    finish();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
