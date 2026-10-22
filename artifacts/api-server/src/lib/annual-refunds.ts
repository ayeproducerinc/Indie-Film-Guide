import type Stripe from "stripe";

const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

// Always inspect the current invoice's authoritative payments, not the webhook
// payload or invoice.status (Stripe invoices stay "paid" after a refund).
export async function invoiceFullyRefunded(stripe: Stripe, invoice: Stripe.Invoice) {
  if (invoice.amount_paid <= 0) return false;
  let refunded = 0;
  const seen = new Set<string>();
  for await (const payment of stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 })) {
    if (id(payment.invoice) !== invoice.id || payment.currency !== invoice.currency)
      throw new Error("Invoice payment does not match the saved billing currency or invoice.");
    let chargeId = id(payment.payment.charge);
    if (payment.payment.type === "payment_intent" && payment.payment.payment_intent) {
      const intent = await stripe.paymentIntents.retrieve(id(payment.payment.payment_intent)!);
      chargeId = id(intent.latest_charge);
    }
    if (!chargeId || seen.has(chargeId)) continue;
    seen.add(chargeId);
    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.currency !== invoice.currency || charge.livemode !== invoice.livemode ||
        charge.amount !== payment.amount_paid)
      throw new Error("Invoice payment has an ambiguous charge allocation; review it before changing listing eligibility.");
    if (!charge.amount_refunded) continue;
    let successful = 0;
    for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) {
      if (refund.status === "succeeded" && id(refund.charge) === charge.id && refund.currency === invoice.currency)
        successful += refund.amount;
    }
    refunded += Math.min(successful, payment.amount_paid ?? 0);
  }
  return refunded >= invoice.amount_paid;
}
