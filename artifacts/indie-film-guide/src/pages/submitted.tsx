import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { createListingCheckout, getSubmissionStatus, useGetListingConfig, type SubmissionState } from '@workspace/api-client-react';
import { planPrice } from '@/lib/plan-price';
import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';

type Saved = { reference: string; accessToken: string };
function readSaved(): Saved | null {
  try {
    const value = JSON.parse(sessionStorage.getItem('ifg-submission') ?? 'null');
    return value?.reference && value?.accessToken ? value : null;
  } catch { return null; }
}
function errorText(error: unknown) {
  return (error as { data?: { error?: string } })?.data?.error ?? 'Could not load the latest payment status. Please try again.';
}
export default function Submitted() {
  const { data: config } = useGetListingConfig();
  useMeta('Your submission | Indie Film Guide', 'Complete payment and check the review status of your listing.');
  const [saved] = useState(readSaved);
  const [state, setState] = useState<SubmissionState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const cancelled = new URLSearchParams(window.location.search).get('checkout') === 'cancelled';
  useEffect(() => {
    if (!saved) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await getSubmissionStatus(saved.reference, { token: saved.accessToken });
        if (active) { setState(response); setError(''); }
      } catch (e) { if (active) setError(errorText(e)); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [saved]);
  const checkout = async () => {
    if (!saved || busy) return;
    setBusy(true); setError('');
    try {
      const result = await createListingCheckout(saved.reference, { token: saved.accessToken });
      setUrl(result.url);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const government = state?.plan === 'Government';
  const paid = state?.paymentStatus === 'Paid';
  const waived = state?.paymentStatus === 'Payment waived';
  const lifetime = state?.plan === 'Lifetime Indie Partner';
  const refunded = state?.paymentStatus === 'Refunded';
  const definition = config?.plans.find(p => p.name === state?.plan);
  return <Layout><div className="mx-auto max-w-2xl px-4 py-10 rise">
    {!saved ? <>
      <h1 className="font-display text-5xl">No recent submission</h1>
      <p className="mt-3 text-muted-foreground">Start a listing to submit your details and choose a plan.</p>
      <Link href="/get-listed" className="btn mt-5">Get Listed</Link>
    </> : <>
      <p className="break-all text-xs font-bold uppercase tracking-wider text-primary">Reference {saved.reference}</p>
      <h1 className="font-display mt-3 text-5xl" data-testid="text-confirmation-title">
        {!state ? 'Checking your submission' : refunded ? 'Payment refunded' : state.status === 'Live' && (paid || government || waived) ? 'Your listing is live' : paid || government || waived ? 'Submitted for review' : 'Check your payment'}
      </h1>
      {state && <div className="mt-5 border-2 border-foreground bg-card p-5 space-y-3" data-testid="text-confirmation">
        <p><strong>{state.name}</strong> is saved.</p>
        {!government && !waived && <p>{state.plan}: <strong>{lifetime && definition ? `$${(definition.amount / 100).toLocaleString('en-US')} one-time payment. No renewals` : planPrice(definition)}</strong>.</p>}
        {refunded && <p>Your payment was refunded. This listing is not publicly visible. Contact the administrator before making another payment.</p>}
        {government ? <p>Government listings are free. Your listing will be reviewed before publication.</p>
          : waived ? <p>Payment is temporarily waived for this listing. {state.status === 'Live' ? 'Your approved listing is now in the directory.' : 'Your listing is awaiting admin approval.'} No Stripe checkout is needed while the waiver is active.</p>
          : paid ? <><p>Your payment is confirmed. {state.status === 'Live' ? 'Your approved listing is now in the directory.' : 'Your listing will go live after admin approval.'}</p>{lifetime && <p>You're listed for as long as the Indie Film Guide operates. Your listing must remain accurate and honor its promo code; publication still requires admin approval.</p>}</>
            : !refunded && <>
              {cancelled && <p>Checkout was cancelled. Your saved listing is ready when you want to complete payment.</p>}
              <p>Payment must be confirmed before your listing can be approved. Returning from Stripe alone does not confirm payment.</p></>}
        {state.status === 'Rejected' && <p>Your listing was not approved. Contact the directory administrator about its review.</p>}
        {paid && state.foundingPriceLocked && <p>Your founding subscription price is locked while renewals continue without a break. Cancellation or a failed renewal left unpaid for 30 days ends the lock.</p>}
        {state.billingMode === 'test' && <p className="font-semibold">Stripe test mode — this is not live billing.</p>}
        <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
          <dt>Review status</dt><dd data-testid="text-status">{state.status}</dd>
          <dt>Payment</dt><dd data-testid="text-payment-status">{state.paymentStatus}</dd>
        </dl>
        {state.checkoutAvailable && !waived && !url && <button type="button" disabled={busy} onClick={() => void checkout()} className="btn" data-testid="button-checkout">{busy ? 'Preparing checkout…' : 'Continue to secure checkout'}</button>}
        {url && !paid && !waived && !refunded && <a href={url} target="_blank" rel="noopener noreferrer" className="btn" data-testid="link-stripe-checkout">Open Stripe checkout</a>}
        {!government && !paid && !waived && !refunded && state.billingMode === 'unavailable' && <p role="status">Checkout is temporarily unavailable. Your details are saved; please try again shortly.</p>}
        {!government && !paid && !waived && !refunded && !state.checkoutAvailable && state.billingMode !== 'unavailable' && <p>We are checking your payment. Please do not pay again.</p>}
      </div>}
      {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
      <Link href="/" className="btn-outline mt-6">Back to directory</Link>
    </>}
  </div></Layout>;
}
