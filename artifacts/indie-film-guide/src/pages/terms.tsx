import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';

const items = [
  'Listings are paid advertising.',
  "A listing doesn't guarantee bookings or work.",
  "Payment doesn't affect where a listing appears. Results are sorted alphabetically.",
  'Providers are responsible for honoring their posted indie rate.',
];
export default function Terms() {
  useMeta('Terms | Indie Film Guide', 'Terms for providers and filmmakers using the Indie Film Guide directory.');
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 rise">
        <h1 className="font-display text-5xl sm:text-6xl">Terms</h1>
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
