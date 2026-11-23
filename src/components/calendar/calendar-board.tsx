"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useInstallmentActions } from "@/components/installments/installment-actions";
import { StateBadge } from "@/components/installments/state-badge";
import { CalendarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { addDays, monthBounds, shiftMonth } from "@/lib/days";
import { formatEuros, formatEurosCompact, formatLongDate, formatMonthTitle, formatShortDay, parseIsoDay, plural } from "@/lib/format";
import { installmentLabel } from "@/lib/payments";
import { memberHref, newIncomeHref, receiptPdfHref } from "@/lib/routes";
import type { InstallmentView } from "@/lib/views";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
/** Nombre d'encaissements affichés dans une case avant « + N autres ». */
const MAX_PILLS = 3;

/** Jour auquel une échéance apparaît : encaissée → jour d'encaissement, sinon date prévue. */
function dayOf(item: InstallmentView): string {
  return item.cashedDay ?? item.dueDay;
}

/** Couleur d'une pastille selon le statut (mêmes codes que la fiche adhérent). */
function pillClasses(item: InstallmentView): string {
  if (item.state === "CASHED") return "bg-income-soft text-income-strong";
  if (item.state === "REJECTED") return "bg-late-soft text-accent line-through";
  if (item.late) return "bg-late-soft text-accent";
  if (item.state === "DUE") return "bg-amber-soft text-amber-strong";
  return "bg-neutral-soft text-nav";
}

function sum(items: InstallmentView[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0);
}

/** Les semaines du mois, du lundi au dimanche (jours voisins compris pour compléter la grille). */
function weeksOf(month: string): string[][] {
  const { first, last } = monthBounds(month);
  const weekday = (parseIsoDay(first).getUTCDay() + 6) % 7; // lundi = 0
  const days: string[] = [];
  for (let day = addDays(first, -weekday); day <= last || days.length % 7 !== 0; day = addDays(day, 1)) {
    days.push(day);
  }
  return Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
}

function cascade(index: number, baseMs: number): CSSProperties {
  return { "--i": Math.min(index, 14), "--stagger-base": `${baseMs}ms` } as CSSProperties;
}

type CalendarBoardProps = { month: string; today: string; items: InstallmentView[] };

export function CalendarBoard({ month, today, items }: CalendarBoardProps) {
  const actions = useInstallmentActions(today);

  const byDay = new Map<string, InstallmentView[]>();
  for (const item of items) {
    const day = dayOf(item);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const days = [...byDay.keys()].sort();
  const weeks = weeksOf(month);

  const pending = items.filter((item) => item.status === "PLANNED");
  const late = pending.filter((item) => item.late);
  const cashed = items.filter((item) => item.status === "CASHED");
  const rejected = items.filter((item) => item.status === "REJECTED");
  const currentMonth = today.slice(0, 7);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Changer de mois" className="flex animate-rise flex-wrap items-center gap-2.5 stagger-1">
        <Link
          href={`/calendrier?mois=${shiftMonth(month, -1)}`}
          aria-label={`Mois précédent : ${formatMonthTitle(shiftMonth(month, -1))}`}
          className={buttonClasses("secondary", "sm")}
        >
          <span aria-hidden="true">‹</span> Précédent
        </Link>
        <h2 aria-live="polite" className="min-w-[168px] px-1 text-center text-[19px] font-semibold">
          {formatMonthTitle(month)}
        </h2>
        <Link
          href={`/calendrier?mois=${shiftMonth(month, 1)}`}
          aria-label={`Mois suivant : ${formatMonthTitle(shiftMonth(month, 1))}`}
          className={buttonClasses("secondary", "sm")}
        >
          Suivant <span aria-hidden="true">›</span>
        </Link>
        {month !== currentMonth ? (
          <Link href="/calendrier" className={buttonClasses("ghost", "sm")}>
            Aujourd&apos;hui
          </Link>
        ) : null}
      </nav>

      <ul aria-label="Résumé du mois" className="flex animate-rise flex-wrap gap-2.5 text-sm stagger-1">
        <li className="rounded-full bg-amber-soft px-3.5 py-2 text-amber-strong">
          À encaisser : {plural(pending.length, "échéance")} · {formatEurosCompact(sum(pending))}
        </li>
        {late.length > 0 ? (
          <li className="rounded-full bg-late-soft px-3.5 py-2 text-accent">
            En retard : {late.length} · {formatEurosCompact(sum(late))}
          </li>
        ) : null}
        <li className="rounded-full bg-income-soft px-3.5 py-2 text-income-strong">
          Encaissé : {cashed.length} · {formatEurosCompact(sum(cashed))}
        </li>
        {rejected.length > 0 ? (
          <li className="rounded-full bg-neutral-soft px-3.5 py-2 text-nav">Rejeté : {rejected.length}</li>
        ) : null}
      </ul>

      {/* Vue d'ensemble du mois (ordinateur). Le détail, avec les gestes, est dans la liste dessous. */}
      <Card as="section" aria-label={`Vue du mois de ${formatMonthTitle(month)}`} className="hidden animate-rise stagger-2 desk:block desk:p-4">
        <div aria-hidden="true" className="grid grid-cols-7 px-1 pb-2 text-[13px] font-medium text-muted">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} className="px-2">
              {weekday}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-field border border-divider">
          {weeks.flat().map((day, index) => {
            const inMonth = day.slice(0, 7) === month;
            const dayItems = inMonth ? (byDay.get(day) ?? []) : [];
            const isToday = day === today;
            return (
              <div
                key={day}
                className={clsx(
                  "flex min-h-[104px] min-w-0 flex-col gap-1 border-divider p-1.5",
                  index % 7 !== 6 && "border-r",
                  index < weeks.length * 7 - 7 && "border-b",
                  !inMonth && "bg-page",
                )}
              >
                <span
                  className={clsx(
                    "flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums",
                    isToday ? "bg-primary font-semibold text-on-primary" : inMonth ? "text-ink" : "text-faint",
                  )}
                >
                  {Number(day.slice(8))}
                  {isToday ? <span className="sr-only"> (aujourd&apos;hui)</span> : null}
                </span>
                {dayItems.slice(0, MAX_PILLS).map((item, pillIndex) => (
                  <a
                    key={item.id}
                    href={`#jour-${day}`}
                    style={cascade(index / 3 + pillIndex, 160)}
                    title={`${item.memberName} · ${formatEuros(item.amountCents)}`}
                    className={clsx(
                      "flex animate-fade items-center justify-between gap-1.5 rounded-md px-1.5 py-1 text-[12px] leading-tight no-underline stagger-i",
                      "transition-[scale,filter] duration-fast ease-soft hover:brightness-[0.97] active:scale-[0.97]",
                      pillClasses(item),
                    )}
                  >
                    <span className="truncate">{item.memberName.replace(/^Famille\s+/i, "")}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatEurosCompact(item.amountCents)}</span>
                  </a>
                ))}
                {dayItems.length > MAX_PILLS ? (
                  <a href={`#jour-${day}`} className="px-1.5 text-[12px] text-muted">
                    + {plural(dayItems.length - MAX_PILLS, "autre")}
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
        <ul aria-label="Légende" className="flex flex-wrap gap-x-5 gap-y-1.5 px-1 pt-3 text-[13px] text-muted">
          {[
            ["bg-neutral-soft", "Prévu"],
            ["bg-amber-soft", "À encaisser (7 jours)"],
            ["bg-late-soft", "En retard ou rejeté"],
            ["bg-income-soft", "Encaissé"],
          ].map(([color, label]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={clsx("size-3 rounded-[4px] border border-line", color)} />
              {label}
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" className="animate-rise stagger-3" aria-labelledby="titre-detail-mois">
        <CardTitle id="titre-detail-mois">Détail du mois</CardTitle>
        {days.length === 0 ? (
          <EmptyState
            icon={CalendarIcon}
            title="Aucun encaissement ce mois-ci"
            description="Les échéances apparaissent ici dès qu'un encaissement en plusieurs fois est enregistré."
            action={
              <Link href={newIncomeHref()} className={buttonClasses("primary", "sm")}>
                + Encaissement
              </Link>
            }
          />
        ) : (
          <div className="mt-2 flex flex-col">
            {days.map((day, dayIndex) => {
              const dayItems = byDay.get(day) ?? [];
              return (
                <section
                  key={day}
                  id={`jour-${day}`}
                  aria-label={`${formatLongDate(parseIsoDay(day))}, ${plural(dayItems.length, "encaissement")}`}
                  style={cascade(dayIndex, 220)}
                  className="-mx-2 animate-rise scroll-mt-6 rounded-field border-t border-divider px-2 py-3.5 transition-colors duration-base stagger-i target:bg-primary-soft"
                >
                  <h3 className="flex items-center gap-2 text-sm font-medium text-muted">
                    {formatShortDay(parseIsoDay(day))}
                    {day === today ? <Badge tone="primary">Aujourd&apos;hui</Badge> : null}
                  </h3>
                  <ul className="mt-1">
                    {dayItems.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                        <div className="min-w-0 flex-1 basis-[220px]">
                          <p className="truncate font-medium leading-snug">
                            <Link href={memberHref(item.memberId)} className="text-ink no-underline hover:text-accent">
                              {item.memberName}
                            </Link>
                          </p>
                          <p className="mt-0.5 text-[13px] leading-snug text-muted">
                            {installmentLabel(item.method, item.number, item.count)} · {item.planLabel}
                            {item.chequeNumber ? ` · n° ${item.chequeNumber}` : ""}
                          </p>
                        </div>
                        <StateBadge state={item.state} late={item.late} />
                        <p className="w-[92px] text-right font-semibold tabular-nums">{formatEuros(item.amountCents)}</p>
                        <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
                          {item.status === "PLANNED" ? (
                            <>
                              <Button size="sm" onClick={() => actions.cash(item)} aria-label={`Encaisser : ${item.memberName}, ${formatEuros(item.amountCents)}`}>
                                Encaisser
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => actions.edit(item)} aria-label={`Modifier l'échéance de ${item.memberName}`}>
                                Modifier
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => actions.reject(item)} aria-label={`Marquer comme rejeté : ${item.memberName}`}>
                                Rejeté
                              </Button>
                            </>
                          ) : null}
                          {item.status === "REJECTED" ? (
                            <Button variant="secondary" size="sm" onClick={() => actions.edit(item)} aria-label={`Remettre à encaisser : ${item.memberName}`}>
                              Remettre à encaisser
                            </Button>
                          ) : null}
                          {item.status === "CASHED" && item.receipt ? (
                            <a
                              href={receiptPdfHref(item.receipt.id)}
                              target="_blank"
                              rel="noopener"
                              aria-label={`Reçu n° ${item.receipt.number} (PDF, nouvel onglet)`}
                              className={buttonClasses("ghost", "sm")}
                            >
                              Reçu
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>
      {actions.dialogs}
    </div>
  );
}
