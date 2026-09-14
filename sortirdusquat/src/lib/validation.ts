export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 200;
}

/** Nettoie une valeur de formulaire et la borne en longueur. */
export function clean(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}
