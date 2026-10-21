import { usePreviewAdminRenewalPlan, useScheduleAdminRenewalPlan, type AdminListing } from '@workspace/api-client-react';

export function RenewalPlanDialog({ listing, onCancel, onDone }: { listing: AdminListing; onCancel: () => void; onDone: () => void }) {
  const preview = usePreviewAdminRenewalPlan(listing.id);
  const change = useScheduleAdminRenewalPlan({ request: { headers: { 'X-IFG-Admin': '1' } } });
  const p = preview.data;
  const message = (error: unknown) => (error as { data?: { error?: string } })?.data?.error ?? 'Could not load or schedule the renewal change.';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="renewal-h">
    <div className="w-full max-w-md border-2 border-foreground bg-background p-5">
      <h2 id="renewal-h" className="font-display text-3xl">Remove code at renewal?</h2>
      <p className="mt-2 text-sm">{listing.name}</p>
      {preview.isLoading && <p className="mt-3">Checking the linked Stripe subscription…</p>}
      {p && <div className="mt-3 space-y-2 text-sm">
        <p>Current: <strong>{p.currentPlan} — ${(p.currentAmount / 100).toLocaleString('en-US')}/year.</strong></p>
        <p>At renewal: <strong>{p.targetPlan} — ${(p.targetAmount / 100).toLocaleString('en-US')}/year</strong>, effective <strong>{new Date(p.effectiveAt).toLocaleDateString()}</strong>.</p>
        <p>No immediate charge. The current code and deal stay active until that date. At renewal they are removed and the Standard annual price applies.</p>
      </div>}
      {(preview.error || change.error) && <p role="alert" className="mt-3 text-sm text-destructive">{message(preview.error ?? change.error)}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-outline" onClick={onCancel} disabled={change.isPending} autoFocus>Keep current deal</button>
        <button type="button" data-testid="button-confirm-renewal" className="btn" disabled={!p || change.isPending} onClick={() => {
          if (p) change.mutate({ id: listing.id, data: { confirmed: true, expectedEffectiveAt: p.effectiveAt, expectedAmount: p.targetAmount } }, { onSuccess: onDone });
        }}>{change.isPending ? 'Scheduling…' : 'Confirm renewal change'}</button>
      </div>
    </div>
  </div>;
}
