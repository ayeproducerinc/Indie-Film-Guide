import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminSession, getGetAdminSessionQueryKey, useLoginAdmin, useLogoutAdmin,
  useGetAdminDashboard, getGetAdminDashboardQueryKey, useAddAdminListing, useUpdateAdminListing,
  useDeleteAdminListing, useSetAdminListingStatus, useGetLocations, useCreateAdminListingCheckout,
} from '@workspace/api-client-react';
import type { AdminListing, ListingInput } from '@workspace/api-client-react';
import { Layout } from '@/components/layout';
import { AdminListingForm } from '@/components/admin-listing-form';
import { shortCategory, placeLabel } from '@/lib/constants';
import { useMeta } from '@/lib/use-meta';

const REQ = { request: { headers: { 'X-IFG-Admin': '1' } } };
type Filter = 'All' | 'Pending' | 'Live' | 'Rejected';
type Fields = Partial<Record<string, string>>;

function errInfo(e: unknown): { message: string; fields: Fields } {
  const d = (e as { data?: { error?: unknown; fields?: unknown } } | null)?.data;
  const fields: Fields = {};
  if (d?.fields && typeof d.fields === 'object') {
    for (const [k, v] of Object.entries(d.fields as Record<string, unknown>)) fields[k] = Array.isArray(v) ? v.join(' ') : String(v);
  }
  const message = typeof d?.error === 'string' ? d.error : (e as Error | null)?.message || 'Something went wrong. Try again.';
  return { message, fields };
}

function Stat({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <div className="border-2 border-foreground bg-card p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p data-testid={id} className="font-display mt-1 break-words text-3xl text-primary">{value}</p>
    </div>
  );
}

function Login({ configured }: { configured: boolean }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const login = useLoginAdmin(REQ);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    login.mutate({ data: { password: pw } }, {
      onSuccess: (s) => { setPw(''); qc.setQueryData(getGetAdminSessionQueryKey(), s); qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); },
    });
  };
  const m = login.error ? errInfo(login.error) : null;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Private</p>
      <h1 className="font-display mt-2 text-5xl">Admin sign in</h1>
      {!configured ? (
        <p role="alert" data-testid="text-admin-unconfigured" className="mt-6 border-l-4 border-destructive bg-card p-3 text-sm">Admin access is not configured on the server yet. Set the admin password secret and reload.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" data-testid="form-admin-login">
          <div>
            <label htmlFor="admin-password" className="block text-sm font-bold">Password</label>
            <input id="admin-password" data-testid="input-admin-password" type="password" autoComplete="current-password" maxLength={1000} className="field mt-1" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!m} aria-describedby={m ? 'login-err' : undefined} />
          </div>
          {m && <p id="login-err" role="alert" data-testid="error-admin-login" className="text-sm font-semibold text-destructive">{m.message}</p>}
          <button type="submit" disabled={login.isPending || !pw} data-testid="button-admin-login" className="btn w-full">{login.isPending ? 'Signing in' : 'Sign in'}</button>
        </form>
      )}
    </div>
  );
}

function statusCls(s: string) {
  return s === 'Live' ? 'bg-[hsl(var(--green-bg))] text-[hsl(var(--green))]' : s === 'Rejected' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground';
}

