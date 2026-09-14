import { locales, localePrefix, t, type Locale } from '@/lib/i18n';
import BrickGrid from './BrickGrid';
import Downloads from './Downloads';
import Footer from './Footer';
import LanguageSwitcher from './LanguageSwitcher';
import LeadForm from './LeadForm';
import PledgeForm from './PledgeForm';

/** Chaque langue a sa racine : / pour le français, /nl et /en pour les autres. */
function homeHrefs(): Record<Locale, string> {
  const hrefs = {} as Record<Locale, string>;
  for (const locale of locales) hrefs[locale] = localePrefix[locale] || '/';
  return hrefs;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line px-5 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-6 text-xl font-semibold sm:text-2xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default function HomePage({ locale }: { locale: Locale }) {
  const copy = t(locale);

  return (
    <>
      <header className="px-5 pt-5 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">{copy.hero.kicker}</p>
          <LanguageSwitcher current={locale} hrefs={homeHrefs()} label={copy.langSwitch} />
        </div>
      </header>

      <main>
        <section className="px-5 pt-10 pb-12 sm:px-8 sm:pt-14 sm:pb-16">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">{copy.hero.title}</h1>
            <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{copy.hero.lead}</p>
            <div className="mt-10">
              <BrickGrid locale={locale} />
            </div>
          </div>
        </section>

        <Section title={copy.mechanism.title}>
          <ol className="space-y-3">
            {copy.mechanism.items.map((item, index) => (
              <li key={item} className="flex gap-4">
                <span className="w-5 shrink-0 pt-0.5 text-sm font-semibold text-gold">
                  {index + 1}
                </span>
                <span className="text-base sm:text-lg">{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-l-2 border-gold-dim pl-4 text-sm text-muted">
            {copy.mechanism.note}
          </p>
        </Section>

        <Section title={copy.pledge.title}>
          <p className="mb-8 text-muted">{copy.pledge.intro}</p>
          <PledgeForm locale={locale} />
        </Section>

        <Section title={copy.lead.title}>
          <p className="mb-8 text-muted">{copy.lead.intro}</p>
          <LeadForm locale={locale} />
        </Section>

        <Section title={copy.downloads.title}>
          <Downloads locale={locale} />
        </Section>

        <Section title={copy.limits.title}>
          <p className="text-muted">{copy.limits.intro}</p>
          <ul className="mt-6 space-y-5">
            {copy.limits.items.map((item) => (
              <li key={item.period}>
                <p className="text-sm font-semibold text-gold">{item.period}</p>
                <p className="mt-1">{item.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 border-l-2 border-gold-dim pl-4 text-sm text-muted">
            {copy.limits.note}
          </p>
        </Section>
      </main>

      <Footer locale={locale} />
    </>
  );
}
