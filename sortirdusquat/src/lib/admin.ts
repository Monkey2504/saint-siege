import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Authentification par mot de passe unique, sans système de comptes. Le cookie
 * ne porte pas le mot de passe mais une empreinte HMAC, et la comparaison est
 * à temps constant.
 */

export const ADMIN_COOKIE = 'sds_admin';

function password(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

function fingerprint(): string {
  const secret = process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD || '';
  return createHmac('sha256', secret).update('sds-admin-v1').digest('hex');
}

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: string): boolean {
  const expected = password();
  if (!expected) return false;
  return equals(candidate, expected);
}

export function sessionValue(): string {
  return fingerprint();
}

export async function isSignedIn(): Promise<boolean> {
  if (!password()) return false;
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  return equals(value, fingerprint());
}

/** Échappe une valeur pour un fichier CSV lu par un tableur. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  // BOM : Excel ouvre alors l'UTF-8 sans abîmer les accents.
  return `﻿${lines.join('\n')}\n`;
}
