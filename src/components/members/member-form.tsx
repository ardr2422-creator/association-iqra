"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { saveMember } from "@/app/(app)/adherents/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FIELD_CLASSES } from "@/components/ui/field";
import { Field, FormAlert, Spinner } from "@/components/ui/form";
import { toParisIsoDay } from "@/lib/format";

/** Ce que le formulaire sait modifier d'un adhérent existant. */
export type MemberFormValues = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  joinedDay: string;
};

type MemberFormProps = {
  /** Adhérent à modifier ; absent pour une création. */
  member?: MemberFormValues;
  /** Jour d'aujourd'hui (Paris) : valeur proposée et date maximale d'adhésion. */
  today: string;
  onDone: () => void;
};

/**
 * Formulaire de création / modification d'un adhérent, à placer dans une
 * fenêtre `Dialog`. La validation est faite par le serveur (`saveMember`) :
 * ses messages s'affichent sous chaque champ.
 */
export function MemberForm({ member, today, onDone }: MemberFormProps) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [address, setAddress] = useState(member?.address ?? "");
  const [joinedDay, setJoinedDay] = useState(member?.joinedDay ?? today);
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Après un refus, le premier champ à corriger reçoit le focus.
  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  const submit = () => {
    if (pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveMember({ id: member?.id, name, phone, email, address, notes, joinedDay });
      if (result.ok) {
        onDone();
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      setError(result.message);
    });
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-5 flex flex-col gap-5"
    >
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <Field label="Nom de la famille ou de l'adhérent" error={fieldErrors.name} className="sm:col-span-2">
          {(control) => (
            <input
              {...control}
              type="text"
              name="name"
              required
              data-autofocus
              maxLength={80}
              autoComplete="off"
              placeholder="Ex. Famille Benali"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={FIELD_CLASSES}
            />
          )}
        </Field>
        <Field label="Téléphone" error={fieldErrors.phone}>
          {(control) => (
            <input
              {...control}
              type="tel"
              name="phone"
              maxLength={30}
              autoComplete="off"
              placeholder="06 00 00 00 00"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={FIELD_CLASSES}
            />
          )}
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          {(control) => (
            <input
              {...control}
              type="email"
              name="email"
              maxLength={120}
              autoComplete="off"
              placeholder="famille@exemple.fr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_CLASSES}
            />
          )}
        </Field>
        <Field label="Adresse" error={fieldErrors.address} className="sm:col-span-2">
          {(control) => (
            <textarea
              {...control}
              name="address"
              rows={2}
              maxLength={200}
              autoComplete="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={`${FIELD_CLASSES} resize-none`}
            />
          )}
        </Field>
        <Field label="Date d'adhésion" error={fieldErrors.joinedDay}>
          {(control) => (
            <input
              {...control}
              type="date"
              name="joinedDay"
              max={today}
              value={joinedDay}
              onChange={(event) => setJoinedDay(event.target.value)}
              className={FIELD_CLASSES}
            />
          )}
        </Field>
        <Field
          label="Notes"
          error={fieldErrors.notes}
          hint="Visibles uniquement sur la fiche de l'adhérent."
          className="sm:col-span-2"
        >
          {(control) => (
            <textarea
              {...control}
              name="notes"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${FIELD_CLASSES} resize-none`}
            />
          )}
        </Field>
      </div>

      <FormAlert message={error} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          {member ? "Enregistrer" : "Ajouter l'adhérent"}
        </Button>
      </div>
    </form>
  );
}

type NewMemberButtonProps = {
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  children?: ReactNode;
};

/** Bouton « + Adhérent » et sa fenêtre de création. */
export function NewMemberButton({ variant, size, children = "+ Adhérent" }: NewMemberButtonProps) {
  // Le formulaire est conservé pendant l'animation de fermeture ; `instance`
  // le remet à zéro à chaque ouverture.
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const [today, setToday] = useState<string | null>(null);

  const show = () => {
    // Lu au moment du clic (jamais pendant le rendu) : la date proposée est celle du jour à Paris.
    setToday(toParisIsoDay(new Date()));
    setInstance((value) => value + 1);
    setOpen(true);
  };
  const close = () => setOpen(false);

  return (
    <>
      {/* `min-h-10` : zone de toucher de 40px, même en petite taille. */}
      <Button variant={variant} size={size} className="min-h-10" onClick={show}>
        {children}
      </Button>
      <Dialog open={open} onClose={close} title="Nouvel adhérent" size="lg">
        {today ? <MemberForm key={instance} today={today} onDone={close} /> : null}
      </Dialog>
    </>
  );
}
