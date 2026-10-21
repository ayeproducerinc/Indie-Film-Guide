import { Link, useParams } from 'wouter';
import { useGetListing } from '@workspace/api-client-react';
import { ArrowLeft, Globe, Phone } from 'lucide-react';
import { Layout, Badge } from '@/components/layout';
import { placeLabel } from '@/lib/constants';
import { useMeta } from '@/lib/use-meta';

export default function ListingPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data: l, isLoading, isError, refetch } = useGetListing(slug);
  useMeta(
    l ? `${l.name} | Indie Film Guide` : 'Listing | Indie Film Guide',
    l ? l.description : 'Resource details from the Indie Film Guide, a free Georgia directory for independent filmmakers.',
  );
  const site = l?.website ? (/^https?:\/\//i.test(l.website) ? l.website : `https://${l.website}`) : '';
  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/" data-testid="link-back" className="inline-flex items-center gap-1 py-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All resources</Link>
        {isLoading && <div className="mt-4 space-y-3"><div className="h-12 w-3/4 animate-pulse bg-muted" /><div className="h-5 w-1/2 animate-pulse bg-muted" /><div className="h-32 animate-pulse bg-muted" /></div>}
        {isError && (
          <div className="mt-4 border-2 border-foreground p-6 rise" role="alert" data-testid="status-not-found">
            <p className="font-display text-4xl">We couldn't find that listing.</p>
            <p className="mt-2 text-muted-foreground">It may have been removed, or the link is off.</p>
            <div className="mt-4 flex gap-3"><button type="button" onClick={() => refetch()} className="btn">Try again</button><Link href="/" className="btn-outline">Browse directory</Link></div>
          </div>
        )}
        {l && (
          <article className="rise mt-2">
            <div className="flex flex-wrap gap-1.5">
              {l.indieRate && <Badge kind="indie">Indie rate</Badge>}
              {l.providerType === 'Government' && <Badge kind="gov">Government</Badge>}
              {l.providerType === 'Nonprofit' && <Badge kind="plain">Nonprofit</Badge>}
            </div>
            <h1 className="font-display mt-3 text-5xl sm:text-6xl" data-testid="text-name">{l.name}</h1>
            <p className="mt-2 font-semibold text-primary" data-testid="text-meta">{l.category} <span className="text-muted-foreground">/ {placeLabel(l)}</span></p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Stages">
              {l.stages.map((s) => <li key={s} className="border border-border px-2 py-0.5 text-xs">{s}</li>)}
            </ul>
            <p className="mt-5 text-lg leading-relaxed" data-testid="text-description">{l.description}</p>

            <section className="mt-6 border-l-4 border-primary bg-card p-4" aria-labelledby="indie-h">
              <h2 id="indie-h" className="font-display text-2xl">Indie filmmaker rate</h2>
              <p className="mt-1 text-muted-foreground" data-testid="text-indie-rate">
                {l.indieRate && l.indieRateDetails ? l.indieRateDetails : "This provider hasn't posted an indie rate."}
              </p>
            </section>

            {(l.phone || l.website) && (
              <div className="mt-6 flex flex-wrap gap-3">
                {l.phone && <a href={`tel:${l.phone}`} data-testid="button-call" className="btn"><Phone className="h-4 w-4" aria-hidden="true" /> Call {l.phone}</a>}
                {l.website && <a href={site} target="_blank" rel="noopener noreferrer" data-testid="button-website" className="btn-outline"><Globe className="h-4 w-4" aria-hidden="true" /> Website</a>}
              </div>
            )}
          </article>
        )}
      </div>
    </Layout>
  );
}
