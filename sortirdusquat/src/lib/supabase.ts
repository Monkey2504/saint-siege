import 'server-only';

/**
 * Accès à Supabase par l'API REST, avec la clé de service, côté serveur
 * uniquement. Aucune clé n'atteint le navigateur et la RLS interdit de toute
 * façon toute lecture publique.
 */

function credentials(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

export function isConfigured(): boolean {
  return credentials() !== null;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Laisse passer le cache de Next ; par défaut, aucune mise en cache. */
  revalidate?: number | false;
};

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const creds = credentials();
  if (!creds) throw new Error('Supabase n’est pas configuré.');

  const { method = 'GET', body, headers = {}, revalidate = false } = options;

  return fetch(`${creds.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: revalidate === false ? 'no-store' : undefined,
    next: revalidate === false ? undefined : { revalidate },
  });
}

async function countRows(table: string): Promise<number> {
  const res = await request(`${table}?select=id`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error(`Comptage impossible sur ${table} (${res.status}).`);
  // PostgREST renvoie « 0-0/37 » dans Content-Range.
  const range = res.headers.get('content-range');
  const total = range?.split('/')[1];
  return total && total !== '*' ? Number(total) : 0;
}

/** Valeur entière d'une clé de la table `settings`, 0 si absente. */
async function settingInt(key: string): Promise<number> {
  const res = await request(`settings?key=eq.${encodeURIComponent(key)}&select=value`);
  if (!res.ok) return 0;
  const rows = (await res.json()) as { value: number | string }[];
  if (rows.length === 0) return 0;
  const value = Number(rows[0].value);
  return Number.isFinite(value) ? value : 0;
}

export async function setOfflinePledges(value: number): Promise<void> {
  const res = await request('settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: [{ key: 'offline_pledges', value }],
  });
  if (!res.ok) throw new Error(`Mise à jour impossible (${res.status}).`);
}

export type PledgeCount = {
  online: number;
  offline: number;
  total: number;
  /** Faux quand la base n'est pas joignable : la page affiche alors la grille vide. */
  available: boolean;
};

/**
 * Compte affiché par la grille : engagements en ligne plus la correction
 * manuelle saisie en réunion.
 */
export async function pledgeCount(): Promise<PledgeCount> {
  if (!isConfigured()) return { online: 0, offline: 0, total: 0, available: false };
  try {
    const [online, offline] = await Promise.all([countRows('pledges'), settingInt('offline_pledges')]);
    return { online, offline, total: online + offline, available: true };
  } catch {
    return { online: 0, offline: 0, total: 0, available: false };
  }
}

export async function leadCount(): Promise<number> {
  if (!isConfigured()) return 0;
  try {
    return await countRows('leads');
  } catch {
    return 0;
  }
}

export async function offlinePledges(): Promise<number> {
  if (!isConfigured()) return 0;
  return settingInt('offline_pledges');
}

export async function insert(table: 'pledges' | 'leads', row: Record<string, unknown>): Promise<void> {
  const res = await request(table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: [row],
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Insertion refusée sur ${table} (${res.status}) : ${detail}`);
  }
}

/** Supprime la ligne portant ce jeton, dans l'une ou l'autre table. */
export async function deleteByToken(token: string): Promise<boolean> {
  let deleted = false;
  for (const table of ['pledges', 'leads'] as const) {
    const res = await request(`${table}?unsubscribe_token=eq.${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!res.ok) continue;
    const rows = (await res.json()) as unknown[];
    if (rows.length > 0) deleted = true;
  }
  return deleted;
}

/** Purge des enregistrements dépassant la durée de conservation. */
export async function purgeOlderThan(cutoffIso: string): Promise<{ pledges: number; leads: number }> {
  const result = { pledges: 0, leads: 0 };
  for (const table of ['pledges', 'leads'] as const) {
    const res = await request(`${table}?created_at=lt.${encodeURIComponent(cutoffIso)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!res.ok) throw new Error(`Purge impossible sur ${table} (${res.status}).`);
    const rows = (await res.json()) as unknown[];
    result[table] = rows.length;
  }
  return result;
}

/** Lignes complètes, pour l'export CSV de l'administration. */
export async function allRows(table: 'pledges' | 'leads'): Promise<Record<string, unknown>[]> {
  const res = await request(`${table}?select=*&order=created_at.asc`);
  if (!res.ok) throw new Error(`Lecture impossible sur ${table} (${res.status}).`);
  return (await res.json()) as Record<string, unknown>[];
}
