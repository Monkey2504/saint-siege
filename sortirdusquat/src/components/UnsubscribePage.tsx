import Link from 'next/link';
import { localePrefix, t, type Locale } from '@/lib/i18n';
import Footer from './Footer';

export default function UnsubscribePage({
  locale,
  token,
  state,
}: {
  locale: Locale;
  token: string;
  state?: string;
}) {
  const copy = t(locale).unsubscribe;
  const home = localePrefix[locale] || '/';
  const selfPath = `${localePrefix[locale]}/unsubscribe/${encodeURIComponent(token)}`;

  return (
    <>
      <main className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-xl">
          <h1 className="text-2xl font-semibold sm:text-3xl">{copy.title}</h1>

          {state === 'supprime' ? (
            <p className="mt-6 text-paper/90">{copy.done}</p>
          ) : state === 'absent' ? (
            <p className="mt-6 text-paper/90">{copy.notFound}</p>
          ) : (
            <form action="/api/unsubscribe" method="post" className="mt-6 space-y-6">
              <p className="text-paper/90">{copy.intro}</p>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="redirect" value={selfPath} />
              <button
                type="submit"
                className="rounded-sm bg-gold px-5 py-3 font-semibold text-ink"
              >
                {copy.confirm}
              </button>
            </form>
          )}

          <p className="mt-10">
            <Link href={home} className="text-gold underline underline-offset-4">
              {copy.back}
            </Link>
          </p>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
