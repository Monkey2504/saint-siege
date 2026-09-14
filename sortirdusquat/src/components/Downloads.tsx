import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { locales, localeName, t, type Locale } from '@/lib/i18n';

/**
 * Liste les dossiers réellement déposés dans /public/dossier. On n'affiche
 * jamais un lien vers un fichier absent : tant qu'une traduction n'est pas
 * là, elle n'apparaît pas.
 */
async function availableFiles(): Promise<{ locale: Locale; href: string; size: string }[]> {
  const dir = path.join(process.cwd(), 'public', 'dossier');
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const found: { locale: Locale; href: string; size: string }[] = [];
  for (const locale of locales) {
    const file = `sortir-du-squat-${locale}.pdf`;
    if (!entries.includes(file)) continue;
    const { size } = await stat(path.join(dir, file));
    found.push({
      locale,
      href: `/dossier/${file}`,
      size: `${Math.max(1, Math.round(size / 1024 / 1024 * 10) / 10)} Mo`,
    });
  }
  return found;
}

export default async function Downloads({ locale }: { locale: Locale }) {
  const copy = t(locale).downloads;
  const files = await availableFiles();

  return (
    <div>
      <p className="text-muted">{copy.intro}</p>
      {files.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{copy.missing}</p>
      ) : (
        <ul className="mt-5 flex flex-wrap gap-3">
          {files.map((file) => (
            <li key={file.locale}>
              <a
                href={file.href}
                download
                hrefLang={file.locale}
                className="inline-flex items-baseline gap-2 rounded-sm border border-gold/60 px-4 py-2.5 text-gold hover:bg-gold hover:text-ink"
              >
                <span className="font-semibold">{localeName[file.locale]}</span>
                <span className="text-xs opacity-80">
                  {copy.pdf} · {file.size}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
