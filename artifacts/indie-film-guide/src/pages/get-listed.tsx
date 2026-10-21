import { useState } from 'react';
import { useLocation } from 'wouter';
import { useGetListingConfig, useGetLocations, useSubmitListing } from '@workspace/api-client-react';
import type { ListingInput, Location } from '@workspace/api-client-react';
import { Layout } from '@/components/layout';
import { LocationCombobox } from '@/components/location-combobox';
import { CATEGORIES, PRICES, STAGES } from '@/lib/constants';
import { useMeta } from '@/lib/use-meta';

type Plan = ListingInput['plan'];
type Errors = Partial<Record<string, string>>;

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" data-testid={`error-${id}`} className="mt-1 text-sm font-semibold text-destructive">{msg}</p> : null;
}

export default function GetListed() {
  useMeta('Get Listed | Indie Film Guide', 'Submit your business, nonprofit or government office to the Indie Film Guide directory.');
  const [, nav] = useLocation();
  const { data: cfg } = useGetListingConfig();
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
  const [providerType, setProviderType] = useState<ListingInput['providerType']>('Business');
  const [plan, setPlan] = useState<Plan | ''>('');
  const [indie, setIndie] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');

  const gov = providerType === 'Government';
  const toggleStage = (s: string) => setStages((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const pickProvider = (p: ListingInput['providerType']) => {
    setProviderType(p);
    if (p === 'Government') setPlan('Government');
    else if (plan === 'Government') setPlan('');
  };

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
    if (!plan) e.plan = 'Choose a plan.';
    if (gov && plan !== 'Government') e.plan = 'Government providers use the Government plan.';
    if (!gov && plan === 'Government') e.plan = 'The Government plan is only for government providers.';
    if (plan === 'Indie Partner' && !indie.trim()) e.indie = 'Describe your indie rate in one line.';
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
      ...(plan === 'Indie Partner' ? { indieRateDetails: indie.trim() } : {}),
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
          <div>
            <label htmlFor="field-provider" className={label}>Provider type</label>
            <select id="field-provider" data-testid="select-provider" className="field mt-1" value={providerType} onChange={(e) => pickProvider(e.target.value as ListingInput['providerType'])}>
              <option>Business</option><option>Nonprofit</option><option>Government</option>
            </select>
          </div>

          <fieldset>
            <legend className={label}>Do you offer an indie filmmaker rate?</legend>
            <div id="field-plan" tabIndex={-1} className="mt-2 grid gap-2">
              {plans.map((p) => {
                const price = PRICES[p.id];
                return (
                  <div key={p.id}>
                  <label className={`flex cursor-pointer items-center justify-between gap-3 border-2 p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${p.disabled ? 'cursor-not-allowed opacity-50' : ''} ${plan === p.id ? 'border-primary bg-accent' : 'border-input bg-card'}`}>
                    <input type="radio" name="plan" className="sr-only" disabled={p.disabled} data-testid={`radio-plan-${p.id.replace(' ', '-')}`} checked={plan === p.id} onChange={() => setPlan(p.id)} />
                    <span><span className="block font-bold">{p.title}</span><span className="text-sm text-muted-foreground">{p.sub}</span></span>
                    <span className="font-display text-3xl text-primary">{price === 0 ? 'Free' : `$${price}`}{price > 0 && <span className="text-sm">/yr</span>}</span>
                  </label>
                  {p.id === 'Indie Partner' && plan === 'Indie Partner' && (
                    <div className="border-x-2 border-b-2 border-primary bg-card p-4 rise">
                      <label htmlFor="field-indie" className={label}>Describe your indie rate</label>
                      <input id="field-indie" required data-testid="input-indie-details" className="field mt-1" maxLength={200} value={indie} onChange={(e) => setIndie(e.target.value)} placeholder="One line, e.g. discount, waived fee, free hour" aria-invalid={!!errors.indie} aria-describedby="indie" />
                      <Err id="indie" msg={errors.indie} />
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
            <Err id="plan" msg={errors.plan} />
          </fieldset>

          {serverError && <p role="alert" data-testid="error-server" className="border-2 border-destructive p-3 text-sm font-semibold text-destructive">{serverError}</p>}
          <button type="submit" disabled={submit.isPending} data-testid="button-submit" className="btn w-full text-base">{submit.isPending ? 'Saving' : gov ? 'Submit for review' : 'Continue to payment'}</button>
          <p className="text-xs text-muted-foreground">{gov ? 'Government offices list free and are reviewed before publication.' : 'Paid plans renew annually. Complete your secure Stripe checkout, then your listing will be reviewed.'}</p>
        </form>
      </div>
    </Layout>
  );
}
