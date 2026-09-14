import Link from 'next/link';
import { locales, localePrefix, privacyPath, t, type Locale } from '@/lib/i18n';
import Footer from './Footer';
import LanguageSwitcher from './LanguageSwitcher';

export default function PrivacyPage({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const hrefs = {} as Record<Locale, string>;
  for (const code of locales) hrefs[code] = privacyPath[code];

  return (
    <>
      <header className="px-5 pt-5 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href={localePrefix[locale] || '/'}
            className="text-sm text-muted underline underline-offset-4 hover:text-paper"
          >
            {copy.privacy.back}
          </Link>
          <LanguageSwitcher current={locale} hrefs={hrefs} label={copy.langSwitch} />
        </div>
      </header>

      <main className="px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold sm:text-4xl">{copy.privacy.title}</h1>
          <div className="mt-10 space-y-10">
            {copy.privacy.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-semibold text-gold">{section.heading}</h2>
                <div className="mt-3 space-y-3 text-paper/90">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <Footer locale={locale} />
    </>
  );
}
