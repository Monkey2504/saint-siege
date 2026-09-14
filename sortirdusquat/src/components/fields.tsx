'use client';

/** Primitives de formulaire partagées par les deux formulaires. */

const fieldClass =
  'w-full rounded-sm border border-line bg-ink px-3 py-2.5 text-paper placeholder:text-muted/60';

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm text-muted">
      {children}
      {hint ? <span className="text-muted/70"> · {hint}</span> : null}
    </label>
  );
}

export function TextField({
  id,
  name,
  type = 'text',
  required,
  autoComplete,
  defaultValue,
}: {
  id: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
}) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      required={required}
      autoComplete={autoComplete}
      defaultValue={defaultValue}
      className={fieldClass}
    />
  );
}

export function TextArea({ id, name, required }: { id: string; name: string; required?: boolean }) {
  return <textarea id={id} name={name} rows={4} required={required} className={fieldClass} />;
}

export function Select({
  id,
  name,
  required,
  children,
  defaultValue,
}: {
  id: string;
  name: string;
  required?: boolean;
  children: React.ReactNode;
  defaultValue?: string;
}) {
  return (
    <select id={id} name={name} required={required} defaultValue={defaultValue} className={fieldClass}>
      {children}
    </select>
  );
}

export function Checkbox({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        required
        className="mt-1 size-4 shrink-0 accent-[var(--color-gold)]"
      />
      <label htmlFor={id} className="text-sm leading-relaxed text-paper/90">
        {children}
      </label>
    </div>
  );
}

/** Piège à robots : invisible à l'écran, ignoré des lecteurs d'écran. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website-url">Ne pas remplir</label>
      <input id="website-url" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-sm bg-gold px-5 py-3 font-semibold text-ink disabled:opacity-60 sm:w-auto"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
