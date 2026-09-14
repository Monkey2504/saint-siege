'use client';

import { useState } from 'react';
import { leadKinds, t, type Locale } from '@/lib/i18n';
import { Checkbox, Honeypot, Label, Select, SubmitButton, TextArea, TextField } from './fields';

export default function LeadForm({ locale }: { locale: Locale }) {
  const copy = t(locale).lead;
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/lead', { method: 'POST', body: new FormData(form) });
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
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative space-y-5">
      <Honeypot />
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-name">{copy.name}</Label>
          <TextField id="lead-name" name="name" required autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="lead-email">{copy.email}</Label>
          <TextField id="lead-email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>

      <div>
        <Label htmlFor="lead-kind">{copy.kind}</Label>
        <Select id="lead-kind" name="kind" required defaultValue="">
          <option value="" disabled>
            {copy.kindPlaceholder}
          </option>
          {leadKinds.map((kind) => (
            <option key={kind} value={kind}>
              {copy.kinds[kind]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="lead-description">{copy.description}</Label>
        <TextArea id="lead-description" name="description" required />
      </div>

      <Checkbox id="lead-consent" name="consent">
        {copy.consent}
      </Checkbox>

      {error ? (
        <p role="alert" className="text-sm text-[#f0a6a6]">
          {error}
        </p>
      ) : null}

      <SubmitButton pending={pending} label={copy.submit} pendingLabel={copy.sending} />
    </form>
  );
}
