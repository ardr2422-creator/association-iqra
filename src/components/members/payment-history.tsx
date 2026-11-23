"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ReceiptIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { yearOf } from "@/lib/days";
import { formatDay, formatDayWithYear, formatSignedEuros } from "@/lib/format";
import { receiptPdfHref } from "@/lib/routes";
import type { TransactionView } from "@/lib/views";

const ROW_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

type PaymentHistoryProps = {
  payments: TransactionView[];
  /** Année en cours : les dates des autres années sont écrites avec leur année. */
  year: number;
  /** Bouton proposé quand l'historique est vide. */
  emptyAction?: ReactNode;
  className?: string;
};

/** Carte « Historique des paiements » : une ligne par encaissement, avec son reçu. */
export function PaymentHistory({ payments, year, emptyAction, className }: PaymentHistoryProps) {
  // Cascade d'arrivée pour les lignes présentes à l'ouverture ; une ligne ajoutée
  // ensuite (chèque encaissé depuis la fiche) se déplie simplement.
  const [initialIds] = useState(() => new Set(payments.map((payment) => payment.id)));

  return (
    <Card as="section" aria-label="Historique des paiements" className={className}>
      <CardTitle className="mb-2">Historique des paiements</CardTitle>
      {payments.length === 0 ? (
        <div className="border-t border-divider">
          <EmptyState
            icon={ReceiptIcon}
            title="Aucun paiement enregistré"
            description="Dès le premier encaissement, il apparaît ici avec son reçu, prêt à être téléchargé."
            action={emptyAction}
          />
        </div>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {payments.map((payment, index) => (
              <motion.li
                key={payment.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={ROW_TRANSITION}
                className="-mx-2 overflow-hidden px-2"
              >
                <PaymentRow
                  payment={payment}
                  year={year}
                  cascadeIndex={initialIds.has(payment.id) ? Math.min(index, 12) : null}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

function PaymentRow({
  payment,
  year,
  cascadeIndex,
}: {
  payment: TransactionView;
  year: number;
  cascadeIndex: number | null;
}) {
  const day = yearOf(payment.day) === year ? formatDay(payment.day) : formatDayWithYear(payment.day);
  return (
    <div
      style={
        cascadeIndex === null
          ? undefined
          : ({ "--i": cascadeIndex, "--stagger-base": "420ms" } as CSSProperties)
      }
      className={clsx(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-divider py-4 sm:flex",
        cascadeIndex !== null && "animate-rise stagger-i",
      )}
    >
      {/* Sur téléphone, le moyen de paiement passe sur la ligne de la date. */}
      <span className="order-3 text-[13px] text-muted sm:order-none sm:w-[92px] sm:shrink-0 sm:text-base">
        {day}
        <span className="sm:hidden"> · {payment.methodLabel}</span>
      </span>
      <span className="order-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 sm:order-none sm:flex-1">
        <span className={clsx("min-w-0 [overflow-wrap:anywhere]", payment.cancelled && "text-muted")}>
          {payment.label}
          <span className="max-sm:hidden"> · {payment.methodLabel}</span>
        </span>
        {payment.cancelled ? <Badge tone="neutral">Annulé</Badge> : null}
      </span>
      <span
        className={clsx(
          "order-2 whitespace-nowrap text-right font-semibold tabular-nums sm:order-none",
          payment.cancelled ? "text-faint line-through" : "text-income",
        )}
      >
        {formatSignedEuros(payment.amountCents)}
        {payment.cancelled ? <span className="sr-only"> (annulé)</span> : null}
      </span>
      <span className="order-4 text-right sm:order-none sm:w-[72px] sm:shrink-0">
        {payment.receipt ? (
          <a
            href={receiptPdfHref(payment.receipt.id)}
            target="_blank"
            rel="noopener"
            className="-my-2.5 inline-flex min-h-10 items-center whitespace-nowrap text-sm"
          >
            Reçu PDF<span className="sr-only"> n° {payment.receipt.number} (nouvel onglet)</span>
          </a>
        ) : (
          <span className="text-sm text-faint">—</span>
        )}
      </span>
    </div>
  );
}
