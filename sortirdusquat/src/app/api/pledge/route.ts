import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { sendConfirmation } from '@/lib/email';
import { defaultLocale, isLocale } from '@/lib/i18n';
import { clientIp, tooManyRequests } from '@/lib/rate-limit';
import { insert } from '@/lib/supabase';
import { clean, isEmail } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (tooManyRequests(ip)) {
    return NextResponse.json({ error: 'rate' }, { status: 429 });
  }

  const form = await request.formData();

  // Honeypot : un robot remplit tout, un humain ne voit pas ce champ.
  if (clean(form.get('website'), 200) !== '') {
    return NextResponse.json({ ok: true });
  }

  const name = clean(form.get('name'), 120);
  const email = clean(form.get('email'), 200).toLowerCase();
  const phone = clean(form.get('phone'), 40);
  const message = clean(form.get('message'), 2000);
  const rawLocale = clean(form.get('contact_locale'), 5);
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const commitment = form.get('commitment') !== null;
  const consent = form.get('consent') !== null;

  if (!name || !email || !commitment || !consent) {
    return NextResponse.json({ error: 'required' }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'email' }, { status: 400 });
  }

  const token = randomBytes(24).toString('base64url');

  try {
    await insert('pledges', {
      name,
      email,
      phone: phone || null,
      message: message || null,
      locale,
      consent_at: new Date().toISOString(),
      unsubscribe_token: token,
    });
  } catch (error) {
    console.error('Engagement non enregistré :', error);
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }

  await sendConfirmation({ to: email, name, locale, kind: 'pledge', token });

  return NextResponse.json({ ok: true });
}
