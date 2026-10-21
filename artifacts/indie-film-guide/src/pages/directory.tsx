import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useGetDirectory } from '@workspace/api-client-react';
import { ArrowRight, Phone, Search } from 'lucide-react';
import { Layout, Badge } from '@/components/layout';
import { CATEGORIES, STAGES, placeLabel, shortCategory } from '@/lib/constants';
import { useMeta } from '@/lib/use-meta';

export default function Directory() {
  useMeta('Indie Film Guide | Georgia resources for independent filmmakers', 'Free directory of locations, gear, crew, legal, funding and distribution resources for independent filmmakers in Georgia.');
  const { data, isLoading, isError, refetch } = useGetDirectory();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [cat, setCat] = useState('');
  const [stage, setStage] = useState('');
  const [indie, setIndie] = useState(false);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.listings ?? [])
      .filter((l) => !s || l.name.toLowerCase().includes(s) || l.description.toLowerCase().includes(s))
      .filter((l) => !city || l.city === city || l.coverage === 'Statewide' || l.coverage === 'Nationwide')
      .filter((l) => !cat || l.category === cat)
      .filter((l) => !stage || l.stages.includes(stage))
      .filter((l) => !indie || l.indieRate)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, q, city, cat, stage, indie]);

  const total = data?.listings.length ?? 0;
  const filtered = !!(q || city || cat || stage || indie);
  const reset = () => { setQ(''); setCity(''); setCat(''); setStage(''); setIndie(false); };
  const cities = [...(data?.cities ?? [])].sort((a, b) => a.localeCompare(b));

  return (
    <Layout>
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 pt-10 pb-8 rise">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Georgia / Free for filmmakers</p>
          <h1 className="font-display mt-3 text-[3.2rem] sm:text-7xl text-balance" data-testid="text-headline">
            Every indie film resource in <span className="text-primary">Georgia</span>, in one place.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Locations, gear, crew, legal, funding and distribution, sorted by where your project is. Free for filmmakers.
          </p>
          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search" aria-label="Search resources" data-testid="input-search"
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or what they offer"
              className="field pl-10"
            />
          </div>
        </div>
      </section>

      <div className="sticky top-14 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Category">
            {[{ value: '', short: 'All' }, ...CATEGORIES].map((c) => (
              <button
                key={c.value || 'all'} type="button" aria-pressed={cat === c.value}
                data-testid={`chip-${c.short.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                onClick={() => setCat(c.value)}
                className={`press shrink-0 border-2 px-3 py-2 text-sm font-bold transition-colors ${cat === c.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary'}`}
              >
                {c.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs font-bold uppercase tracking-wider">City
            <select data-testid="select-city" value={city} onChange={(e) => setCity(e.target.value)} className="field mt-1 normal-case tracking-normal font-normal">
              <option value="">All cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">Category
            <select data-testid="select-category" value={cat} onChange={(e) => setCat(e.target.value)} className="field mt-1 normal-case tracking-normal font-normal">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.short}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">Stage
            <select data-testid="select-stage" value={stage} onChange={(e) => setStage(e.target.value)} className="field mt-1 normal-case tracking-normal font-normal">
              <option value="">All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-3 text-sm font-semibold">
            <input type="checkbox" data-testid="checkbox-indie" checked={indie} onChange={(e) => setIndie(e.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
            Indie rate only
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between" aria-live="polite">
          <p className="text-sm font-semibold" data-testid="text-count">
            {isLoading ? 'Loading resources' : `${results.length} ${results.length === 1 ? 'resource' : 'resources'}`}
          </p>
          {filtered && <button type="button" onClick={reset} data-testid="button-clear" className="py-2 text-sm font-semibold text-primary underline underline-offset-4">Clear filters</button>}
        </div>

        {isLoading && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse border border-border bg-muted" />)}
          </div>
        )}
        {isError && (
          <div className="mt-3 border-2 border-destructive p-6" role="alert">
            <p className="font-display text-2xl">Couldn't load the directory.</p>
            <button type="button" onClick={() => refetch()} data-testid="button-retry" className="btn mt-3">Try again</button>
          </div>
        )}
        {!isLoading && !isError && results.length === 0 && (
          <div className="mt-3 border-2 border-dashed border-foreground/40 p-8 text-center rise" data-testid="empty-state">
            <p className="font-display text-3xl">{total === 0 ? 'No resources listed yet.' : 'No resources match these filters yet.'}</p>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              {total === 0 ? 'The guide is new. Be one of the first providers filmmakers find.' : 'Try fewer filters, or tell us who should be here.'} Are you a provider?
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/get-listed" data-testid="button-get-listed-empty" className="btn">Get Listed <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              {filtered && <button type="button" onClick={reset} className="btn-outline">Clear filters</button>}
            </div>
          </div>
        )}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {results.map((l, i) => (
            <li key={l.id} className="rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <article className="lift flex h-full flex-col border-2 border-border bg-card p-4" data-testid={`card-listing-${l.id}`}>
                <div className="flex flex-wrap gap-1.5">
                  {l.indieRate && <Badge kind="indie">Indie rate</Badge>}
                  {l.providerType === 'Government' && <Badge kind="gov">Government</Badge>}
                  {l.providerType === 'Nonprofit' && <Badge kind="plain">Nonprofit</Badge>}
                </div>
                <h2 className="font-display mt-2 text-3xl">{l.name}</h2>
                <p className="mt-1 text-sm font-semibold text-primary">{shortCategory(l.category)} <span className="text-muted-foreground">/ {placeLabel(l)}</span></p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Stages">
                  {l.stages.map((s) => <li key={s} className="border border-border px-2 py-0.5 text-xs">{s}</li>)}
                </ul>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{l.description}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Link href={`/listing/${l.slug}`} data-testid={`link-details-${l.id}`} className="btn">View details <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                  {l.phone && <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} className="btn-outline px-3"><Phone className="h-4 w-4" aria-hidden="true" /></a>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}
