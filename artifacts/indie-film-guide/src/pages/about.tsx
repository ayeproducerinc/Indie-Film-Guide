import { Link } from 'wouter';
import { Layout } from '@/components/layout';
import { useMeta } from '@/lib/use-meta';

export default function About() {
  useMeta('About | Indie Film Guide', 'Indie Film Guide is a free, local reference for independent filmmakers finding production resources in Georgia.');
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 rise">
        <h1 className="font-display text-5xl sm:text-6xl">About the guide</h1>
        <p className="mt-5 text-lg leading-relaxed">
          Indie Film Guide is a free reference for independent filmmakers in Georgia. It collects locations, equipment, crew, legal and licensing help, funding and distribution services in one place, sorted by where your project is and what stage it is at. Filmmakers never need an account. Providers pay a yearly fee to be listed, and government offices list free.
        </p>
        <p className="mt-4 text-muted-foreground">Listings are reviewed before they go live, and provider emails are never shown publicly.</p>
        <Link href="/get-listed" className="btn mt-6">Get Listed</Link>
      </div>
    </Layout>
  );
}
