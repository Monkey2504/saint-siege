import '../app/globals.css';
import type { Locale } from '@/lib/i18n';

/** Enveloppe html/body commune aux trois racines de langue. */
export default function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
