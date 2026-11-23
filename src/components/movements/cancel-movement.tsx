"use client";

import { useState, useTransition } from "react";
import { cancelTransaction } from "@/app/(app)/mouvements/actions";
import { Button } from "@/components/ui/button";
import { FormAlert, Spinner } from "@/components/ui/form";
import { formatDayWithYear, formatSignedEuros } from "@/lib/format";
import type { TransactionView } from "@/lib/views";

/** « Chèque 2/4 » → versement d'un paiement en plusieurs fois. */
const INSTALLMENT_OF_MANY = /\d\/\d$/;

/**
 * Confirmation avant d'annuler un mouvement. Rien n'est effacé : on explique
 * ce qui change (solde, échéancier, reçu) avant de valider.
 */
export function CancelMovement({
  transaction,
  onKeep,
  onCancelled,
}: {
  transaction: TransactionView;
  /** Fermer sans rien changer. */
  onKeep: () => void;
  /** Le mouvement vient d'être annulé. */
  onCancelled: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const income = transaction.type === "INCOME";
  const ofMany = income && INSTALLMENT_OF_MANY.test(transaction.methodLabel);
  const signed = income ? transaction.amountCents : -transaction.amountCents;

  const confirm = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelTransaction(transaction.id);
      if (result.ok) onCancelled();
      else setError(result.message);
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 rounded-field bg-page px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium leading-snug">{transaction.who}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {formatDayWithYear(transaction.day)} · {transaction.categoryName} · {transaction.methodLabel}
          </p>
        </div>
        <p className={`shrink-0 text-[17px] font-semibold tabular-nums ${income ? "text-income" : "text-accent"}`}>
          {formatSignedEuros(signed)}
        </p>
      </div>

      <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] text-muted marker:text-faint">
        <li>
          Le mouvement reste visible dans l&apos;historique, <strong className="font-medium text-ink">barré</strong>,
          mais il est <strong className="font-medium text-ink">retiré du solde</strong>.
        </li>
        {ofMany ? (
          <li>
            Ce versement ({transaction.methodLabel.toLowerCase()}) redevient{" "}
            <strong className="font-medium text-ink">«&nbsp;prévu&nbsp;»</strong> dans l&apos;échéancier de l&apos;adhérent :
            vous pourrez l&apos;encaisser à nouveau.
          </li>
        ) : income && transaction.memberId ? (
          <li>Le paiement est retiré de la fiche de l&apos;adhérent.</li>
        ) : null}
        {transaction.receipt ? (
          <li>
            Le reçu n° {transaction.receipt.number} est conservé et marqué{" "}
            <strong className="font-medium text-ink">«&nbsp;annulé&nbsp;»</strong>.
          </li>
        ) : null}
        <li>Cette annulation est définitive : pour corriger une erreur, enregistrez ensuite le bon mouvement.</li>
      </ul>

      <FormAlert message={error} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onKeep} data-autofocus>
          Conserver
        </Button>
        <Button onClick={confirm} aria-disabled={pending} className="whitespace-nowrap">
          {pending ? <Spinner /> : null}
          Annuler le mouvement
        </Button>
      </div>
    </div>
  );
}
