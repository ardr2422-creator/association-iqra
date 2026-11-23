"use client";

import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { CheckIcon } from "@/components/icons";
import { FIELD_CLASSES, LABEL_CLASSES } from "@/components/ui/field";
import { isIsoDay } from "@/lib/days";
import { formatEuros } from "@/lib/format";
import { installmentName, parseAmount, type IncomeMethod } from "@/lib/payments";

/** Une ligne de l'échéancier, telle que saisie (montant en texte, jour « AAAA-MM-JJ »). */
export type ScheduleLine = { amount: string; day: string; chequeNumber: string; bank: string };

type IncomeScheduleProps = {
  lines: ScheduleLine[];
  method: IncomeMethod;
  /** Le premier versement est encaissé tout de suite (les suivants sont prévus). */
  firstCashed: boolean;
  today: string;
  /** Montant total saisi, en centimes ; `null` s'il n'est pas lisible. */
  totalCents: number | null;
  /** Messages par clé « installments.<rang>.<champ> » (mêmes clés que le serveur). */
  errors: Record<string, string>;
  /** Une ligne a été modifiée à la main : on propose de recalculer. */
  edited: boolean;
  onChange: (index: number, field: keyof ScheduleLine, value: string) => void;
  onReset: () => void;
};

/** Champ plus compact pour les lignes de l'échéancier. */
const LINE_FIELD = FIELD_CLASSES.replace("px-3.5 py-3 text-base", "px-3 py-2.5 text-base md:text-[15px]");

const COLUMNS = {
  cheque: "md:grid-cols-[1.75rem_minmax(0,0.85fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.15fr)]",
  plain: "md:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)]",
};

/** Somme des versements en centimes ; `null` si un montant n'est pas lisible. */
export function scheduleSum(lines: ScheduleLine[]): number | null {
  let sum = 0;
  for (const line of lines) {
    const cents = parseAmount(line.amount);
    if (cents === null) return null;
    sum += cents;
  }
  return sum;
}

/** Phrase affichée sous l'échéancier : les lignes font-elles bien le total ? */
function statusText(totalCents: number | null, sumCents: number | null, count: number): string {
  if (totalCents === null || totalCents === 0) {
    return "Indiquez le montant total : il sera réparti entre les versements.";
  }
  if (sumCents === null) return "Vérifiez les montants : l'un d'eux n'est pas lisible.";
  if (sumCents === totalCents) return `Les ${count} versements font bien ${formatEuros(totalCents)}.`;
  const gap = formatEuros(Math.abs(totalCents - sumCents));
  return sumCents < totalCents
    ? `Les versements font ${formatEuros(sumCents)} : il manque ${gap} pour atteindre ${formatEuros(totalCents)}.`
    : `Les versements font ${formatEuros(sumCents)} : ${gap} de trop par rapport à ${formatEuros(totalCents)}.`;
}

/**
 * Échéancier d'un paiement en 2, 3 ou 4 fois : une ligne par versement
 * (montant, date et, pour un chèque, numéro et banque). Sur ordinateur, les
 * lignes forment un petit tableau ; sur téléphone, chaque versement est un
 * bloc avec ses étiquettes. Le total des lignes est vérifié en direct.
 */
