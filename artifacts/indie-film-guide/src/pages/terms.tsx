import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';

const items = [
  'Listings are paid advertising.',
  "A listing doesn't guarantee bookings or work.",
  "Payment doesn't affect where a listing appears. Results are sorted alphabetically.",
  'Providers must honor their posted promo code while it is listed. Listings that do not honor their posted deal are removed without refund.',
  "If you sign up during the launch special, your yearly price never goes up as long as your listing renews without a break. Cancellation, or a failed renewal not fixed within 30 days, ends the founding price lock.",
  "Lifetime means one payment with no renewals. Your listing stays up for as long as Indie Film Guide operates, provided it stays accurate and you keep honoring your promo code. It cannot be transferred to another business. If the guide shuts down within 3 years of purchase, you receive a prorated refund based on the unused portion of those 3 years.",
  "Nonprofit pricing requires a valid EIN verified before approval. Misrepresented listings are removed without refund. EINs are private and are not displayed in the public directory.",
  "Contact the directory administrator to change your code. For yearly indie plans, removing a code moves you to the corresponding Standard price at renewal, after the administrator confirms the effective date and price. There is no immediate charge. Lifetime plans have no renewal; they must keep honoring a deal to remain listed.",
];
export default function Terms() {
  useMeta('Terms | Indie Film Guide', 'Terms for providers and filmmakers using the Indie Film Guide directory.');
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 rise">
        <h1 className="font-display text-5xl sm:text-6xl">Terms</h1>
        <p className="mt-4">Indie Film Guide is owned and operated by AYe Producer, Inc.</p>
        <ol className="mt-6 space-y-3">
          {items.map((t, i) => (
            <li key={i} className="flex gap-4 border-b border-border pb-3">
              <span className="font-display text-3xl text-primary">{i + 1}</span>
              <span className="pt-1">{t}</span>
            </li>
          ))}
        </ol>
      </div>
    </Layout>
  );
}
