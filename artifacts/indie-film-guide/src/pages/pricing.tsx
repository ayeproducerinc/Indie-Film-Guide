import { Link } from 'wouter';
import { getGetListingConfigQueryKey, useGetListingConfig } from '@workspace/api-client-react';
import type { PlanDefinition } from '@workspace/api-client-react';
import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';
import { planPrice } from '@/lib/plan-price';

const FAQS: [string, string][] = [
  ['What counts as an indie promo code?', 'Any discount or deal for independent productions: a lower day rate, a weekday discount, a free add-on, or a budget-based package. You choose the code and the deal.'],
  ['Why use a promo code?', 'When a filmmaker uses your code, you know the booking came from the Indie Film Guide.'],
  ['What does "locked for life" mean?', "If you sign up during the launch special, your yearly price never goes up as long as your listing renews without a break. If it's canceled, or a renewal fails and isn't fixed within 30 days, the lock ends."],
  ['What does Lifetime include?', "One payment, no renewals. Your listing stays up for as long as the Indie Film Guide operates, as long as it stays accurate and you keep honoring your promo code. It can't be transferred to another business. If the guide shuts down within 3 years of your purchase, you get a prorated refund."],
  ['Do nonprofits get a discount?', 'Yes. Verified nonprofits pay $99/yr with a promo code or $199/yr without one. We check your EIN before approving.'],
  ['Does paying change where I show up?', 'No. Results are always alphabetical.'],
  ['Can I change my code?', 'Yes. Ask the admin to change or remove your code and they will update your listing. Removing your code moves you to the Standard price at renewal.'],
];

function Cta({ plan, children, id }: { plan: string; children: string; id: string }) {
  return <Link href={`/get-listed?plan=${encodeURIComponent(plan)}`} data-testid={id} className="btn mt-5 block w-full text-center">{children}</Link>;
}

