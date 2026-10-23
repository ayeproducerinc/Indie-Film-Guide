// Isolated development fixtures and an in-process Stripe double only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import { db, pool, listingsTable, PLANS } from "@workspace/db";
import app from "../app";
import { billingState } from "./listing-config";
import { updateFromSubscription, applyAnnualRefund, applyAnnualRefundUpdate } from "./subscription-billing";
import { eligible } from "./payment-policy";

test("annual refund visibility and end-of-term cancellation across all four plans", async () => {
  assert.equal((await pool.query("select current_database() as name")).rows[0].name, "heliumdb");
  const ids: number[] = [];
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}/api`;
  const iterable = (items: any[]) => ({ async *[Symbol.asyncIterator]() { yield* items; } });
  try {
    for (const plan of PLANS.filter(p => p.billing === "yearly")) {
      const reference = randomUUID();
      const subId = `sub_test_${reference}`;
      const priceId = `price_test_${reference}`;
      const [row] = await db.insert(listingsTable).values({
        reference, slug: `annual-refund-test-${reference}`, name: "Annual refund verification",
        description: "Isolated development fixture", category: "Locations", stages: ["Idea"],
        coverage: "Statewide", city: "Statewide", state: "GA", providerType: plan.providerType,
        plan: plan.name, indieRate: plan.indie, status: "Live", paymentStatus: "Paid",
        ein: plan.providerType === "Nonprofit" ? "12-3456789" : "",
        einVerified: plan.providerType === "Nonprofit",
        email: "test@example.invalid", website: "https://example.invalid", phone: "+14045550100",
        stripeSubscriptionId: subId, stripePriceId: priceId,
      }).returning();
      assert.ok(row); ids.push(row.id);
      billingState.prices[plan.name] = priceId;
      billingState.allowedPrices[plan.name] = new Set([priceId]);
      const invoices = new Map<string, any>();
      const payments: any[] = [];
      const charges = new Map<string, any>();
      const refunds = new Map<string, any[]>();
      let invoiceId = "in_current";
      let state = "active";
      let cancelAtEnd = true;
      let metadataApp = "indie-film-guide";
      const newInvoice = (id: string) => {
        invoices.set(id, { id, status: "paid", currency: "usd", amount_paid: plan.amount,
          livemode: false, parent: { subscription_details: { subscription: subId } } });
        payments.push({ id: `ip_${id}`, status: "paid", invoice: id, currency: "usd",
          amount_paid: plan.amount, payment: { type: "payment_intent", payment_intent: `pi_${id}` } });
        charges.set(`ch_${id}`, { id: `ch_${id}`, currency: "usd", livemode: false, amount: plan.amount,
          amount_refunded: 0, payment_intent: `pi_${id}` });
        refunds.set(`ch_${id}`, []);
      };
      newInvoice("in_current"); newInvoice("in_old");
      const fake = {
        subscriptions: { retrieve: async () => ({
          id: subId, status: state, cancel_at_period_end: cancelAtEnd, livemode: false,
          metadata: { app: metadataApp, listingReference: reference }, customer: null,
          latest_invoice: invoices.get(invoiceId),
          items: { data: [{ id: "si_test", quantity: 1, price: { id: priceId },
            current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
        }) },
        invoices: { retrieve: async (id: string) => invoices.get(id) },
        invoicePayments: { list: (filter: any) => iterable(payments.filter(p =>
          filter.invoice ? p.invoice === filter.invoice : p.payment.payment_intent === filter.payment.payment_intent)) },
        paymentIntents: { retrieve: async (id: string) => ({ latest_charge: `ch_${id.slice(3)}` }) },
        charges: { retrieve: async (id: string) => charges.get(id) },
        refunds: {
          list: (filter: any) => iterable(refunds.get(filter.charge) ?? []),
          retrieve: async (id: string) => [...refunds.values()].flat().find(r => r.id === id),
        },
      } as unknown as Stripe;
      const saved = async () => (await db.select().from(listingsTable).where(eq(listingsTable.id, row.id)))[0]!;
      const reconcile = () => updateFromSubscription(subId, undefined, fake);
      const refund = async (invoice: string, amount: number, status = "succeeded") => {
        charges.get(`ch_${invoice}`).amount_refunded += amount;
        const result = { id: randomUUID(), charge: `ch_${invoice}`, amount, status, currency: "usd" };
        refunds.get(`ch_${invoice}`)!.push(result);
        await applyAnnualRefund(`ch_${invoice}`, fake);
        return result;
      };
      const visible = async (expected: boolean) => {
        assert.equal(eligible(await saved()), expected);
        const response = await fetch(`${origin}/listings/${row.slug}`);
        assert.equal(response.status, expected ? 200 : 404);
        const directory = await (await fetch(`${origin}/directory?q=${encodeURIComponent(row.name)}`)).json() as { listings: { id: number }[] };
        assert.equal(directory.listings.some(l => l.id === row.id), expected);
      };

      // Scheduled cancellation is still active and paid until the term ends.
      await reconcile(); assert.equal((await saved()).paymentStatus, "Paid"); await visible(true);
      // Old invoices and failed/pending refunds never hide current paid access.
      await refund("in_old", plan.amount);
      await refund("in_current", 100, "failed");
      await refund("in_current", 100, "pending");
      assert.equal((await saved()).paymentStatus, "Paid"); await visible(true);
      refunds.set("ch_in_current", []); charges.get("ch_in_current").amount_refunded = 0;
      await refund("in_current", 1000); await visible(true);
      const pending = await refund("in_current", plan.amount - 1000, "pending");
      await visible(true);
      pending.status = "succeeded";
      await applyAnnualRefundUpdate(pending.id, fake);
      assert.equal((await saved()).paymentStatus, "Refunded"); await visible(false);
      // Replays, a late historical refund, and "invoice.paid"/subscription
      // refreshes all read current Stripe state rather than restoring Paid.
      await applyAnnualRefund("ch_in_current", fake);
      await applyAnnualRefund("ch_in_old", fake);
      await reconcile(); assert.equal((await saved()).paymentStatus, "Refunded"); await visible(false);
      state = "past_due"; invoices.get(invoiceId).status = "open";
      await reconcile(); assert.equal((await saved()).paymentStatus, "Refunded"); await visible(false);
      state = "active"; newInvoice("in_next"); invoiceId = "in_next";
      await reconcile(); assert.equal((await saved()).paymentStatus, "Paid"); await visible(true);
      await applyAnnualRefund("ch_in_current", fake); await visible(true);
      // Payment recovery never grants independent admin approval.
      await db.update(listingsTable).set({ status: "Pending" }).where(eq(listingsTable.id, row.id));
      await reconcile(); assert.equal((await saved()).status, "Pending");
      assert.equal((await fetch(`${origin}/listings/${row.slug}`)).status, 404);
      await db.update(listingsTable).set({ status: "Live" }).where(eq(listingsTable.id, row.id));
      metadataApp = "another-app";
      await assert.rejects(reconcile, /not bound/);
      metadataApp = "indie-film-guide";
      // Existing waiver is never overwritten by a refund.
      await db.update(listingsTable).set({ paymentStatus: "Payment waived" }).where(eq(listingsTable.id, row.id));
      await refund("in_next", plan.amount);
      assert.equal((await saved()).paymentStatus, "Payment waived");
      await db.update(listingsTable).set({ paymentStatus: "Paid" }).where(eq(listingsTable.id, row.id));
      // Actual cancellation at the end of the term ends payment eligibility.
      state = "canceled"; cancelAtEnd = false; await reconcile();
      assert.equal((await saved()).paymentStatus, "Cancelled"); await visible(false);
    }
  } finally {
    if (ids.length) await db.delete(listingsTable).where(inArray(listingsTable.id, ids));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
