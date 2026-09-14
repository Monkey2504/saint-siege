import { NextResponse } from 'next/server';
import { RETENTION_MONTHS } from '@/lib/config';
import { isConfigured, purgeOlderThan } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Purge quotidienne : tout enregistrement dépassant la durée de conservation
 * annoncée dans la politique de confidentialité disparaît. Appelée par le cron
 * Vercel, qui présente l'en-tête Authorization construit à partir de CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: 'database' }, { status: 503 });
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  try {
    const deleted = await purgeOlderThan(cutoff.toISOString());
    return NextResponse.json({ ok: true, cutoff: cutoff.toISOString(), deleted });
  } catch (error) {
    console.error('Purge impossible :', error);
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }
}
