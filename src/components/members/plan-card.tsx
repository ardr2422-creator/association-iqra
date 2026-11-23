"use client";

import clsx from "clsx";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { daysBetween } from "@/lib/days";
import { formatDay, formatDayWithYear, formatEuros, formatEurosCompact } from "@/lib/format";
import { installmentName, STATE_LABELS, type InstallmentState } from "@/lib/payments";
import { receiptPdfHref } from "@/lib/routes";
import type { InstallmentView, PlanView } from "@/lib/views";

/** Les gestes de `useInstallmentActions` dont l'échéancier a besoin. */
export type InstallmentGestures = {
  cash: (installment: InstallmentView) => void;
  edit: (installment: InstallmentView) => void;
  reject: (installment: InstallmentView) => void;
};

/** Couleurs d'une case de l'échéancier, par statut (jetons des maquettes). */
const STEP_TONES: Record<InstallmentState, { box: string; label: string; amount: string; detail: string }> = {
  CASHED: {
    box: "border-transparent bg-income-soft",
    label: "text-income-strong",
    amount: "text-income-strong",
    detail: "text-income-strong",
  },
  DUE: {
    box: "border-amber-line bg-amber-soft",
    label: "text-amber-strong",
    amount: "text-amber-strong",
    detail: "text-amber-strong",
  },
  PLANNED: {
    box: "border-transparent bg-neutral-soft",
    label: "text-nav",
    amount: "text-ink",
    detail: "text-muted",
  },
  REJECTED: {
    box: "border-transparent bg-late-soft",
    label: "text-accent",
    amount: "text-accent",
    detail: "text-accent",
  },
};

/** Petit bouton-texte sous une case : zone de toucher de 40px, couleur de la case. */
const STEP_ACTION =
  "inline-flex min-h-10 items-center rounded-lg px-1.5 text-left text-xs font-medium leading-tight text-inherit underline decoration-current/35 underline-offset-[3px] @3xl:px-2 @3xl:text-[13px] " +
  "transition-[text-decoration-color,scale] duration-fast ease-soft hover:decoration-current active:scale-[0.96]";

/** « 23 nov. », avec l'année seulement si la date est loin d'aujourd'hui. */
function stepDay(day: string, today: string): string {
  return Math.abs(daysBetween(today, day)) > 180 ? formatDayWithYear(day) : formatDay(day);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("fr") + text.slice(1);
}

function summary(plan: PlanView): string {
  const times = plan.installmentCount > 1 ? `Paiement en ${plan.installmentCount} fois` : "Paiement en une fois";
  const paid = `${formatEurosCompact(plan.paidCents)} ${plan.paidCents >= 200 ? "versés" : "versé"}`;
  return `${times} · ${paid} sur ${formatEurosCompact(plan.totalCents)}`;
}

type PlanCardProps = {
  plan: PlanView;
  today: string;
  gestures: InstallmentGestures;
  /** Demande de suppression du paiement (proposée tant que rien n'est encaissé). */
  onDelete: () => void;
  className?: string;
};

/** Carte « Échéancier » d'un paiement : une case par versement, comme sur la maquette. */
export function PlanCard({ plan, today, gestures, onDelete, className }: PlanCardProps) {
  // Le prochain versement à encaisser : le plus ancien encore « prévu ».
  const next = plan.installments.find((line) => line.status === "PLANNED");
  const settled = plan.remainingCents === 0;

  return (
    <Card as="section" aria-label={`Échéancier · ${plan.label}`} className={clsx("@container", className)}>
      <CardTitle className="mb-1.5">Échéancier · {plan.label}</CardTitle>
      <p className="mb-[22px] text-sm text-muted">{summary(plan)}</p>

      <ol className="grid grid-cols-2 gap-3.5 @3xl:grid-cols-4">
        {plan.installments.map((line) => (
          <Step key={line.id} line={line} planLabel={plan.label} today={today} gestures={gestures} />
        ))}
      </ol>

      {next || settled || plan.cashedCount === 0 ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {next ? (
            <button
              type="button"
              onClick={() => gestures.cash(next)}
              className="inline-flex min-h-11 items-center justify-center rounded-field border border-amber-line bg-surface px-5 py-3 text-left font-medium leading-tight text-amber-strong transition-[background-color,scale] duration-fast ease-soft hover:bg-amber-soft active:scale-[0.97]"
            >
              Marquer le {lowerFirst(installmentName(next.method, next.number))} comme encaissé
            </button>
          ) : settled ? (
            <p className="flex items-center gap-2 text-sm font-medium text-income">
              <CheckIcon size={18} strokeWidth={2.2} />
              Tout est encaissé
            </p>
          ) : (
            <span />
          )}
          {plan.cashedCount === 0 ? (
            <Button variant="ghost" size="sm" className="min-h-10" onClick={onDelete}>
              Supprimer ce paiement
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Step({
  line,
  planLabel,
  today,
  gestures,
}: {
  line: InstallmentView;
  planLabel: string;
  today: string;
  gestures: InstallmentGestures;
}) {
  const tone = STEP_TONES[line.state];
  const name = installmentName(line.method, line.number);
  const day = stepDay(line.status === "CASHED" && line.cashedDay ? line.cashedDay : line.dueDay, today);
  // Précision lue par les lecteurs d'écran : plusieurs échéanciers peuvent se suivre sur la fiche.
  const target = ` le ${lowerFirst(name)} (${planLabel})`;

  return (
    <li className={clsx("flex flex-col rounded-2xl border-2 p-4 @3xl:p-5", tone.box)}>
      <p className={clsx("flex flex-wrap gap-x-1 text-[13px] font-medium leading-snug", tone.label)}>
        <span className="whitespace-nowrap">{name}</span>
        <span aria-hidden="true">·</span>
        <span className="whitespace-nowrap">{line.late ? "En retard" : STATE_LABELS[line.state]}</span>
      </p>
      <p
        className={clsx(
          "mb-0.5 mt-2 whitespace-nowrap text-[19px] font-semibold leading-snug tabular-nums @3xl:text-[22px]",
          tone.amount,
        )}
      >
        {formatEuros(line.amountCents)}
      </p>
      <p className={clsx("flex flex-wrap gap-x-1 text-[13px] leading-snug", tone.detail)}>
        <span className="whitespace-nowrap">{day}</span>
        {line.chequeNumber ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">n° {line.chequeNumber}</span>
          </>
        ) : null}
      </p>

      <div className={clsx("-mx-1.5 -mb-2 mt-auto flex flex-wrap gap-x-0.5 pt-1.5 @3xl:-mx-2 @3xl:gap-x-1", tone.label)}>
        {line.status === "PLANNED" ? (
          <button type="button" className={STEP_ACTION} onClick={() => gestures.edit(line)}>
            Modifier<span className="sr-only">{target}</span>
          </button>
        ) : null}
        {line.status === "CASHED" && line.receipt ? (
          <a href={receiptPdfHref(line.receipt.id)} target="_blank" rel="noopener" className={STEP_ACTION}>
            Reçu<span className="sr-only"> n° {line.receipt.number} (PDF, nouvel onglet)</span>
          </a>
        ) : null}
        {line.status === "REJECTED" ? (
          <button type="button" className={STEP_ACTION} onClick={() => gestures.edit(line)}>
            Remettre à encaisser<span className="sr-only">{target}</span>
          </button>
        ) : (
          <button
            type="button"
            className={STEP_ACTION}
            aria-label={`Marquer comme rejeté${target}`}
            onClick={() => gestures.reject(line)}
          >
            Rejeté
          </button>
        )}
      </div>
    </li>
  );
}
