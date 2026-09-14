import type { Metadata } from 'next';
import { isSignedIn } from '@/lib/admin';
import { TOTAL_BRICKS } from '@/lib/i18n';
import { isConfigured, leadCount, pledgeCount } from '@/lib/supabase';

export const metadata: Metadata = { title: 'Administration', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function LoginForm({ error }: { error?: string }) {
  return (
    <form action="/api/admin/login" method="post" className="mt-8 max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm text-muted">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-sm border border-line bg-ink px-3 py-2.5 text-paper"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[#f0a6a6]">
          {error === 'rate'
            ? 'Trop de tentatives. Réessayez dans quelques minutes.'
            : 'Mot de passe incorrect.'}
        </p>
      ) : null}
      <button type="submit" className="rounded-sm bg-gold px-5 py-3 font-semibold text-ink">
        Entrer
      </button>
    </form>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const signedIn = await isSignedIn();

  if (!signedIn) {
    return (
      <main className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold">Administration</h1>
          {isConfigured() ? null : (
            <p className="mt-4 text-sm text-[#f0c98a]">
              La base de données n’est pas configurée : renseignez SUPABASE_URL et
              SUPABASE_SERVICE_ROLE_KEY.
            </p>
          )}
          <LoginForm error={error} />
        </div>
      </main>
    );
  }

  const [pledges, leads] = await Promise.all([pledgeCount(), leadCount()]);

  return (
    <main className="px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Administration</h1>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="text-sm text-muted underline underline-offset-4">
              Quitter
            </button>
          </form>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-gold">Compteurs</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Engagements en ligne', value: pledges.online },
              { label: 'Engagements hors ligne', value: pledges.offline },
              { label: `Total sur ${TOTAL_BRICKS}`, value: pledges.total },
            ].map((item) => (
              <div key={item.label} className="rounded-sm border border-line bg-raised p-4">
                <dt className="text-sm text-muted">{item.label}</dt>
                <dd className="mt-1 text-3xl font-semibold">{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted">Pistes reçues : {leads}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gold">Engagements pris en réunion</h2>
          <p className="mt-2 text-sm text-muted">
            Ce nombre s’ajoute au compte des engagements enregistrés sur le site.
          </p>
          <form action="/api/admin/offline" method="post" className="mt-4 flex flex-wrap gap-3">
            <input
              type="number"
              name="offline_pledges"
              min={0}
              max={1000}
              defaultValue={pledges.offline}
              required
              aria-label="Engagements hors ligne"
              className="w-32 rounded-sm border border-line bg-ink px-3 py-2.5 text-paper"
            />
            <button type="submit" className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink">
              Enregistrer
            </button>
          </form>
          {saved ? <p className="mt-3 text-sm text-gold">Valeur enregistrée.</p> : null}
          {error === 'offline' ? (
            <p role="alert" className="mt-3 text-sm text-[#f0a6a6]">
              Entrez un entier entre 0 et 1000.
            </p>
          ) : null}
          {error === 'server' ? (
            <p role="alert" className="mt-3 text-sm text-[#f0a6a6]">
              La base de données a refusé l’écriture.
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gold">Export</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="/api/admin/export?table=pledges"
              className="rounded-sm border border-gold/60 px-4 py-2.5 text-gold"
            >
              Engagements (CSV)
            </a>
            <a
              href="/api/admin/export?table=leads"
              className="rounded-sm border border-gold/60 px-4 py-2.5 text-gold"
            >
              Pistes (CSV)
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
