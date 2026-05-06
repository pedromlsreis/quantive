import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';

export default function Impressum() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Impressum</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: April 10, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">
          <h2>Quantive</h2>

          <p>
            <strong>Business form:</strong> Einzelunternehmen
            <br />
            <strong>Inhaber:</strong> Pedro Miguel Lima de Sousa Reis
            <br />
            Lützowstraße 31
            <br />
            40476 Düsseldorf
            <br />
            Germany
          </p>

          <p>
            <strong>Email:</strong>{' '}
            <a href="mailto:hello@usequantive.app" className="text-primary hover:underline">
              hello@usequantive.app
            </a>
          </p>

          {/* TODO: Add USt-IdNr. once available */}
          {/* <p><strong>USt-IdNr.:</strong> DE-XXXXXXX</p> */}

          <h2>Verantwortlich gemäß § 5 TMG:</h2>
          <p>Pedro Miguel Lima de Sousa Reis</p>

          <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:</h2>
          <p>Pedro Miguel Lima de Sousa Reis</p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
