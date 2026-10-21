import { Link } from 'wouter';
import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';

type Saved = { reference: string; status: string; paymentStatus: string; message: string; plan: string; name: string };

export default function Submitted() {
  useMeta('Submission saved | Indie Film Guide', 'Your Indie Film Guide submission has been saved.');
  let s: Saved | null = null;
  try { s = JSON.parse(sessionStorage.getItem('ifg-submission') ?? 'null'); } catch { s = null; }
  const gov = s?.plan === 'Government';
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 rise">
        {!s ? (
          <div data-testid="status-no-submission">
            <h1 className="font-display text-5xl">No recent submission</h1>
            <p className="mt-3 text-muted-foreground">Nothing to confirm on this device. Start a listing below.</p>
            <Link href="/get-listed" className="btn mt-5">Get Listed</Link>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Reference {s.reference}</p>
            <h1 className="font-display mt-2 text-5xl sm:text-6xl" data-testid="text-confirmation-title">
              {gov ? 'Saved. Pending review.' : 'Saved. Not yet paid.'}
            </h1>
            <div className="mt-5 border-2 border-foreground bg-card p-5 space-y-3" data-testid="text-confirmation">
              <p><strong>{s.name}</strong> has been saved.</p>
              {gov ? (
                <p>Government listings are free. Your submission is saved with status Pending review, and nothing is owed.</p>
              ) : (
                <>
                  <p>Your submission is saved as <strong>unpaid</strong>. Payments are not yet enabled, so you have not been charged and no payment has been taken.</p>
                  <p>Your listing is not live. It will be reviewed once payment is available.</p>
                </>
              )}
              <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                <dt className="text-muted-foreground">Status</dt><dd data-testid="text-status" className="font-semibold">{s.status}</dd>
                <dt className="text-muted-foreground">Payment</dt><dd data-testid="text-payment-status" className="font-semibold">{gov ? 'Not required' : 'Unpaid'}</dd>
              </dl>
            </div>
            <div className="mt-6 flex gap-3">
              <Link href="/" className="btn" data-testid="link-directory">Back to directory</Link>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
