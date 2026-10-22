import { Link } from 'wouter';
import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';

export default function About() {
  useMeta('About | Indie Film Guide', 'Indie Film Guide is a free, local reference for independent filmmakers finding production resources in Georgia.');
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 rise">
        <h1 className="font-display text-5xl sm:text-6xl">About the guide</h1>
        <div className="mt-6 space-y-6 text-lg leading-relaxed">
          <p>
            Indie Film Guide connects independent filmmakers in Georgia with locations, equipment, crew, business services, funding, and distribution resources, organized by location and production stage.
          </p>
          <p>
            Filmmakers can browse without an account, businesses and organizations pay to be listed, and government offices list free.
          </p>
          <p className="border-l-4 border-primary bg-primary/5 p-5">
            <strong className="mb-2 block">Our commitment to local filmmakers</strong>
            As part of our commitment to corporate social responsibility (CSR), a portion of listing fees supports local filmmakers and their productions—so your business’s participation goes beyond visibility to help bring local stories to life and strengthen Georgia’s creative community.
          </p>
        </div>
        <p className="mt-8 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
          <strong>Disclaimer:</strong> Listings are reviewed before they go live. Provider emails are private unless the provider chooses to list their email publicly.
        </p>
        <Link href="/get-listed" className="btn mt-6">Get Listed</Link>
      </div>
    </Layout>
  );
}
