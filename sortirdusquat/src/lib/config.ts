/** Coordonnées du porteur de projet, surchargeables sans toucher au code. */
export const org = {
  name: 'Ballal ASBL',
  city: 'Molenbeek-Saint-Jean, Bruxelles',
  /** Numéro d'entreprise BCE. À renseigner via la variable d'environnement. */
  companyNumber: process.env.NEXT_PUBLIC_COMPANY_NUMBER ?? '',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'fhzegert@gmail.com',
};

/** URL publique du site, utilisée dans les emails (lien de désinscription). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** Durée de conservation des enregistrements, en mois. */
export const RETENTION_MONTHS = 24;
