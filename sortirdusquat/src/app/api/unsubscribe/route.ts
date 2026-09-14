import { NextResponse } from 'next/server';
import { deleteByToken } from '@/lib/supabase';
import { clean } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Suppression déclenchée par le bouton de la page /unsubscribe/[token].
 * Aucune authentification : le jeton, opaque et propre à l'enregistrement,
 * fait office de preuve. Le passage par un POST évite que les scanners de
 * liens des clients mail suppriment la ligne à la place du destinataire.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const token = clean(form.get('token'), 120);
  const redirectTo = clean(form.get('redirect'), 200) || '/unsubscribe';

  if (!token) {
    return NextResponse.redirect(new URL(`${redirectTo}?state=absent`, request.url), 303);
  }

  try {
    const deleted = await deleteByToken(token);
    const state = deleted ? 'supprime' : 'absent';
    return NextResponse.redirect(new URL(`${redirectTo}?state=${state}`, request.url), 303);
  } catch (error) {
    console.error('Suppression impossible :', error);
    return NextResponse.redirect(new URL(`${redirectTo}?state=absent`, request.url), 303);
  }
}
