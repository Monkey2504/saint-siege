import Link from 'next/link';
import { locales, localeLabel, localeName, type Locale } from '@/lib/i18n';

/**
 * Sélecteur de langue. Les trois destinations sont fournies par la page :
 * l'accueil et la page de confidentialité n'ont pas les mêmes chemins.
 */
export default function LanguageSwitcher({
  current,
  hrefs,
  label,
}: {
  current: Locale;
  hrefs: Record<Locale, string>;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-1 text-sm">
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={hrefs[locale]}
            hrefLang={locale}
            aria-current={active ? 'true' : undefined}
            title={localeName[locale]}
            className={
              active
                ? 'rounded-sm px-2 py-1 font-semibold text-gold'
                : 'rounded-sm px-2 py-1 text-muted hover:text-paper'
            }
          >
            {localeLabel[locale]}
          </Link>
        );
      })}
    </nav>
  );
}
