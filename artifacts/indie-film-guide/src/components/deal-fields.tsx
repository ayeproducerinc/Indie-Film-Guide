export type DealValues = { indiePromoCode: string; indieRateDetails: string; indieRedeemHow: string; indieWhoQualifies: string };
export function DealFields({ value, onChange, errors = {}, prefix = 'field' }: {
  value: DealValues; onChange: (v: DealValues) => void; errors?: Partial<Record<string, string>>; prefix?: string;
}) {
  const fields = [
    ['indiePromoCode', 'Indie promo code', 20, 'INDIEFILMGUIDE'],
    ['indieRateDetails', 'What filmmakers get', 200, '10% off weekday rentals'],
    ['indieRedeemHow', 'How to redeem', 120, 'Mention the code when you book'],
    ['indieWhoQualifies', 'Who qualifies (optional)', 120, 'Productions under $500K'],
  ] as const;
  return <div className="space-y-4 border-2 border-primary bg-card p-4">
    {fields.map(([key, label, maxLength, placeholder]) => <div key={key}>
      <label className="block text-sm font-bold" htmlFor={`${prefix}-${key}`}>{label}</label>
      <input id={`${prefix}-${key}`} data-testid={`input-${key}`} className="field mt-1" value={value[key]} required={key !== 'indieWhoQualifies'} maxLength={maxLength}
        pattern={key === 'indiePromoCode' ? '[A-Z0-9]{3,20}' : undefined}
        autoCapitalize={key === 'indiePromoCode' ? 'characters' : undefined} placeholder={placeholder}
        onChange={e => onChange({ ...value, [key]: key === 'indiePromoCode' ? e.target.value.toUpperCase() : e.target.value })}
        aria-invalid={!!errors[key]} aria-describedby={`${prefix}-${key}-help`} />
      <p id={`${prefix}-${key}-help`} className={`mt-1 text-xs ${errors[key] ? 'text-destructive' : 'text-muted-foreground'}`} role={errors[key] ? 'alert' : undefined}>
        {errors[key] ?? (key === 'indiePromoCode' ? 'Use a code unique to the guide so you can count bookings we send you.' : `${value[key].length}/${maxLength}`)}
      </p>
    </div>)}
  </div>;
}
