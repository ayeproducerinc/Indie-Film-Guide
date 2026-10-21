import { useState } from 'react';
import { useLocation } from 'wouter';
import { getGetListingConfigQueryKey, useGetListingConfig, useGetLocations, useSubmitListing } from '@workspace/api-client-react';
import type { ListingInput, Location } from '@workspace/api-client-react';
import { Layout } from '@/components/layout';
import { LocationCombobox } from '@/components/location-combobox';
import { CATEGORIES, STAGES } from '@/lib/constants';
import { useMeta } from '@/lib/use-meta';
import { DealFields } from '@/components/deal-fields';
import { planPrice } from '@/lib/plan-price';

type Offer = 'yes' | 'no' | '';
type Cadence = 'yearly' | 'lifetime';
const INDIE_PLANS = ['Indie Partner', 'Lifetime Indie Partner', 'Nonprofit Indie Partner'];
function parsePlan(): { provider: ListingInput['providerType']; offer: Offer; cadence: Cadence } {
  const p = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('plan');
  switch (p) {
    case 'Indie Partner': return { provider: 'Business', offer: 'yes', cadence: 'yearly' };
    case 'Lifetime Indie Partner': return { provider: 'Business', offer: 'yes', cadence: 'lifetime' };
    case 'Standard': return { provider: 'Business', offer: 'no', cadence: 'yearly' };
    case 'Nonprofit Indie Partner': return { provider: 'Nonprofit', offer: 'yes', cadence: 'yearly' };
    case 'Nonprofit Standard': return { provider: 'Nonprofit', offer: 'no', cadence: 'yearly' };
    case 'Government': return { provider: 'Government', offer: '', cadence: 'yearly' };
    default: return { provider: 'Business', offer: '', cadence: 'yearly' };
  }
}

type Plan = ListingInput['plan'];
type Errors = Partial<Record<string, string>>;

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" data-testid={`error-${id}`} className="mt-1 text-sm font-semibold text-destructive">{msg}</p> : null;
}

