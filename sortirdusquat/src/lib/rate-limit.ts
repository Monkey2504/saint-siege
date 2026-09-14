import 'server-only';

/**
 * Limitation de débit par IP, en mémoire. Suffisant contre le remplissage
 * automatique de formulaires : un robot qui change d'IP à chaque envoi se
 * heurte encore au honeypot. Le compteur vit dans l'instance, il repart à zéro
 * au redéploiement — c'est assumé, on ne veut pas d'un service tiers pour ça.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'inconnu';
}

export function tooManyRequests(ip: string): boolean {
  const now = Date.now();

  // Nettoyage opportuniste des fenêtres expirées.
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }

  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}
