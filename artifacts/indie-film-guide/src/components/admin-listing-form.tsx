import { useState } from 'react';
import { useGetListingConfig } from '@workspace/api-client-react';
import type { AdminListing, ListingInput, Location } from '@workspace/api-client-react';
import { LocationCombobox } from '@/components/location-combobox';
import { CATEGORIES, STAGES } from '@/lib/constants';
import { DealFields, type DealValues } from '@/components/deal-fields';
import { planPrice } from '@/lib/plan-price';
import { formatPhone } from '@/lib/format-phone';

type Plan = ListingInput['plan'];
type Errors = Partial<Record<string, string>>;

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={`${id}-err`} role="alert" data-testid={`error-${id}`} className="mt-1 text-sm font-semibold text-destructive">{msg}</p> : null;
}

const label = 'block text-sm font-bold';

export function AdminListingForm({
  initial, locations, pending, serverError, serverFields, onSubmit, onCancel, submitLabel,
}: {
  initial?: AdminListing;
  locations: Location[];
  pending: boolean;
  serverError?: string;
  serverFields?: Errors;
  onSubmit: (d: ListingInput) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const p = (initial?.id ?? 'new').toString();
  const { data: cfg } = useGetListingConfig();
  const locked = !!(initial?.stripeSubscriptionId || initial?.stripeCheckoutId || initial?.stripePaymentIntentId);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? '');
  const [stages, setStages] = useState<string[]>(initial?.stages ?? []);
  const [coverage, setCoverage] = useState<ListingInput['coverage']>((initial?.coverage as ListingInput['coverage']) ?? 'City');
  const [loc, setLoc] = useState<Location | null>(() => (initial?.locationId ? locations.find((l) => l.id === initial.locationId) ?? null : null));
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [phone, setPhone] = useState(() => formatPhone(initial?.phone ?? ''));
  const [email, setEmail] = useState(initial?.email ?? '');
  const [publicEmail, setPublicEmail] = useState(initial?.publicEmail ?? false);
  const [providerType, setProviderType] = useState<ListingInput['providerType']>(initial?.providerType ?? 'Business');
  const [plan, setPlan] = useState<Plan | ''>((initial?.plan as Plan) ?? '');
  const [deal, setDeal] = useState<DealValues>({
    indieRateDetails: initial?.indieRateDetails ?? '', indiePromoCode: initial?.indiePromoCode ?? '',
    indieRedeemHow: initial?.indieRedeemHow ?? '', indieWhoQualifies: initial?.indieWhoQualifies ?? '',
  });
  const [ein, setEin] = useState(initial?.ein ?? '');
  const [einVerified, setEinVerified] = useState(initial?.einVerified ?? false);
  const isIndie = cfg?.plans.find(d => d.name === plan)?.indie ?? false;
  const [errors, setErrors] = useState<Errors>({});
  const err = (k: string) => errors[k] ?? serverFields?.[k];

  const gov = providerType === 'Government';
  const pickProvider = (v: ListingInput['providerType']) => {
    setProviderType(v);
    if (v === 'Government') setPlan('Government');
    else setPlan('');
  };
  const toggleStage = (s: string) => setStages((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Enter a business name.';
    if (!description.trim()) e.description = 'Enter a description.';
    else if (description.trim().length > 200) e.description = 'Keep it to 200 characters or fewer.';
    if (!category) e.category = 'Pick one category.';
    if (stages.length === 0) e.stages = 'Pick at least one stage.';
    if (coverage === 'City' && !loc) e.location = 'Choose a city from the suggestions.';
    if (!website.trim()) e.website = 'Enter a website.';
    if (!phone.trim()) e.phone = 'Enter a phone number.';
    if (!email.trim()) e.email = 'Enter an email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (!plan) e.plan = 'Choose a plan.';
    else if (gov && plan !== 'Government') e.plan = 'Government providers use the Government plan.';
    else if (!gov && plan === 'Government') e.plan = 'The Government plan is only for government providers.';
    if (!cfg?.plans.some(d => d.name === plan && d.providerType === providerType)) e.plan = 'Choose an available plan for this provider type.';
    if (isIndie) {
      if (!deal.indieRateDetails.trim()) e.indieRateDetails = 'Describe what filmmakers get.';
      if (!/^[A-Z0-9]{3,20}$/.test(deal.indiePromoCode)) e.indiePromoCode = 'Use 3–20 uppercase letters or numbers.';
      if (!deal.indieRedeemHow.trim()) e.indieRedeemHow = 'Explain how to redeem.';
    }
    if (providerType === 'Nonprofit' && !/^\d{2}-\d{7}$/.test(ein)) e.ein = 'Enter an EIN as 12-3456789.';
    return e;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) { document.getElementById(`${p}-${first}`)?.focus(); return; }
    onSubmit({
      name: name.trim(), description: description.trim(),
      category: category as ListingInput['category'],
      stages: stages as ListingInput['stages'],
      coverage,
      ...(coverage === 'City' && loc ? { locationId: loc.id } : {}),
      website: website.trim(), phone: phone.trim(), email: email.trim(), publicEmail,
      providerType, plan: plan as Plan,
      ...(isIndie ? deal : {}),
      ...(providerType === 'Nonprofit' ? { ein, einVerified } : {}),
    });
  };

  const chip = (on: boolean) => `press flex min-h-[44px] cursor-pointer items-center justify-center border-2 px-3 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'}`;
  const plans = (cfg?.plans ?? []).filter(d => d.providerType === providerType).map(d => ({
    id: d.name as Plan, title: d.name, disabled: locked || (d.billing === 'lifetime' && cfg!.lifetimeSpotsLeft === 0 && initial?.plan !== d.name),
    definition: d,
  }));

  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-testid={`form-admin-listing-${p}`}>
      <div>
        <label htmlFor={`${p}-name`} className={label}>Business name</label>
        <input id={`${p}-name`} data-testid="input-admin-name" className="field mt-1" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} aria-invalid={!!err('name')} aria-describedby={`${p}-name-err`} />
        <Err id={`${p}-name`} msg={err('name')} />
      </div>
      <div>
        <label htmlFor={`${p}-description`} className={label}>Description</label>
        <textarea id={`${p}-description`} data-testid="input-admin-description" rows={3} className="field mt-1" value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!err('description')} aria-describedby={`${p}-description-err`} />
        <div className="flex justify-between"><Err id={`${p}-description`} msg={err('description')} /><span className={`ml-auto text-xs ${description.length > 200 ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>{description.length}/200</span></div>
      </div>
      <div>
        <label htmlFor={`${p}-category`} className={label}>Category</label>
        <select id={`${p}-category`} data-testid="select-admin-category" className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={!!err('category')} aria-describedby={`${p}-category-err`}>
          <option value="">Choose one</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
        </select>
        <Err id={`${p}-category`} msg={err('category')} />
      </div>
      <fieldset>
        <legend className={label}>Stages</legend>
        <div id={`${p}-stages`} tabIndex={-1} className="mt-2 flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <label key={s} className={chip(stages.includes(s))}>
              <input type="checkbox" className="sr-only" data-testid={`checkbox-admin-stage-${s}`} checked={stages.includes(s)} onChange={() => toggleStage(s)} />
              {s}
            </label>
          ))}
        </div>
        <Err id={`${p}-stages`} msg={err('stages')} />
      </fieldset>
      <fieldset>
        <legend className={label}>Coverage</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['City', 'Statewide', 'Nationwide'] as const).map((c) => (
            <label key={c} className={chip(coverage === c)}>
              <input type="radio" name={`coverage-${p}`} className="sr-only" data-testid={`radio-admin-coverage-${c}`} checked={coverage === c} onChange={() => { setCoverage(c); if (c !== 'City') setLoc(null); setErrors((e) => ({ ...e, location: undefined })); }} />
              {c}
            </label>
          ))}
        </div>
        {coverage === 'City' && (
          <div className="mt-3 grid grid-cols-[1fr_5rem] gap-3">
            <div>
              <span className={label}>City</span>
              <div id={`${p}-location`} tabIndex={-1} className="mt-1">
                <LocationCombobox locations={locations} selected={loc} onSelect={(l) => { setLoc(l); if (l) setErrors((e) => ({ ...e, location: undefined })); }} invalid={!!err('location')} describedBy={`${p}-location-err`} />
              </div>
            </div>
            <div>
              <label htmlFor={`${p}-state`} className={label}>State</label>
              <input id={`${p}-state`} readOnly className="field mt-1 bg-muted" value={loc?.state ?? ''} placeholder="GA" />
            </div>
          </div>
        )}
        {coverage === 'Statewide' && <p className="mt-2 text-sm text-muted-foreground">Statewide listings cover all of Georgia.</p>}
        {coverage === 'Nationwide' && <p className="mt-2 text-sm text-muted-foreground">Nationwide listings have no city or state.</p>}
        <Err id={`${p}-location`} msg={err('location') ?? err('locationId')} />
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-website`} className={label}>Website</label>
          <input id={`${p}-website`} data-testid="input-admin-website" type="url" inputMode="url" className="field mt-1" value={website} maxLength={500} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" aria-invalid={!!err('website')} aria-describedby={`${p}-website-err`} />
          <Err id={`${p}-website`} msg={err('website')} />
        </div>
        <div>
          <label htmlFor={`${p}-phone`} className={label}>Phone</label>
          <input id={`${p}-phone`} data-testid="input-admin-phone" type="tel" className="field mt-1" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} onBlur={(e) => setPhone(formatPhone(e.target.value))} placeholder="(404) 555-0123" aria-invalid={!!err('phone')} aria-describedby={`${p}-phone-err`} />
          <Err id={`${p}-phone`} msg={err('phone')} />
        </div>
      </div>
      <div>
        <label htmlFor={`${p}-email`} className={label}>Email</label>
        <input id={`${p}-email`} data-testid="input-admin-email" type="email" className="field mt-1" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err('email')} aria-describedby={`${p}-email-err`} />
        <Err id={`${p}-email`} msg={err('email')} />
        <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" data-testid="checkbox-admin-public-email" checked={publicEmail} onChange={(e) => setPublicEmail(e.target.checked)} />
          Show this email publicly on the listing
        </label>
      </div>
      <div>
        <label htmlFor={`${p}-providerType`} className={label}>Provider type</label>
        <select id={`${p}-providerType`} data-testid="select-admin-provider" className="field mt-1" value={providerType} disabled={locked} onChange={(e) => pickProvider(e.target.value as ListingInput['providerType'])} aria-describedby={locked ? `${p}-lock` : undefined}>
          <option>Business</option><option>Nonprofit</option><option>Government</option>
        </select>
      </div>
      {providerType === 'Nonprofit' && <div>
        <label className={label} htmlFor={`${p}-ein`}>EIN (private)</label>
        <input id={`${p}-ein`} data-testid="input-admin-ein" className="field mt-1" value={ein} maxLength={10} placeholder="12-3456789"
          onChange={e => { setEin(e.target.value); setEinVerified(false); }} />
        <Err id={`${p}-ein`} msg={err('ein')} />
        <label className="mt-2 flex min-h-[44px] items-center gap-3 text-sm font-semibold">
          <input type="checkbox" data-testid="checkbox-admin-ein-verified" checked={einVerified} disabled={!!initial && ein !== initial.ein}
            onChange={e => setEinVerified(e.target.checked)} className="h-5 w-5" /> EIN verified
        </label>
        <p className="text-xs text-muted-foreground">Verify the nonprofit's EIN before approving. Save a changed EIN before marking it verified.</p>
      </div>}
      <fieldset>
        <legend className={label}>Plan</legend>
        <div id={`${p}-plan`} tabIndex={-1} className="mt-2 grid gap-2">
          {plans.map((pl) => {
            return (
              <label key={pl.id} className={`flex cursor-pointer items-center justify-between gap-3 border-2 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${pl.disabled ? 'cursor-not-allowed opacity-50' : ''} ${plan === pl.id ? 'border-primary bg-accent' : 'border-input bg-card'}`}>
                <input type="radio" name={`plan-${p}`} className="sr-only" disabled={pl.disabled} data-testid={`radio-admin-plan-${pl.id.replace(' ', '-')}`} checked={plan === pl.id} onChange={() => setPlan(pl.id)} />
                <span className="font-bold">{pl.title}</span>
                <span className="font-display text-2xl text-primary">{planPrice(pl.definition)}</span>
              </label>
            );
          })}
        </div>
        {locked && <p id={`${p}-lock`} data-testid="text-plan-locked" className="mt-2 border-l-4 border-primary bg-card p-3 text-sm">Plan and provider type are locked to the linked Stripe checkout or payment. Promo-code edits do not start another subscription. Use “Remove code at renewal” on the listing to change a yearly indie plan to Standard; keep the current deal until renewal. Lifetime has no renewal and must keep a deal.</p>}
        <Err id={`${p}-plan`} msg={err('plan') ?? err('providerType')} />
        {isIndie && <DealFields prefix={p} value={deal} onChange={setDeal} errors={{ ...serverFields, ...errors }} />}
      </fieldset>
      {serverError && <p role="alert" data-testid="error-admin-form" className="border-2 border-destructive p-3 text-sm font-semibold text-destructive">{serverError}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending || !cfg} data-testid="button-admin-save" className="btn">{pending ? 'Saving' : submitLabel}</button>
        <button type="button" onClick={onCancel} data-testid="button-admin-cancel" className="btn-outline">Cancel</button>
      </div>
    </form>
  );
}