export default function GetListed() {
  useMeta('Get Listed | Indie Film Guide', 'Submit your business, nonprofit or government office to the Indie Film Guide directory.');
  const [, nav] = useLocation();
  const { data: cfg, isError: cfgError, refetch: refetchCfg } = useGetListingConfig({ query: { queryKey: getGetListingConfigQueryKey(), refetchInterval: 15000, staleTime: 0 } });
  const { data: locations = [], isLoading: locLoading, isError: locError, refetch } = useGetLocations();
  const submit = useSubmitListing();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [coverage, setCoverage] = useState<ListingInput['coverage']>('City');
  const [loc, setLoc] = useState<Location | null>(null);
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [publicEmail, setPublicEmail] = useState(false);
  const [pre] = useState(parsePlan);
  const [providerType, setProviderType] = useState<ListingInput['providerType']>(pre.provider);
  const [offer, setOffer] = useState<Offer>(pre.offer);
  const [cadence, setCadence] = useState<Cadence>(pre.cadence);
  const [ein, setEin] = useState('');
  const [indie, setIndie] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [redeemHow, setRedeemHow] = useState('');
  const [qualifies, setQualifies] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');

  const gov = providerType === 'Government';
  const toggleStage = (s: string) => setStages((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const lifetimeLeft = cfg?.lifetimeSpotsLeft ?? 0;
  const lifetimeOpen = !!cfg && lifetimeLeft > 0;
  const lifetimeBlocked = cadence === 'lifetime' && !!cfg && !lifetimeOpen;
  const effCadence: Cadence = cadence === 'lifetime' && !lifetimeOpen ? 'yearly' : cadence;
  const plan: Plan | '' = gov ? 'Government'
    : providerType === 'Nonprofit' ? (offer === 'yes' ? 'Nonprofit Indie Partner' : offer === 'no' ? 'Nonprofit Standard' : '')
    : offer === 'yes' ? (effCadence === 'lifetime' ? 'Lifetime Indie Partner' : 'Indie Partner') : offer === 'no' ? 'Standard' : '';
  const isIndie = INDIE_PLANS.includes(plan);
  const planDef = cfg?.plans.find((d) => d.name === plan);
  const pickProvider = (p: ListingInput['providerType']) => {
    setProviderType(p); setOffer(''); setCadence('yearly');
    setErrors((e) => ({ ...e, plan: undefined, ein: undefined }));
  };
  const planLabel = (n: string) => planPrice(cfg?.plans.find((d) => d.name === n));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Enter your business name.';
    if (!description.trim()) e.description = 'Tell filmmakers what you offer.';
    else if (description.length > 200) e.description = 'Keep it to 200 characters or fewer.';
    if (!category) e.category = 'Pick one category.';
    if (stages.length === 0) e.stages = 'Pick at least one stage.';
    if (coverage === 'City' && !loc) e.location = 'Choose a city from the suggestions. Typed text alone is not enough.';
    if (!website.trim()) e.website = 'Enter your website.';
    else {
      try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) e.website = 'Enter a valid website.';
      } catch { e.website = 'Enter a valid website.'; }
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone.trim()) e.phone = 'Enter your phone number.';
    else if (!/^[+\d\s().-]+$/.test(phone) || !(phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits.startsWith('1')))) e.phone = 'Enter a 10-digit U.S. phone number.';
    if (!email.trim()) e.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (!cfg) e.plan = 'Pricing is unavailable right now. Retry before submitting.';
    else if (!plan) e.plan = 'Choose a plan.';
    else if (!planDef) e.plan = 'That plan is not available right now.';
    else if (plan === 'Lifetime Indie Partner' && !lifetimeOpen) e.plan = 'All 10 lifetime spots are taken.';
    if (providerType === 'Nonprofit' && !/^\d{2}-\d{7}$/.test(ein.trim())) e.ein = 'Enter your EIN as 12-3456789.';
    if (isIndie && !indie.trim()) e.indie = 'Describe your indie rate in one line.';
    if (isIndie && !/^[A-Z0-9]{3,20}$/.test(promoCode)) e.indiePromoCode = 'Use 3–20 uppercase letters or numbers.';
    if (isIndie && !redeemHow.trim()) e.indieRedeemHow = 'Explain how to redeem the code.';
    return e;
  };

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError('');
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) { document.getElementById(`field-${first}`)?.focus(); return; }
    const data: ListingInput = {
      name: name.trim(), description: description.trim(),
      category: category as ListingInput['category'],
      stages: stages as ListingInput['stages'],
      coverage,
      ...(coverage === 'City' && loc ? { locationId: loc.id } : {}),
      website: website.trim(), phone: phone.trim(),
      email: email.trim(), publicEmail, providerType, plan: plan as Plan,
      ...(providerType === 'Nonprofit' ? { ein: ein.trim() } : {}),
      ...(isIndie ? { indieRateDetails: indie.trim(), indiePromoCode: promoCode, indieRedeemHow: redeemHow.trim(), indieWhoQualifies: qualifies.trim() } : {}),
    };
    submit.mutate({ data }, {
      onSuccess: (r) => {
        sessionStorage.setItem('ifg-submission', JSON.stringify({ ...r, plan, name: data.name }));
        nav('/submitted');
      },
      onError: (error) => {
        const detail = (error as unknown as { data?: { error?: string; fields?: Record<string, string[]> } }).data;
        if (detail?.fields) setErrors(Object.fromEntries(Object.entries(detail.fields).map(([key, value]) => [key === 'locationId' ? 'location' : key === 'indieRateDetails' ? 'indie' : key, value[0]])));
        setServerError(detail?.error ?? 'We could not save your submission. Please try again.');
      },
    });
  };

  const plans: { id: Plan; title: string; sub: string; disabled: boolean }[] = [
    { id: 'Indie Partner', title: 'Yes, Indie Partner', sub: 'You offer an indie filmmaker rate', disabled: gov },
    { id: 'Standard', title: 'No, Standard', sub: 'No indie rate', disabled: gov },
    { id: 'Government', title: 'Government office', sub: 'Only for government providers', disabled: !gov },
  ];
  const label = 'block text-sm font-bold';

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display mt-2 text-5xl sm:text-6xl">Get listed</h1>
        <p className="mt-3 text-muted-foreground">Listings are reviewed before they go live. Your email stays private unless you choose to list it publicly.</p>
        {cfgError && <p role="alert" className="mt-3 text-sm font-semibold text-destructive">Couldn't load pricing. <button type="button" onClick={() => refetchCfg()} data-testid="button-retry-config" className="underline">Retry</button></p>}
        {!cfg && !cfgError && <p className="mt-3 text-sm text-muted-foreground" role="status">Loading pricing</p>}
        {cfg?.specialActive && <p className="mt-3 inline-block bg-primary px-3 py-1 text-sm font-bold uppercase tracking-wide text-primary-foreground" data-testid="text-special">Lock in your price for life</p>}
        {cfg?.billingMode === 'test' && <p className="mt-3 border-l-4 border-primary bg-card p-3 text-sm">Test checkout mode. Live billing requires Stripe live-account setup.</p>}

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6" data-testid="form-get-listed">
          <div>
            <label htmlFor="field-name" className={label}>Business name</label>
            <input id="field-name" data-testid="input-name" className="field mt-1" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby="name" />
            <Err id="name" msg={errors.name} />
          </div>
          <div>
            <label htmlFor="field-description" className={label}>What you offer</label>
            <textarea id="field-description" data-testid="input-description" rows={3} className="field mt-1" value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} aria-describedby="description" />
            <div className="flex justify-between"><Err id="description" msg={errors.description} /><span className={`ml-auto text-xs ${description.length > 200 ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>{description.length}/200</span></div>
          </div>
          <div>
            <label htmlFor="field-category" className={label}>Category</label>
            <select id="field-category" data-testid="select-category" className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={!!errors.category} aria-describedby="category">
              <option value="">Choose one</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
            </select>
            <Err id="category" msg={errors.category} />
          </div>
          <fieldset>
            <legend className={label}>Stages <span className="font-normal text-muted-foreground">(pick at least one)</span></legend>
            <div id="field-stages" tabIndex={-1} className="mt-2 flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <label key={s} className={`press flex min-h-[44px] cursor-pointer items-center gap-2 border-2 px-3 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${stages.includes(s) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'}`}>
                  <input type="checkbox" className="sr-only" data-testid={`checkbox-stage-${s}`} checked={stages.includes(s)} onChange={() => toggleStage(s)} />
                  {s}
                </label>
              ))}
            </div>
            <Err id="stages" msg={errors.stages} />
          </fieldset>

          <fieldset>
            <legend className={label}>Where do you serve?</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['City', 'Statewide', 'Nationwide'] as const).map((c) => (
                <label key={c} className={`press flex min-h-[44px] cursor-pointer items-center justify-center border-2 px-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${coverage === c ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'}`}>
                  <input type="radio" name="coverage" className="sr-only" data-testid={`radio-coverage-${c}`} checked={coverage === c} onChange={() => { setCoverage(c); if (c !== 'City') setLoc(null); setErrors((e) => ({ ...e, location: undefined })); }} />
                  {c}
                </label>
              ))}
            </div>
            {coverage === 'City' && (
              <div className="mt-3 grid grid-cols-[1fr_5rem] gap-3 rise">
                <div>
                  <label htmlFor="field-location-input" className={label}>City</label>
                  <div id="field-location" tabIndex={-1}>
                    <LocationCombobox locations={locations} selected={loc} onSelect={(l) => { setLoc(l); if (l) setErrors((e) => ({ ...e, location: undefined })); }} invalid={!!errors.location} describedBy="location" />
                  </div>
                </div>
                <div>
                  <label htmlFor="field-state" className={label}>State</label>
                  <input id="field-state" data-testid="input-state" readOnly className="field mt-1 bg-muted" value={loc?.state ?? ''} placeholder="GA" />
                </div>
              </div>
            )}
            {coverage === 'City' && locLoading && <p className="mt-1 text-sm text-muted-foreground">Loading cities</p>}
            {coverage === 'City' && locError && <p role="alert" className="mt-1 text-sm font-semibold text-destructive">Couldn't load cities. <button type="button" onClick={() => refetch()} className="underline">Retry</button></p>}
            {coverage === 'Statewide' && <p className="mt-3 text-sm text-muted-foreground" data-testid="text-statewide">Statewide listings cover all of Georgia (GA).</p>}
            {coverage === 'Nationwide' && <p className="mt-3 text-sm text-muted-foreground">Nationwide listings have no city or state.</p>}
            <Err id="location" msg={errors.location} />
          </fieldset>

          <div>
            <label htmlFor="field-website" className={label}>Website</label>
            <input id="field-website" required data-testid="input-website" type="url" inputMode="url" className="field mt-1" value={website} maxLength={500} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" aria-invalid={!!errors.website} aria-describedby="website" />
            <Err id="website" msg={errors.website} />
          </div>
          <div>
            <label htmlFor="field-phone" className={label}>Phone</label>
            <input id="field-phone" required data-testid="input-phone" type="tel" className="field mt-1" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} aria-describedby="phone" />
            <Err id="phone" msg={errors.phone} />
          </div>
          <div>
            <label htmlFor="field-email" className={label}>Email</label>
            <input id="field-email" data-testid="input-email" type="email" className="field mt-1" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby="email" />
            <Err id="email" msg={errors.email} />
            <label className="mt-3 flex items-start gap-2 text-sm font-semibold">
              <input type="checkbox" data-testid="checkbox-public-email" checked={publicEmail} onChange={(e) => setPublicEmail(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" />
              <span>List email publicly<span className="block font-normal text-muted-foreground">Allow visitors to contact you by email from your approved listing.</span></span>
            </label>
          </div>
          <fieldset>
            <legend className={label}>Provider type</legend>
            <div id="field-provider" className="mt-2 grid grid-cols-3 gap-2">
              {(['Business', 'Nonprofit', 'Government'] as const).map((p) => (
                <label key={p} className={`press flex min-h-[44px] cursor-pointer items-center justify-center border-2 px-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${providerType === p ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'}`}>
                  <input type="radio" name="provider" className="sr-only" data-testid={`radio-provider-${p}`} checked={providerType === p} onChange={() => pickProvider(p)} />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>

          {providerType === 'Nonprofit' && (
            <div className="rise">
              <label htmlFor="field-ein" className={label}>EIN, checked before approval</label>
              <input id="field-ein" data-testid="input-ein" className="field mt-1" value={ein} maxLength={10} inputMode="numeric" placeholder="12-3456789" onChange={(e) => setEin(e.target.value)} aria-invalid={!!errors.ein} aria-describedby="ein" />
              <Err id="ein" msg={errors.ein} />
            </div>
          )}

          {gov ? (
            <div id="field-plan" tabIndex={-1} className="border-2 border-primary bg-accent p-4" data-testid="text-gov-plan">
              <p className="font-bold">Government office</p>
              <p className="text-sm text-muted-foreground">Government offices list free.</p>
            </div>
          ) : (
            <fieldset>
              <legend className={label}>{providerType === 'Nonprofit' ? 'Do you offer a promo code to indie filmmakers?' : 'Do you offer a promo code to indie filmmakers?'}</legend>
              <div id="field-plan" tabIndex={-1} className="mt-2 grid grid-cols-2 items-stretch gap-2">
                {([
                  { v: 'yes' as const, title: 'Yes, I offer a promo code', sub: 'You give indie filmmakers a deal', price: providerType === 'Nonprofit' ? planLabel('Nonprofit Indie Partner') : planLabel(effCadence === 'lifetime' ? 'Lifetime Indie Partner' : 'Indie Partner') },
                  { v: 'no' as const, title: 'No', sub: providerType === 'Nonprofit' ? 'Nonprofit Standard' : 'Standard', price: providerType === 'Nonprofit' ? planLabel('Nonprofit Standard') : planLabel('Standard') },
                ]).map((o) => (
                  <label key={o.v} className={`press flex min-w-0 cursor-pointer flex-col items-start gap-2 border-2 p-3 [overflow-wrap:anywhere] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${offer === o.v ? 'border-primary bg-accent' : 'border-input bg-card'}`}>
                    <input type="radio" name="offer" className="sr-only" data-testid={`radio-offer-${o.v}`} checked={offer === o.v} onChange={() => setOffer(o.v)} />
                    <span className="w-full min-w-0 text-sm"><span className="block font-bold">{o.title}</span><span className="block text-muted-foreground">{o.sub}</span></span>
                    <span className="mt-auto max-w-full font-display text-2xl text-primary">{o.price}</span>
                  </label>
                ))}
              </div>
              {providerType === 'Business' && offer === 'yes' && (
                <div className="mt-3 rise">
                  <p className={label}>Billing</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([['yearly', 'Yearly', planLabel('Indie Partner'), false], ['lifetime', 'Lifetime', planLabel('Lifetime Indie Partner'), !lifetimeOpen]] as const).map(([v, t, pr, dis]) => (
                      <label key={v} className={`press flex min-h-[44px] flex-col justify-center border-2 px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${dis ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${effCadence === v ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'}`}>
                        <input type="radio" name="cadence" className="sr-only" disabled={dis} data-testid={`radio-cadence-${v}`} checked={effCadence === v} onChange={() => setCadence(v)} />
                        <span>{t}</span>
                        <span className="text-xs font-normal">{v === 'lifetime' && !lifetimeOpen ? (cfg ? 'Sold out' : 'Checking spots') : pr}</span>
                      </label>
                    ))}
                  </div>
                  {cfg && lifetimeOpen && <p className="mt-1 text-xs text-muted-foreground" data-testid="text-lifetime-left">{lifetimeLeft} of 10 lifetime spots left.</p>}
                  {lifetimeBlocked && <p role="status" className="mt-1 text-sm font-semibold text-destructive" data-testid="text-lifetime-soldout">All 10 lifetime spots are taken. Choose Yearly instead.</p>}
                </div>
              )}
              {offer === 'yes' && (
                <div className="mt-3 rise">
                  <DealFields value={{ indiePromoCode: promoCode, indieRateDetails: indie, indieRedeemHow: redeemHow, indieWhoQualifies: qualifies }}
                    errors={{ ...errors, indieRateDetails: errors.indie }} onChange={v => { setPromoCode(v.indiePromoCode); setIndie(v.indieRateDetails); setRedeemHow(v.indieRedeemHow); setQualifies(v.indieWhoQualifies); }} />
                </div>
              )}
              <Err id="plan" msg={errors.plan} />
            </fieldset>
          )}
          {gov && <Err id="plan" msg={errors.plan} />}

          {serverError && <p role="alert" data-testid="error-server" className="border-2 border-destructive p-3 text-sm font-semibold text-destructive">{serverError}</p>}
          <p className="border-l-4 border-primary bg-card p-3 text-sm font-bold" data-testid="text-your-plan" aria-live="polite">Your plan: {plan && planDef ? `${plan} · ${planPrice(planDef)}` : plan ? `${plan} · ${cfg ? 'unavailable' : 'Loading price…'}` : 'Choose a plan above'}</p>
          <button type="submit" disabled={submit.isPending || !cfg || (plan === 'Lifetime Indie Partner' && !lifetimeOpen)} data-testid="button-submit" className="btn w-full text-base">{submit.isPending ? 'Saving' : gov ? 'Submit for review' : 'Continue to payment'}</button>
          <p className="text-xs text-muted-foreground">{gov ? 'Government offices list free and are reviewed before publication.' : planDef?.billing === 'lifetime' ? 'One-time payment. No renewals. Complete your secure Stripe checkout, then your listing will be reviewed.' : 'Yearly plans renew annually. Complete your secure Stripe checkout, then your listing will be reviewed.'}</p>
        </form>
      </div>
    </Layout>
  );
}
