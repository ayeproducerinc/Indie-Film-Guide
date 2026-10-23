import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LISTING_UPDATE_MAILTO, SUPPORT_EMAIL } from '@/lib/support';

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const navCls = (p: string) =>
    `px-2 py-2 text-sm font-semibold hover:text-primary ${loc === p ? 'text-primary' : 'text-foreground'}`;
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 sm:px-4 h-14">
          <Link href="/" data-testid="link-home" className="font-display text-base min-[380px]:text-xl sm:text-2xl text-foreground flex min-w-0 items-center gap-1.5 sm:gap-2 whitespace-nowrap">
            <img src={`${import.meta.env.BASE_URL}favicon.svg?v=clapperboard`} className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" alt="" aria-hidden="true" width="24" height="24" />
            Indie Film Guide
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <Link href="/about" data-testid="link-about-nav" className={`${navCls('/about')} hidden sm:block`}>About</Link>
            <Link href="/pricing" data-testid="link-pricing-nav" className={`${navCls('/pricing')} px-1.5 sm:px-2`}>Pricing</Link>
            <Link
              href="/get-listed"
              data-testid="button-get-listed-header"
              className="press bg-primary text-primary-foreground px-2 sm:px-3 py-2 text-xs sm:text-sm font-bold uppercase tracking-wide hover:opacity-90 transition whitespace-nowrap"
            >
              Get Listed
            </Link>
          </nav>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
      <footer className="mt-16 bg-foreground text-background">
        <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl">Indie Film Guide</p>
            <p className="mt-2 max-w-md text-xs">Providers pay to be listed. Payment never affects the order of results.</p>
            <p className="mt-2 text-sm">Listing updates: <a href={LISTING_UPDATE_MAILTO} data-testid="link-support-footer" className="break-all underline underline-offset-4">{SUPPORT_EMAIL}</a></p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold" aria-label="Footer">
            <Link href="/about" data-testid="link-about" className="py-2 underline-offset-4 hover:underline">About</Link>
            <Link href="/pricing" data-testid="link-pricing" className="py-2 underline-offset-4 hover:underline">Pricing</Link>
            <a href={`${import.meta.env.BASE_URL}#mailing-list`} data-testid="link-mailing-list-footer" className="py-2 underline-offset-4 hover:underline">Join the mailing list</a>
            <Link href="/terms" data-testid="link-terms" className="py-2 underline-offset-4 hover:underline">Terms</Link>
             <Link href="/admin" className="py-2 underline-offset-4 hover:underline">Admin</Link>
            <Link href="/get-listed" data-testid="link-get-listed-footer" className="py-2 underline-offset-4 hover:underline">Get Listed</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function Badge({ kind, children }: { kind: 'indie' | 'gov' | 'plain'; children: ReactNode }) {
  const cls =
    kind === 'indie'
      ? 'bg-[hsl(var(--green-bg))] text-[hsl(var(--green))]'
      : kind === 'gov'
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-muted-foreground';
  return <span className={`inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${cls}`}>{children}</span>;
}
