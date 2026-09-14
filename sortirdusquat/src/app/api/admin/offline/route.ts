import { NextResponse } from 'next/server';
import { isSignedIn } from '@/lib/admin';
import { setOfflinePledges } from '@/lib/supabase';
import { clean } from '@/lib/validation';

export const runtime = 'nodejs';

/** Correction manuelle : les engagements pris en réunion, hors du site. */
export async function POST(request: Request) {
  if (!(await isSignedIn())) {
    return NextResponse.redirect(new URL('/admin', request.url), 303);
  }

  const form = await request.formData();
  const value = Number(clean(form.get('offline_pledges'), 10));

  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    return NextResponse.redirect(new URL('/admin?error=offline', request.url), 303);
  }

  try {
    await setOfflinePledges(value);
  } catch (error) {
    console.error('Correction manuelle refusée :', error);
    return NextResponse.redirect(new URL('/admin?error=server', request.url), 303);
  }

  return NextResponse.redirect(new URL('/admin?saved=1', request.url), 303);
}