function Row({ l, onEdit, onDelete, onStatus, onPayment, paymentUrl, busy }: { l: AdminListing; onEdit: () => void; onDelete: () => void; onStatus: (s: 'Pending' | 'Live' | 'Rejected') => void; onPayment: () => void; paymentUrl?: string; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const paid = l.paymentStatus.toLowerCase() === 'paid' || l.plan === 'Government';
  const btn = 'btn-outline !min-h-[40px] !px-3 !text-xs';
  return (
    <li data-testid={`row-listing-${l.id}`} className="border-2 border-foreground bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-bold">{l.name}</h3>
          <p className="text-sm text-muted-foreground">{shortCategory(l.category)} / {placeLabel(l)} / {l.providerType}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <span data-testid={`status-listing-${l.id}`} className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${statusCls(l.status)}`}>{l.status}</span>
          <span className="bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{l.plan}</span>
          <span data-testid={`payment-listing-${l.id}`} className="bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment: {l.paymentStatus}</span>
        </div>
      </div>
      <p className="mt-2 break-words text-sm">{l.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`button-details-${l.id}`}>{open ? 'Hide private details' : 'Private details'}</button>
        <button type="button" className={btn} onClick={onEdit} data-testid={`button-edit-${l.id}`}>Edit</button>
        {l.status !== 'Live' && <button type="button" className="btn !min-h-[40px] !px-3 !text-xs" disabled={busy} onClick={() => onStatus('Live')} data-testid={`button-approve-${l.id}`}>Approve</button>}
        {l.status !== 'Rejected' && <button type="button" className={btn} disabled={busy} onClick={() => onStatus('Rejected')} data-testid={`button-reject-${l.id}`}>Reject</button>}
        {l.status !== 'Pending' && <button type="button" className={btn} disabled={busy} onClick={() => onStatus('Pending')} data-testid={`button-pending-${l.id}`}>Back to pending</button>}
        <button type="button" className="press min-h-[40px] border-2 border-destructive px-3 text-xs font-bold uppercase tracking-wide text-destructive" onClick={onDelete} data-testid={`button-delete-${l.id}`}>Delete</button>
         {!paid && !l.stripeSubscriptionId && <button type="button" className={btn} disabled={busy} onClick={onPayment} data-testid={`button-payment-${l.id}`}>Create payment link</button>}
      </div>
      {l.status !== 'Live' && !paid && <p className="mt-2 text-xs text-muted-foreground">Unpaid. The server will not approve this listing until payment is recorded.</p>}
      {paymentUrl && <p className="mt-3 break-all text-sm"><span className="font-semibold">Listing-specific checkout: </span><a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{paymentUrl}</a></p>}
      {open && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 border-t-2 border-border pt-3 text-sm sm:grid-cols-2" data-testid={`details-listing-${l.id}`}>
          {([
            ['Reference', l.reference], ['Email (private)', l.email], ['Email public', l.publicEmail ? 'Yes' : 'No'], ['Phone', l.phone],
            ['Website', l.website], ['Stages', l.stages.join(', ')], ['Coverage', l.coverage], ['Slug', l.slug],
            ['Indie rate', l.indieRate ? l.indieRateDetails || 'Yes' : 'No'], ['Created', new Date(l.createdAt).toLocaleString()],
            ['Founding price locked', l.foundingPriceLocked ? 'Yes' : 'No'], ['Stripe subscription', l.stripeSubscriptionId ?? 'None'],
          ] as const).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="break-all">{v || 'Not provided'}</dd></div>
          ))}
        </dl>
      )}
    </li>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const dash = useGetAdminDashboard({
    query: { queryKey: getGetAdminDashboardQueryKey(), staleTime: 0, refetchOnMount: 'always', refetchInterval: 30000 },
  });
  const loc = useGetLocations();
  const locations = loc.data ?? [];
  const [filter, setFilter] = useState<Filter>('All');
  const [mode, setMode] = useState<{ kind: 'add' } | { kind: 'edit'; l: AdminListing } | null>(null);
  const [del, setDel] = useState<AdminListing | null>(null);
  const [notice, setNotice] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [paymentUrls, setPaymentUrls] = useState<Record<number, string>>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
    qc.invalidateQueries({ predicate: (q) => { const k = String(q.queryKey[0]); return k.startsWith('/api/listings') || k.startsWith('/api/directory'); } });
  };
  const onDone = (msg: string) => { setNotice(msg); setActionErr(''); setMode(null); setDel(null); refresh(); };

  const add = useAddAdminListing(REQ);
  const update = useUpdateAdminListing(REQ);
  const remove = useDeleteAdminListing(REQ);
  const status = useSetAdminListingStatus(REQ);
  const logout = useLogoutAdmin(REQ);
  const checkout = useCreateAdminListingCheckout(REQ);
  useEffect(() => {
    if ((dash.error as { status?: number } | null)?.status === 401) {
      qc.setQueryData(getGetAdminSessionQueryKey(), { authenticated: false, configured: true });
      qc.removeQueries({ queryKey: getGetAdminDashboardQueryKey() });
    }
  }, [dash.error, qc]);

  const signOut = () => {
    const clear = () => {
      qc.removeQueries({ queryKey: getGetAdminDashboardQueryKey() });
      qc.setQueryData(getGetAdminSessionQueryKey(), { authenticated: false, configured: true });
    };
    logout.mutate(undefined, { onSuccess: clear, onError: (e) => setActionErr(errInfo(e).message) });
  };
  const setStatus = (l: AdminListing, s: 'Pending' | 'Live' | 'Rejected') => {
    setNotice(''); setActionErr('');
    status.mutate({ id: l.id, data: { status: s } }, {
      onSuccess: () => onDone(`${l.name} set to ${s}.`), onError: (e: unknown) => setActionErr(errInfo(e).message),
    });
  };

  const data = dash.isError ? undefined : dash.data;
  const all = data?.listings ?? [];
  const counts = { All: all.length, Pending: 0, Live: 0, Rejected: 0 } as Record<Filter, number>;
  all.forEach((l) => { if (l.status in counts) counts[l.status as Filter]++; });
  const shown = filter === 'All' ? all : all.filter((l) => l.status === filter);
  const em = add.error ? errInfo(add.error) : mode?.kind === 'edit' && update.error ? errInfo(update.error) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Private</p>
          <h1 className="font-display mt-2 text-5xl">Admin</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn" data-testid="button-admin-add" onClick={() => { add.reset(); update.reset(); setMode({ kind: 'add' }); }}>Add listing</button>
          <button type="button" className="btn-outline" data-testid="button-admin-logout" disabled={logout.isPending} onClick={signOut}>{logout.isPending ? 'Signing out' : 'Sign out'}</button>
        </div>
      </div>

      {dash.isLoading && <div className="mt-6 space-y-3" aria-busy="true" data-testid="skeleton-admin">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse bg-muted" />)}</div>}
      {dash.isError && (
        <p role="alert" data-testid="error-admin-dashboard" className="mt-6 border-2 border-destructive p-3 text-sm font-semibold text-destructive">
          {errInfo(dash.error).message} <button type="button" className="underline" onClick={() => dash.refetch()}>Retry</button>
        </p>
      )}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat id="stat-live" label="Live listings" value={String(data.liveCount)} />
            <Stat id="stat-paid" label="Paid listings" value={String(data.paidCount)} />
            <Stat id="stat-revenue" label="Yearly revenue" value={`$${data.yearlyRevenue.toLocaleString()}`} />
            <Stat id="stat-mode" label="Billing mode" value={data.billingMode} />
          </div>

          <section className="mt-6 border-2 border-foreground bg-card p-4" aria-labelledby="pay-h">
            <h2 id="pay-h" className="text-sm font-bold uppercase tracking-wider">Stripe payment links ({data.billingMode})</h2>
            <p className="mt-1 text-sm text-muted-foreground">These are reusable generic links. A generic link alone does not approve or link a listing. Providers should start checkout from Get Listed so the payment is tied to their listing.</p>
            {data.paymentLinks.length === 0 ? (
              <p data-testid="text-no-links" className="mt-2 text-sm font-semibold">No payment links available{data.billingMode === 'unavailable' ? ' because billing is unavailable' : ''}.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.paymentLinks.map((p) => (
                  <li key={p.plan} className="flex flex-wrap gap-x-3 text-sm"><span className="font-bold">{p.plan}</span><a href={p.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline" data-testid={`link-payment-${p.plan.replace(/\s+/g, '-')}`}>{p.url}</a></li>
                ))}
              </ul>
            )}
          </section>

          {notice && <p role="status" data-testid="text-admin-notice" className="mt-4 border-l-4 border-primary bg-card p-3 text-sm font-semibold">{notice}</p>}
          {actionErr && <p role="alert" data-testid="error-admin-action" className="mt-4 border-2 border-destructive p-3 text-sm font-semibold text-destructive">{actionErr}</p>}

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter listings">
            {(['All', 'Pending', 'Live', 'Rejected'] as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} data-testid={`filter-${f}`} onClick={() => setFilter(f)} className={`press min-h-[44px] border-2 px-4 text-sm font-bold ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'}`}>{f} ({counts[f]})</button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div data-testid="empty-admin" className="mt-4 border-2 border-dashed border-foreground p-8 text-center">
              <p className="font-display text-3xl">Nothing here</p>
              <p className="mt-1 text-sm text-muted-foreground">{filter === 'All' ? 'No listings yet. Add the first one.' : `No ${filter.toLowerCase()} listings.`}</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {shown.map((l) => (
                 <Row key={l.id} l={l} busy={status.isPending || checkout.isPending} onStatus={(s) => setStatus(l, s)} onEdit={() => { add.reset(); update.reset(); setMode({ kind: 'edit', l }); }} onDelete={() => { remove.reset(); setDel(l); }}
                   paymentUrl={paymentUrls[l.id]} onPayment={() => {
                     setActionErr('');
                     checkout.mutate({ id: l.id }, {
                       onSuccess: (result) => setPaymentUrls(previous => ({ ...previous, [l.id]: result.url })),
                       onError: (e) => setActionErr(errInfo(e).message),
                     });
                   }} />
              ))}
            </ul>
          )}
        </>
      )}

      {mode && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-foreground/60" role="dialog" aria-modal="true" aria-labelledby="form-h">
          <div className="mx-auto my-4 max-w-2xl border-2 border-foreground bg-background p-4 sm:p-6">
            <h2 id="form-h" className="font-display text-4xl">{mode.kind === 'add' ? 'Add listing' : `Edit ${mode.l.name}`}</h2>
            {mode.kind === 'add' && <p className="mt-1 mb-4 text-sm text-muted-foreground">New listings are created as Pending. Approve them separately.</p>}
            {loc.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading cities</p>}
            {loc.isError && <p role="alert" className="mt-2 text-sm font-semibold text-destructive">Could not load cities. <button type="button" className="underline" onClick={() => loc.refetch()}>Retry</button></p>}
            <div className="mt-4">
              <AdminListingForm
                key={mode.kind === 'edit' ? mode.l.id : 'new'}
                initial={mode.kind === 'edit' ? mode.l : undefined}
                locations={locations}
                pending={add.isPending || update.isPending}
                serverError={em?.message}
                serverFields={em?.fields}
                submitLabel={mode.kind === 'add' ? 'Create listing' : 'Save changes'}
                onCancel={() => setMode(null)}
                onSubmit={(d: ListingInput) => {
                  if (mode.kind === 'add') add.mutate({ data: d }, { onSuccess: (r) => onDone(`${r.name} created as Pending.`) });
                  else update.mutate({ id: mode.l.id, data: d }, { onSuccess: (r) => onDone(`${r.name} updated.`) });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {del && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="del-h">
          <div className="w-full max-w-md border-2 border-destructive bg-background p-5">
            <h2 id="del-h" className="font-display text-3xl">Delete listing?</h2>
            <p className="mt-2 break-words text-sm">Remove {del.name} from the directory and review queue? This cannot be undone here. Active Stripe subscriptions must be cancelled in Stripe first.</p>
            {remove.isError && <p role="alert" data-testid="error-admin-delete" className="mt-2 text-sm font-semibold text-destructive">{errInfo(remove.error).message}</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" autoFocus className="btn-outline" onClick={() => setDel(null)} data-testid="button-delete-cancel">Keep listing</button>
              <button type="button" disabled={remove.isPending} data-testid="button-delete-confirm" className="press min-h-[44px] border-2 border-destructive bg-destructive px-4 text-sm font-bold uppercase tracking-wide text-destructive-foreground disabled:opacity-60"
                 onClick={() => remove.mutate({ id: del.id }, { onSuccess: () => onDone(`${del.name} deleted.`) })}>
                 {remove.isPending ? 'Deleting' : 'Delete listing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  useMeta('Admin | Indie Film Guide', 'Private listing review for Indie Film Guide.');
  const session = useGetAdminSession({ query: { queryKey: getGetAdminSessionQueryKey(), staleTime: 0, refetchOnMount: 'always' } });
  return (
    <Layout>
      <meta name="robots" content="noindex" />
      {session.isLoading && <div className="mx-auto max-w-md space-y-3 px-4 py-12" aria-busy="true"><div className="h-12 animate-pulse bg-muted" /><div className="h-24 animate-pulse bg-muted" /></div>}
      {session.isError && (
        <p role="alert" data-testid="error-admin-session" className="mx-auto mt-12 max-w-md border-2 border-destructive p-3 text-sm font-semibold text-destructive">Could not check admin session. <button type="button" className="underline" onClick={() => session.refetch()}>Retry</button></p>
      )}
      {session.data && (session.data.authenticated ? <Dashboard /> : <Login configured={session.data.configured} />)}
    </Layout>
  );
}