export function IncomeSchedule({
  lines,
  method,
  firstCashed,
  today,
  totalCents,
  errors,
  edited,
  onChange,
  onReset,
}: IncomeScheduleProps) {
  const labelId = useId();
  const cheque = method === "CHEQUE";
  const columns = cheque ? COLUMNS.cheque : COLUMNS.plain;
  const sumCents = scheduleSum(lines);
  const balanced = totalCents !== null && totalCents > 0 && sumCents === totalCents;

  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex min-h-6 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p id={labelId} className={LABEL_CLASSES}>
          Échéancier
        </p>
        {edited ? (
          <button
            type="button"
            onClick={onReset}
            className="-my-2 inline-flex min-h-10 animate-fade items-center text-sm text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Répartir à nouveau
          </button>
        ) : null}
      </div>

      {/* En-têtes de colonnes (ordinateur) ; chaque champ garde sa propre étiquette pour les lecteurs d'écran. */}
      <div aria-hidden="true" className={clsx("mt-2 hidden gap-2 text-[13px] text-muted md:grid", columns)}>
        <span />
        <span>Montant</span>
        <span>Date prévue</span>
        {cheque ? (
          <>
            <span>N° du chèque</span>
            <span>Banque</span>
          </>
        ) : null}
      </div>

      <ol className="mt-2 flex flex-col gap-4 md:mt-1.5 md:gap-2">
        {lines.map((line, index) => {
          const problemOf = (field: keyof ScheduleLine) => errors[`installments.${index}.${field}`];
          const problems = [
            problemOf("amount") ? `Montant : ${problemOf("amount")}` : null,
            problemOf("day") ? `Date : ${problemOf("day")}` : null,
            problemOf("chequeNumber") ? `N° du chèque : ${problemOf("chequeNumber")}` : null,
            problemOf("bank") ? `Banque : ${problemOf("bank")}` : null,
          ].filter(Boolean);
          const cashed = index === 0 && firstCashed;
          const previousDay = index > 0 ? lines[index - 1].day : "";
          return (
            <li key={index}>
              <div className={clsx("grid grid-cols-2 gap-x-3 gap-y-2 md:items-center md:gap-2", columns)}>
                <p className="col-span-2 flex items-center gap-2 text-sm font-medium md:col-span-1">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-colors duration-base ease-soft",
                      cashed ? "bg-income-soft text-income-strong" : "bg-neutral-soft text-nav",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="md:sr-only">
                    {installmentName(method, index + 1)}
                    <span className="font-normal text-muted">{cashed ? " · encaissé" : " · prévu"}</span>
                  </span>
                </p>
                <LineField label="Montant" suffix={` du versement ${index + 1}`}>
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00 €"
                      aria-invalid={problemOf("amount") ? true : undefined}
                      value={line.amount}
                      onChange={(event) => onChange(index, "amount", event.target.value)}
                      className={LINE_FIELD}
                    />
                  )}
                </LineField>
                <LineField label={cashed ? "Date" : "Date prévue"} suffix={` du versement ${index + 1}`}>
                  {(id) => (
                    <input
                      id={id}
                      type="date"
                      required
                      max={cashed ? today : undefined}
                      min={isIsoDay(previousDay) ? previousDay : undefined}
                      aria-invalid={problemOf("day") ? true : undefined}
                      value={line.day}
                      onChange={(event) => onChange(index, "day", event.target.value)}
                      className={LINE_FIELD}
                    />
                  )}
                </LineField>
                {cheque ? (
                  <>
                    <LineField label="N° du chèque" suffix={` ${index + 1}`}>
                      {(id) => (
                        <input
                          id={id}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={30}
                          aria-invalid={problemOf("chequeNumber") ? true : undefined}
                          value={line.chequeNumber}
                          onChange={(event) => onChange(index, "chequeNumber", event.target.value)}
                          className={LINE_FIELD}
                        />
                      )}
                    </LineField>
                    <LineField label="Banque" suffix={` ${index + 1}`}>
                      {(id) => (
                        <input
                          id={id}
                          type="text"
                          autoComplete="off"
                          maxLength={60}
                          aria-invalid={problemOf("bank") ? true : undefined}
                          value={line.bank}
                          onChange={(event) => onChange(index, "bank", event.target.value)}
                          className={LINE_FIELD}
                        />
                      )}
                    </LineField>
                  </>
                ) : null}
              </div>
              <div role="alert" className="empty:hidden">
                {problems.length > 0 ? (
                  <p className="mt-1.5 animate-fade text-sm text-accent md:pl-9">{problems.join(" ")}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p
        role="status"
        className={clsx(
          "mt-3 flex items-start gap-2 text-sm",
          balanced ? "text-income" : totalCents === null || totalCents === 0 ? "text-muted" : "text-accent",
        )}
      >
        {balanced ? <CheckIcon size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" /> : null}
        <span>{statusText(totalCents, sumCents, lines.length)}</span>
      </p>
    </div>
  );
}

/**
 * Étiquette + champ d'une ligne. L'étiquette n'est visible que sur téléphone
 * (sur ordinateur, les en-têtes de colonnes suffisent) ; `suffix` précise la
 * ligne pour les lecteurs d'écran : « Montant du versement 2 ».
 */
function LineField({ label, suffix, children }: { label: string; suffix: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[13px] text-muted md:sr-only">
        {label}
        <span className="sr-only">{suffix}</span>
      </label>
      {children(id)}
    </div>
  );
}
