"use client";

import { useId, type ReactNode } from "react";
import { AlertIcon } from "@/components/icons";
import { LABEL_CLASSES } from "@/components/ui/field";

/** Petit rond qui tourne, dans un bouton, pendant un envoi. */
export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin-slow rounded-full border-2 border-current/30 border-t-current"
    />
  );
}

/** Message d'erreur général d'un formulaire (annoncé aux lecteurs d'écran). */
export function FormAlert({ message }: { message: string | null | undefined }) {
  return (
    <div role="alert" className="empty:hidden">
      {message ? (
        <p className="flex animate-fade items-start gap-2.5 rounded-field bg-late-soft px-3.5 py-3 text-sm text-accent">
          <AlertIcon size={18} className="mt-px shrink-0" />
          {message}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = {
  label: string;
  /** Texte d'aide discret sous le champ. */
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  /** Reçoit les attributs à poser sur le champ (`id`, `aria-invalid`, `aria-describedby`). */
  children: (control: { id: string; "aria-invalid": true | undefined; "aria-describedby": string | undefined }) => ReactNode;
};

/**
 * Un champ de formulaire : étiquette, champ, aide et message d'erreur reliés
 * pour l'accessibilité.
 *
 *   <Field label="Nom" error={errors.name}>
 *     {(control) => <input {...control} name="name" className={FIELD_CLASSES} />}
 *   </Field>
 */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint ? (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      <div role="alert" id={errorId} className="empty:hidden">
        {error ? <p className="animate-fade text-sm text-accent">{error}</p> : null}
      </div>
    </div>
  );
}
