'use client';

import { useState } from 'react';
import { locales, localeName, t, type Locale } from '@/lib/i18n';
import { Checkbox, Honeypot, Label, Select, SubmitButton, TextArea, TextField } from './fields';

export default function PledgeForm({ locale }: { locale: Locale }) {
  const copy = t(locale).pledge;
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/pledge', { method: 'POST', body: new FormData(form) });
      if (res.ok) {
        setDone(true);
        form.reset();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === 'rate'
            ? copy.errorRate
            : body.error === 'required'
              ? copy.errorRequired
              : body.error === 'email'
                ? copy.errorEmail
                : copy.errorGeneric,
        );
      }
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-sm border border-gold/50 bg-raised p-5">
        <p className="font-semibold text-gold">{copy.success}</p>
        <p className="mt-2 text-sm text-muted">{copy.successNote}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate={false} className="relative space-y-5">
      <Honeypot />

      <div>
        <Label htmlFor="pledge-name">{copy.name}</Label>
        <TextField id="pledge-name" name="name" required autoComplete="name" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="pledge-email">{copy.email}</Label>
          <TextField id="pledge-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="pledge-phone" hint={copy.phoneOptional}>
            {copy.phone}
          </Label>
          <TextField id="pledge-phone" name="phone" type="tel" autoComplete="tel" />
        </div>
      </div>

      <div>
        <Label htmlFor="pledge-lang">{copy.contactLang}</Label>
        <Select id="pledge-lang" name="contact_locale" defaultValue={locale}>
          {locales.map((code) => (
            <option key={code} value={code}>
              {localeName[code]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="pledge-message" hint={copy.messageOptional}>
          {copy.message}
        </Label>
        <TextArea id="pledge-message" name="message" />
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <Checkbox id="pledge-commitment" name="commitment">
          {copy.commitment}
        </Checkbox>
        <Checkbox id="pledge-consent" name="consent">
          {copy.consent}
        </Checkbox>
      </div>

      <p className="text-base font-semibold text-gold">{copy.notice}</p>

      {error ? (
        <p role="alert" className="text-sm text-[#f0a6a6]">
          {error}
        </p>
      ) : null}

      <SubmitButton pending={pending} label={copy.submit} pendingLabel={copy.sending} />
    </form>
  );
}
