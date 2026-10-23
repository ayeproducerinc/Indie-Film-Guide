import { useState } from 'react';
import { useCreateMailingOptIn } from '@workspace/api-client-react';
import { MAILING_CONSENT_TEXT, MAILING_OPT_OUT_MAILTO, SUPPORT_EMAIL } from '@/lib/support';

export function MailingListSignup() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const m = useCreateMailingOptIn();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone('');
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setErr('Enter a valid email address.'); return; }
    if (!consent) { setErr('Please check the consent box to join the mailing list.'); return; }
    setErr('');
    m.mutate({ data: { email: em, firstName: firstName.trim(), consent: true, website } }, {
      onSuccess: (r) => { setDone(r.message); setEmail(''); setFirstName(''); setConsent(false); setWebsite(''); },
      onError: (error) => {
        const detail = (error as { data?: { error?: unknown } }).data?.error;
        setErr(typeof detail === 'string' ? detail : 'We could not save your signup. Please try again in a moment.');
      },
    });
  };
  return (
    <section id="mailing-list" tabIndex={-1} aria-labelledby="ml-h" className="mx-auto mt-14 max-w-5xl scroll-mt-20 px-4">
      <div className="border-2 border-foreground bg-card p-5 sm:p-8">
        <h2 id="ml-h" className="font-display text-4xl sm:text-5xl text-balance">Stay connected to Georgia's creative community</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">Join our mailing list for filmmaker and creative artist updates, local opportunities, and news from Indie Film Guide.</p>
        {done ? (
          <p role="status" data-testid="text-mailing-success" className="rise mt-5 border-l-4 border-primary bg-background p-3 font-semibold">{done}</p>
        ) : (
          <form onSubmit={submit} noValidate className="mt-5 grid max-w-2xl gap-4" data-testid="form-mailing-list">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="ml-email" className="block text-sm font-bold">Email (required)</label>
                <input id="ml-email" data-testid="input-mailing-email" type="email" autoComplete="email" maxLength={254} required className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} aria-describedby={err ? 'ml-err' : undefined} />
              </div>
              <div className="min-w-0">
                <label htmlFor="ml-first" className="block text-sm font-bold">First name (optional)</label>
                <input id="ml-first" data-testid="input-mailing-first-name" type="text" autoComplete="given-name" maxLength={80} className="field mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
            </div>
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="ml-website">Website</label>
              <input id="ml-website" name="website" type="text" tabIndex={-1} autoComplete="off" maxLength={200} value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" data-testid="checkbox-mailing-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" aria-required="true" />
              <span className="min-w-0">{MAILING_CONSENT_TEXT}</span>
            </label>
            {err && <p id="ml-err" role="alert" data-testid="error-mailing" className="text-sm font-semibold text-destructive">{err}</p>}
            <div>
              <button type="submit" data-testid="button-mailing-submit" disabled={m.isPending} className="btn w-full sm:w-auto">{m.isPending ? 'Joining' : 'Join the mailing list'}</button>
            </div>
          </form>
        )}
        <p className="mt-5 max-w-2xl text-xs text-muted-foreground">We use your email only to send Indie Film Guide updates. Your contact details are kept private and are never shown in the directory. To opt out, <a href={MAILING_OPT_OUT_MAILTO} data-testid="link-mailing-opt-out" className="break-all font-semibold text-primary underline">email {SUPPORT_EMAIL}</a>. Signups are self-submitted and your email address is not verified.</p>
      </div>
    </section>
  );
}
