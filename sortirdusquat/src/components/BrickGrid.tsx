import { TOTAL_BRICKS, t, type Locale } from '@/lib/i18n';
import { pledgeCount } from '@/lib/supabase';

/**
 * Grille des 120 briques : 12 colonnes sur 10 lignes, lisible à l'œil sur
 * 380 px de large. Composant serveur, il lit le compte réel en base à chaque
 * requête.
 */
export default async function BrickGrid({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const { total, available } = await pledgeCount();
  // APERCU
  const filled = Math.min(total, TOTAL_BRICKS);
  const remaining = TOTAL_BRICKS - filled;

  return (
    <div>
      <ul
        aria-label={copy.hero.gridLabel}
        className="grid grid-cols-12 gap-[3px] sm:gap-1.5"
      >
        {Array.from({ length: TOTAL_BRICKS }, (_, index) => {
          const isFilled = index < filled;
          return (
            <li
              key={index}
              title={isFilled ? copy.hero.brickFilled : copy.hero.brickEmpty}
              className={
                isFilled
                  ? 'aspect-square rounded-[3px] bg-gold sm:rounded-sm'
                  : 'aspect-square rounded-[3px] border border-line bg-raised sm:rounded-sm'
              }
            />
          );
        })}
      </ul>

      <p className="mt-4 text-sm text-muted sm:text-base">
        {!available || filled === 0 ? (
          copy.hero.empty
        ) : (
          <>
            <span className="font-semibold text-paper">
              {copy.hero.countLine(filled, TOTAL_BRICKS)}
            </span>
            {remaining > 0 ? <> · {copy.hero.missing(remaining)}</> : <> · {copy.hero.complete}</>}
          </>
        )}
      </p>
    </div>
  );
}
