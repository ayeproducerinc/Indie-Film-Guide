import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminMailingList, getGetAdminMailingListQueryKey, useOptOutMailingContact, useDeleteMailingContact,
  downloadMailingListCsv, getGetAdminSessionQueryKey,
} from '@workspace/api-client-react';
import type { MailingContact } from '@workspace/api-client-react';

const REQ = { request: { headers: { 'X-IFG-Admin': '1' } } };
const msg = (e: unknown) => {
  const d = (e as { data?: { error?: unknown } } | null)?.data;
  return typeof d?.error === 'string' ? d.error : (e as Error | null)?.message || 'Something went wrong. Try again.';
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '');

export function AdminMailingList() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [del, setDel] = useState<MailingContact | null>(null);
  const [exporting, setExporting] = useState(false);
  const list = useGetAdminMailingList({ page }, { query: { queryKey: getGetAdminMailingListQueryKey({ page }), staleTime: 0, refetchOnMount: 'always' } });
  const optOut = useOptOutMailingContact(REQ);
  const remove = useDeleteMailingContact(REQ);
  const invalidate = () => qc.invalidateQueries({ queryKey: getGetAdminMailingListQueryKey() });

  useEffect(() => {
    if ((list.error as { status?: number } | null)?.status === 401) {
      qc.removeQueries({ queryKey: getGetAdminMailingListQueryKey() });
      qc.setQueryData(getGetAdminSessionQueryKey(), { authenticated: false, configured: true });
    }
  }, [list.error, qc]);
  useEffect(() => () => { qc.removeQueries({ queryKey: getGetAdminMailingListQueryKey() }); }, [qc]);

  const data = list.isError ? undefined : list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  useEffect(() => { if (data && page > pages) setPage(pages); }, [data, page, pages]);

  const doOptOut = (c: MailingContact) => {
    setNotice(''); setActionErr('');
    optOut.mutate({ id: c.id }, { onSuccess: () => { setNotice(`${c.email} marked opted out.`); invalidate(); }, onError: (e) => setActionErr(msg(e)) });
  };
  const doDelete = () => {
    if (!del) return;
    setNotice(''); setActionErr('');
    remove.mutate({ id: del.id }, { onSuccess: () => { setNotice(`${del.email} deleted.`); setDel(null); invalidate(); }, onError: (e) => setActionErr(msg(e)) });
  };
  const exportCsv = async () => {
    setNotice(''); setActionErr(''); setExporting(true);
    try {
      const blob = await downloadMailingListCsv({ responseType: 'blob', ...REQ.request });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'mailing-list-active.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV downloaded (active opted-in contacts only).');
    } catch (e) { setActionErr(msg(e)); } finally { setExporting(false); }
  };
  const btn = 'btn-outline !min-h-[40px] !px-3 !text-xs';

  return (
    <section className="mt-10 border-t-2 border-foreground pt-6" aria-labelledby="ml-admin-h" data-testid="section-admin-mailing-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ml-admin-h" className="font-display text-4xl">Mailing list</h2>
          <p className="mt-1 text-sm text-muted-foreground">Self-submitted opt-ins. Email addresses are not verified. Repeat signups do not reactivate opted-out contacts.</p>
          <p className="mt-2 text-sm text-muted-foreground">Download a fresh CSV before each campaign and remove withdrawn contacts from any previously saved lists.</p>
        </div>
        <button type="button" className="btn" data-testid="button-mailing-export" disabled={exporting || optOut.isPending || remove.isPending} onClick={exportCsv}>{exporting ? 'Preparing CSV' : 'Download CSV (active)'}</button>
      </div>
      {notice && <p role="status" data-testid="text-mailing-notice" className="mt-4 border-l-4 border-primary bg-card p-3 text-sm font-semibold">{notice}</p>}
      {actionErr && <p role="alert" data-testid="error-mailing-action" className="mt-4 border-2 border-destructive p-3 text-sm font-semibold text-destructive">{actionErr}</p>}
      {list.isLoading && <div className="mt-4 space-y-3" aria-busy="true" data-testid="skeleton-mailing">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse bg-muted" />)}</div>}
      {list.isError && (
        <p role="alert" data-testid="error-mailing-list" className="mt-4 border-2 border-destructive p-3 text-sm font-semibold text-destructive">{msg(list.error)} <button type="button" className="underline" onClick={() => list.refetch()}>Retry</button></p>
      )}
      {data && data.contacts.length === 0 && (
        <div data-testid="empty-mailing" className="mt-4 border-2 border-dashed border-foreground p-8 text-center">
          <p className="font-display text-3xl">No contacts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Signups from the homepage form will appear here.</p>
        </div>
      )}
      {data && data.contacts.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold" data-testid="text-mailing-total">{data.total} {data.total === 1 ? 'contact' : 'contacts'}</p>
          <ul className="mt-2 space-y-3" data-testid="list-mailing-contacts">
            {data.contacts.map((c) => (
              <li key={c.id} data-testid={`row-mailing-${c.id}`} className="border-2 border-foreground bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-bold" data-testid={`text-mailing-email-${c.id}`}>{c.email}</p>
                    <p className="break-words text-sm text-muted-foreground">{c.firstName || 'No first name'}</p>
                  </div>
                  <span data-testid={`status-mailing-${c.id}`} className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${c.status === 'active' ? 'bg-[hsl(var(--green-bg))] text-[hsl(var(--green))]' : 'bg-muted text-muted-foreground'}`}>{c.status === 'active' ? 'Active opt-in' : 'Opted out'}</span>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Signed up</dt><dd>{fmt(c.createdAt)}</dd></div>
                  <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Consent</dt><dd>{fmt(c.consentAt)} (version {c.consentVersion}, {c.source}). Self-submitted, not verified.</dd></div>
                  {c.optedOutAt && <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Opted out</dt><dd>{fmt(c.optedOutAt)}</dd></div>}
                  <div className="min-w-0 sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Consent text</dt><dd className="break-words text-xs">{c.consentText}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === 'active' && <button type="button" className={btn} disabled={optOut.isPending} onClick={() => doOptOut(c)} data-testid={`button-mailing-optout-${c.id}`}>Mark opted out</button>}
                  <button type="button" className="press min-h-[40px] border-2 border-destructive px-3 text-xs font-bold uppercase tracking-wide text-destructive" onClick={() => { remove.reset(); setDel(c); }} data-testid={`button-mailing-delete-${c.id}`}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-mailing-prev">Previous</button>
            <span className="text-sm font-semibold" data-testid="text-mailing-page">Page {page} of {pages}</span>
            <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-mailing-next">Next</button>
          </div>
        </>
      )}
      {del && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="ml-del-h">
          <div className="w-full max-w-md border-2 border-destructive bg-background p-5">
            <h2 id="ml-del-h" className="font-display text-3xl">Delete contact?</h2>
            <p className="mt-2 break-all text-sm">Permanently delete {del.email} and its consent record? This cannot be undone.</p>
            {remove.isError && <p role="alert" className="mt-2 text-sm font-semibold text-destructive">{msg(remove.error)}</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" autoFocus className="btn-outline" onClick={() => setDel(null)} data-testid="button-mailing-delete-cancel">Keep contact</button>
              <button type="button" disabled={remove.isPending} data-testid="button-mailing-delete-confirm" className="press min-h-[44px] border-2 border-destructive bg-destructive px-4 text-sm font-bold uppercase tracking-wide text-destructive-foreground disabled:opacity-60" onClick={doDelete}>{remove.isPending ? 'Deleting' : 'Delete contact'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
