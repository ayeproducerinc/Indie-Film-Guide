import { useRef, useState } from 'react';
import type { Listing } from '@workspace/api-client-react';

export function DealBox({ listing }: { listing: Listing }) {
  const code = useRef<HTMLElement>(null);
  const [message, setMessage] = useState('');
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(listing.indiePromoCode!);
      setMessage('Code copied.');
    } catch {
      if (code.current) {
        const range = document.createRange();
        range.selectNodeContents(code.current);
        const selection = window.getSelection();
        selection?.removeAllRanges(); selection?.addRange(range);
        setMessage('Code selected. Use your device’s Copy command.');
      }
    }
  }
  return <section className="mt-6 border-l-4 border-primary bg-card p-4" aria-labelledby="indie-h">
    <h2 id="indie-h" className="font-display text-2xl">Indie filmmaker deal</h2>
    {!listing.indiePromoCode ? <p className="mt-2 text-muted-foreground">This provider hasn't posted an indie deal.</p> : <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code ref={code} className="break-all font-mono text-2xl font-bold text-primary" data-testid="text-promo-code">{listing.indiePromoCode}</code>
        <button type="button" className="btn-outline" onClick={() => void copy()} data-testid="button-copy-code">Copy code</button>
      </div>
      <p className="text-sm" role="status">{message}</p>
      <dl className="mt-3 space-y-3">
        <div><dt className="text-sm font-bold">What filmmakers get</dt><dd>{listing.indieRateDetails}</dd></div>
        <div><dt className="text-sm font-bold">How to redeem</dt><dd>{listing.indieRedeemHow}</dd></div>
        {listing.indieWhoQualifies && <div><dt className="text-sm font-bold">Who qualifies</dt><dd>{listing.indieWhoQualifies}</dd></div>}
      </dl>
    </>}
  </section>;
}
