"use client";

import { useState, useTransition, type ReactNode } from "react";
import { cashInstallment, rejectInstallment, replanInstallment } from "@/app/(app)/cheques/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FIELD_CLASSES } from "@/components/ui/field";
import { Field, FormAlert, Spinner } from "@/components/ui/form";
import { formatDayWithYear, formatEuros } from "@/lib/format";
import { installmentLabel } from "@/lib/payments";
import { receiptPdfHref } from "@/lib/routes";
import type { InstallmentView, ReceiptRef } from "@/lib/views";

type Kind = "cash" | "edit" | "reject";
type Content = { kind: Kind; installment: InstallmentView };

/**
 * Les trois gestes possibles sur une échéance — marquer comme encaissée,
 * modifier (ou remettre à encaisser un chèque rejeté), marquer comme rejetée —
 * avec leurs fenêtres de confirmation. Partagé par la fiche adhérent, la page
 * Chèques et le calendrier.
 *
 *   const actions = useInstallmentActions(today);
 *   <Button onClick={() => actions.cash(installment)}>Marquer comme encaissé</Button>
 *   {actions.dialogs}   // à rendre une seule fois dans le composant
 */
export function useInstallmentActions(today: string): {
  cash: (installment: InstallmentView) => void;
  edit: (installment: InstallmentView) => void;
  reject: (installment: InstallmentView) => void;
  dialogs: ReactNode;
} {
  // Le contenu est conservé pendant l'animation de fermeture ; `instance`
  // remet la fenêtre à zéro à chaque ouverture.
  const [content, setContent] = useState<Content | null>(null);
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  const show = (kind: Kind, installment: InstallmentView) => {
    setContent({ kind, installment });
    setInstance((value) => value + 1);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const title = !content
    ? ""
    : content.kind === "cash"
      ? "Marquer comme encaissé"
      : content.kind === "reject"
        ? "Marquer comme rejeté"
        : content.installment.status === "REJECTED"
          ? "Remettre à encaisser"
          : "Modifier l'échéance";

  const dialogs = (
    <Dialog open={open} onClose={close} title={title}>
      {content?.kind === "cash" ? (
        <CashForm key={instance} installment={content.installment} today={today} onDone={close} />
      ) : null}
      {content?.kind === "edit" ? (
        <EditForm key={instance} installment={content.installment} onDone={close} />
      ) : null}
      {content?.kind === "reject" ? (
        <RejectConfirmation key={instance} installment={content.installment} onDone={close} />
      ) : null}
    </Dialog>
  );

  return {
    cash: (installment) => show("cash", installment),
    edit: (installment) => show("edit", installment),
    reject: (installment) => show("reject", installment),
    dialogs,
  };
}

/** Rappel de l'échéance concernée, en tête de chaque fenêtre. */
function Summary({ installment }: { installment: InstallmentView }) {
  const cheque = [
    installment.chequeNumber ? `n° ${installment.chequeNumber}` : null,
    installment.bank,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center justify-between gap-4 rounded-field bg-page px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium leading-snug">{installment.memberName}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          {installmentLabel(installment.method, installment.number, installment.count)} · {installment.planLabel}
          {cheque ? ` · ${cheque}` : ""}
        </p>
      </div>
      <p className="shrink-0 text-[17px] font-semibold">{formatEuros(installment.amountCents)}</p>
    </div>
  );
}

function CashForm({ installment, today, onDone }: { installment: InstallmentView; today: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRef | null>(null);

  const submit = () => {
    if (pending) return;
    setError(null);
    setDayError(null);
    startTransition(async () => {
      const result = await cashInstallment({ id: installment.id, day });
      if (result.ok) setReceipt(result.receipt);
      else if (result.fieldErrors?.day) setDayError(result.fieldErrors.day);
      else setError(result.message);
    });
  };

  if (receipt) {
    return (
      <div className="mt-4 flex flex-col gap-5">
        <p role="status" className="animate-fade rounded-field bg-income-soft px-4 py-3 text-[15px] text-income-strong">
          Encaissement enregistré. Le reçu n° {receipt.number} a été créé.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onDone}>
            Fermer
          </Button>
          <a
            href={receiptPdfHref(receipt.id)}
            target="_blank"
            rel="noopener"
            data-autofocus
            className={buttonClasses("primary")}
          >
            Ouvrir le reçu (PDF)
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-4 flex flex-col gap-5"
    >
      <Summary installment={installment} />
      <Field
        label="Date d'encaissement"
        error={dayError}
        hint={`Échéance prévue le ${formatDayWithYear(installment.dueDay)}. Le montant entre dans le solde à cette date.`}
      >
        {(control) => (
          <input
            {...control}
            type="date"
            name="day"
            required
            max={today}
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className={FIELD_CLASSES}
          />
        )}
      </Field>
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" aria-disabled={pending} data-autofocus>
          {pending ? <Spinner /> : null}
          Encaisser et créer le reçu
        </Button>
      </div>
    </form>
  );
}

function EditForm({ installment, onDone }: { installment: InstallmentView; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [dueDay, setDueDay] = useState(installment.dueDay);
  const [chequeNumber, setChequeNumber] = useState(installment.chequeNumber ?? "");
  const [bank, setBank] = useState(installment.bank ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const rejected = installment.status === "REJECTED";
  const cheque = installment.method === "CHEQUE";

  const submit = () => {
    if (pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await replanInstallment({ id: installment.id, dueDay, chequeNumber, bank });
      if (result.ok) onDone();
      else if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      else setError(result.message);
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-4 flex flex-col gap-5"
    >
      <Summary installment={installment} />
      {rejected ? (
        <p className="text-[15px] text-muted">
          Saisissez la nouvelle date{cheque ? " et le chèque de remplacement" : ""} : l&apos;échéance
          redevient « à encaisser ».
        </p>
      ) : null}
      <Field label="Date prévue" error={fieldErrors.dueDay}>
        {(control) => (
          <input
            {...control}
            type="date"
            name="dueDay"
            required
            data-autofocus
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            className={FIELD_CLASSES}
          />
        )}
      </Field>
      {cheque ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="N° du chèque" error={fieldErrors.chequeNumber}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="chequeNumber"
                inputMode="numeric"
                autoComplete="off"
                maxLength={30}
                value={chequeNumber}
                onChange={(event) => setChequeNumber(event.target.value)}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
          <Field label="Banque" error={fieldErrors.bank}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="bank"
                autoComplete="off"
                maxLength={60}
                value={bank}
                onChange={(event) => setBank(event.target.value)}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
        </div>
      ) : null}
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          {rejected ? "Remettre à encaisser" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

function RejectConfirmation({ installment, onDone }: { installment: InstallmentView; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectInstallment(installment.id);
      if (result.ok) onDone();
      else setError(result.message);
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <Summary installment={installment} />
      <p className="text-[15px] text-muted">
        {installment.status === "CASHED" ? (
          <>
            Ce versement était encaissé : son mouvement sera{" "}
            <strong className="font-medium text-ink">annulé et retiré du solde</strong>. Il reste
            visible dans l&apos;historique, et son reçu est marqué « annulé ».
          </>
        ) : (
          <>
            Le versement sera marqué comme <strong className="font-medium text-ink">rejeté</strong>.
            Vous pourrez ensuite le remettre à encaisser avec un chèque de remplacement.
          </>
        )}
      </p>
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} data-autofocus>
          Annuler
        </Button>
        <Button onClick={confirm} aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          Marquer comme rejeté
        </Button>
      </div>
    </div>
  );
}
