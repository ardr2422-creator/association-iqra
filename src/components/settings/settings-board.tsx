"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveSettings } from "@/app/(app)/parametres/actions";
import { DemoSection } from "@/components/settings/demo-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FIELD_CLASSES } from "@/components/ui/field";
import { Field, FormAlert, Spinner } from "@/components/ui/form";
import { amountInputValue } from "@/lib/payments";
import type { SettingsView } from "@/lib/views";

/** Solde de départ tel qu'on le saisit : « 1500 », « 1500,50 », « -200 ». */
function balanceText(cents: number): string {
  if (cents === 0) return "";
  return cents < 0 ? `-${amountInputValue(-cents)}` : amountInputValue(cents);
}

export function SettingsBoard({ settings }: { settings: SettingsView }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({
    associationName: settings.associationName,
    address: settings.address ?? "",
    postalCode: settings.postalCode ?? "",
    city: settings.city ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    rna: settings.rna ?? "",
    treasurerName: settings.treasurerName ?? "",
    reminderEmail: settings.reminderEmail ?? "",
    openingBalance: balanceText(settings.openingBalanceCents),
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setSaved(false);
  };

  // Après un refus, le premier champ à corriger reçoit le focus.
  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  const submit = () => {
    if (pending) return;
    setError(null);
    setFieldErrors({});
    setSaved(false);
    startTransition(async () => {
      const result = await saveSettings({ ...values, openingBalance: values.openingBalance.trim() || "0" });
      if (result.ok) setSaved(true);
      else if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        setError(result.message);
      } else setError(result.message);
    });
  };

  const cityLine = [values.postalCode.trim(), values.city.trim()].filter(Boolean).join(" ");
  const contactLine = [values.email.trim(), values.phone.trim()].filter(Boolean).join(" · ");
  const addressLines = [...values.address.split("\n").map((line) => line.trim()), cityLine].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-5"
      >
        <Card as="section" className="animate-rise stagger-1" aria-labelledby="titre-association">
          <CardTitle id="titre-association">L&apos;association</CardTitle>
          <p className="mt-1 text-[15px] text-muted">
            Ces informations sont reprises en tête des prochains reçus. Les reçus déjà émis ne
            changent pas.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l'association" error={fieldErrors.associationName} className="sm:col-span-2">
              {(control) => (
                <input {...control} name="associationName" type="text" required maxLength={80} autoComplete="organization" value={values.associationName} onChange={set("associationName")} className={FIELD_CLASSES} />
              )}
            </Field>
            <Field label="Adresse" error={fieldErrors.address} className="sm:col-span-2">
              {(control) => (
                <textarea {...control} name="address" rows={2} maxLength={200} autoComplete="street-address" value={values.address} onChange={set("address")} className={`${FIELD_CLASSES} resize-y`} />
              )}
            </Field>
            <Field label="Code postal" error={fieldErrors.postalCode}>
              {(control) => (
                <input {...control} name="postalCode" type="text" inputMode="numeric" maxLength={10} autoComplete="postal-code" value={values.postalCode} onChange={set("postalCode")} className={FIELD_CLASSES} />
              )}
            </Field>
            <Field label="Ville" error={fieldErrors.city}>
              {(control) => (
                <input {...control} name="city" type="text" maxLength={60} autoComplete="address-level2" value={values.city} onChange={set("city")} className={FIELD_CLASSES} />
              )}
            </Field>
            <Field label="Email de l'association" error={fieldErrors.email}>
              {(control) => (
                <input {...control} name="email" type="email" maxLength={120} autoComplete="off" value={values.email} onChange={set("email")} className={FIELD_CLASSES} />
              )}
            </Field>
            <Field label="Téléphone" error={fieldErrors.phone}>
              {(control) => (
                <input {...control} name="phone" type="tel" maxLength={30} autoComplete="off" value={values.phone} onChange={set("phone")} className={FIELD_CLASSES} />
              )}
            </Field>
            <Field label="N° RNA" hint="Ex. W691234567" error={fieldErrors.rna}>
              {(control) => (
                <input {...control} name="rna" type="text" maxLength={20} autoComplete="off" value={values.rna} onChange={set("rna")} className={FIELD_CLASSES} />
              )}
            </Field>
            <Field label="Nom du trésorier ou de la trésorière" hint="Imprimé sous la signature des reçus." error={fieldErrors.treasurerName}>
              {(control) => (
                <input {...control} name="treasurerName" type="text" maxLength={80} autoComplete="off" value={values.treasurerName} onChange={set("treasurerName")} className={FIELD_CLASSES} />
              )}
            </Field>
          </div>

          <div className="mt-5 rounded-field border border-line bg-page px-5 py-4" aria-label="Aperçu de l'en-tête des reçus">
            <p className="text-[13px] text-muted">Aperçu de l&apos;en-tête des reçus</p>
            <p className="mt-2 break-words border-b-2 border-accent pb-2 text-[22px] font-semibold leading-tight tracking-[-0.3px] text-accent">
              {values.associationName.trim() || "Nom de l'association"}
            </p>
            <p className="mt-2 break-words text-[13px] leading-relaxed text-nav">
              {addressLines.length === 0 && !contactLine && !values.rna.trim() ? (
                <span className="text-faint">Adresse, email, téléphone et n° RNA apparaîtront ici.</span>
              ) : null}
              {addressLines.map((line, index) => (
                <span key={index} className="block">
                  {line}
                </span>
              ))}
              {contactLine ? <span className="block">{contactLine}</span> : null}
              {values.rna.trim() ? <span className="block">N° RNA : {values.rna.trim()}</span> : null}
            </p>
          </div>
        </Card>

        <Card as="section" className="animate-rise stagger-2" aria-labelledby="titre-solde">
          <CardTitle id="titre-solde">Solde de départ</CardTitle>
          <p className="mt-1 text-[15px] text-muted">
            Le montant en banque et en caisse au moment où vous commencez à utiliser l&apos;application.
            Il s&apos;ajoute aux mouvements saisis pour donner le solde actuel.
          </p>
          <Field label="Montant (en euros)" hint="Exemples : 1500 ou 1 500,50. Laissez vide pour zéro." error={fieldErrors.openingBalance} className="mt-5 max-w-[280px]">
            {(control) => (
              <input {...control} name="openingBalance" type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" value={values.openingBalance} onChange={set("openingBalance")} className={FIELD_CLASSES} />
            )}
          </Field>
        </Card>

        <Card as="section" className="animate-rise stagger-3" aria-labelledby="titre-rappels">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle id="titre-rappels">Rappels de chèques</CardTitle>
            {settings.remindersConfigured ? <Badge tone="income">Activés</Badge> : <Badge tone="amber">Non configurés</Badge>}
          </div>
          <p className="mt-1 text-[15px] text-muted">
            Chaque matin, un email est envoyé s&apos;il y a des chèques à encaisser dans les 3 jours ou
            en retard.
          </p>
          {settings.remindersConfigured ? null : (
            <p className="mt-2 text-sm text-muted">
              L&apos;envoi n&apos;est pas encore activé sur le serveur : il faut y ajouter une clé
              d&apos;envoi (variables <code className="text-ink">RESEND_API_KEY</code> et{" "}
              <code className="text-ink">CRON_SECRET</code>, voir le guide du projet). Vous pouvez déjà
              renseigner l&apos;adresse.
            </p>
          )}
          <Field label="Adresse email des rappels" error={fieldErrors.reminderEmail} className="mt-5 max-w-[420px]">
            {(control) => (
              <input {...control} name="reminderEmail" type="email" maxLength={120} autoComplete="off" value={values.reminderEmail} onChange={set("reminderEmail")} className={FIELD_CLASSES} />
            )}
          </Field>
        </Card>

        <div className="flex flex-col gap-3">
          <FormAlert message={error} />
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" aria-disabled={pending}>
              {pending ? <Spinner /> : null}
              Enregistrer
            </Button>
            <p role="status" className="text-[15px] text-income-strong">
              {saved ? <span className="animate-fade">Paramètres enregistrés.</span> : null}
            </p>
          </div>
        </div>
      </form>

      <Card as="section" className="animate-rise stagger-4" aria-labelledby="titre-fiscal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="titre-fiscal">Reçu fiscal pour les dons</CardTitle>
          <Badge tone="neutral">Bientôt disponible</Badge>
        </div>
        <div className="mt-3 flex items-start gap-4">
          <span
            role="switch"
            aria-checked="false"
            aria-disabled="true"
            aria-labelledby="titre-fiscal"
            className="mt-0.5 flex h-7 w-12 shrink-0 cursor-not-allowed items-center rounded-full bg-neutral-soft p-1 opacity-70"
          >
            <span className="size-5 rounded-full bg-surface shadow-float" />
          </span>
          <p className="text-[15px] text-muted">
            En attente de confirmation par l&apos;association. Pour l&apos;instant, chaque reçu indique :
            « Ce reçu atteste du paiement et ne vaut pas reçu fiscal. »
          </p>
        </div>
      </Card>

      <DemoSection demoMode={settings.demoMode} empty={settings.empty} />
    </div>
  );
}