export default function Pricing() {
  useMeta('Pricing | Indie Film Guide', 'Simple pricing for Georgia film providers. Free for filmmakers.');
  const { data: cfg, isLoading, isError, refetch } = useGetListingConfig({ query: { queryKey: getGetListingConfigQueryKey(), refetchInterval: 15000, staleTime: 0 } });
  const get = (n: string): PlanDefinition | undefined => cfg?.plans.find((p) => p.name === n);
  const left = cfg?.lifetimeSpotsLeft ?? 0;
  const card = 'relative flex flex-col border-2 border-input bg-card p-5';
  const price = 'font-display text-4xl text-primary';
  const ul = 'mt-3 space-y-1 text-sm text-muted-foreground list-disc pl-5';

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display mt-2 text-5xl sm:text-6xl">Simple pricing. Free for filmmakers.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Providers pay to be listed. Give indie filmmakers a promo code and pay less.</p>
        {cfg?.specialActive && <p className="mt-3 inline-block bg-primary px-3 py-1 text-sm font-bold uppercase tracking-wide text-primary-foreground" data-testid="text-special">Lock in your price for life</p>}

        {isError && <p role="alert" className="mt-8 border-2 border-destructive p-4 font-semibold text-destructive">Couldn't load pricing. <button type="button" onClick={() => refetch()} data-testid="button-retry-pricing" className="underline">Retry</button></p>}
        {isLoading && <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse border-2 border-input bg-muted" />)}</div>}

        {cfg && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="list-plans">
            <div className={`${card} border-primary`} data-testid="card-plan-indie">
              <span className="absolute -top-3 left-4 bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">Most popular</span>
              <h2 className="font-display text-2xl">Indie Partner</h2>
              <p className={`mt-2 ${price}`}>{planPrice(get('Indie Partner'))}</p>
              <p className="mt-1 text-sm font-semibold">For businesses that give indie filmmakers a promo code.</p>
              <ul className={ul}><li>Alphabetical listing</li><li>Indie rate badge and filter</li><li>Your promo code, deal and redeem steps on your page</li></ul>
              {cfg.specialActive && <p className="mt-3 text-sm font-bold text-primary">Lock in your price for life</p>}
              <div className="mt-auto"><Cta plan="Indie Partner" id="button-plan-indie">Get listed</Cta></div>
            </div>
            <div className={card} data-testid="card-plan-standard">
              <h2 className="font-display text-2xl">Standard</h2>
              <p className={`mt-2 ${price}`}>{planPrice(get('Standard'))}</p>
              <p className="mt-1 text-sm font-semibold">For businesses without an indie promo code.</p>
              <ul className={ul}><li>Alphabetical listing</li><li>Category, stage and city filters</li><li>Website, phone and optional public email</li></ul>
              {cfg.specialActive && <p className="mt-3 text-sm font-bold text-primary">Lock in your price for life</p>}
              <div className="mt-auto"><Cta plan="Standard" id="button-plan-standard">Get listed</Cta></div>
            </div>
            <div className={card} data-testid="card-plan-lifetime">
              <h2 className="font-display text-2xl">Lifetime Indie Partner</h2>
              <p className={`mt-2 ${price}`}>{planPrice(get('Lifetime Indie Partner'))}</p>
              <p className="mt-1 text-sm font-bold" data-testid="text-lifetime-spots">{left > 0 ? `${left} of 10 spots left` : 'Sold out. All 10 spots are taken.'}</p>
              <p className="mt-1 text-sm font-semibold">For businesses that will honor an indie promo code for the long haul.</p>
              <ul className={ul}><li>One payment, no renewals</li><li>Everything in Indie Partner</li><li>Not transferable to another business</li></ul>
              <div className="mt-auto">
                {left > 0 ? <Cta plan="Lifetime Indie Partner" id="button-plan-lifetime">Get listed</Cta>
                  : <button type="button" disabled data-testid="button-plan-lifetime" className="btn mt-5 block w-full cursor-not-allowed text-center opacity-50">Sold out</button>}
              </div>
            </div>
            <div className={card} data-testid="card-plan-nonprofit">
              <h2 className="font-display text-2xl">Nonprofit</h2>
              <p className="mt-2 font-display text-3xl text-primary">{planPrice(get('Nonprofit Indie Partner'))}<span className="block text-sm font-sans font-semibold text-foreground">with a promo code</span></p>
              <p className="mt-1 font-display text-3xl text-primary">{planPrice(get('Nonprofit Standard'))}<span className="block text-sm font-sans font-semibold text-foreground">without one</span></p>
              <p className="mt-2 text-sm font-semibold">For verified nonprofits.</p>
              <ul className={ul}><li>We check your EIN before approving</li><li>Alphabetical listing</li><li>Promo code box if you offer a deal</li></ul>
              <div className="mt-auto">
                <Cta plan="Nonprofit Indie Partner" id="button-plan-nonprofit-indie">Get listed with a promo code</Cta>
                <Link href={`/get-listed?plan=${encodeURIComponent('Nonprofit Standard')}`} data-testid="button-plan-nonprofit-standard" className="mt-2 block w-full border-2 border-foreground px-4 py-2 text-center text-sm font-bold">Get listed without a code</Link>
              </div>
            </div>
            <div className={card} data-testid="card-plan-government">
              <h2 className="font-display text-2xl">Government</h2>
              <p className={`mt-2 ${price}`}>{planPrice(get('Government'))}</p>
              <p className="mt-1 text-sm font-semibold">For government offices that support filming.</p>
              <ul className={ul}><li>Alphabetical listing</li><li>Reviewed before publication</li><li>No payment step</li></ul>
              <div className="mt-auto"><Cta plan="Government" id="button-plan-government">Get listed</Cta></div>
            </div>
          </div>
        )}

        <section className="mt-14" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-4xl">Questions</h2>
          <div className="mt-4 divide-y-2 divide-input border-y-2 border-input">
            {FAQS.map(([q, a], i) => (
              <details key={q} className="group py-3" data-testid={`faq-${i + 1}`}>
                <summary className="cursor-pointer list-none font-bold">{q}</summary>
                <p className="mt-2 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
