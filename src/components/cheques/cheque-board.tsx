"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ChequeIcon, ReceiptIcon } from "@/components/icons";
import { useInstallmentActions } from "@/components/installments/installment-actions";
import { StateBadge } from "@/components/installments/state-badge";
import { CountUp } from "@/components/motion/count-up";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { daysBetween, yearOf } from "@/lib/days";
import {
  formatDay,
  formatDayWithYear,
  formatEuros,
  formatEurosCompact,
  formatShortDay,
  formatSignedEuros,
  parseIsoDay,
} from "@/lib/format";
import { installmentLabel } from "@/lib/payments";
import { memberHref, newIncomeHref, receiptPdfHref } from "@/lib/routes";
import { matchesSearch } from "@/lib/search";
import type { InstallmentView } from "@/lib/views";

type Tab = "pending" | "rejected" | "cashed";
type Actions = ReturnType<typeof useInstallmentActions>;

const TABS: Tab[] = ["pending", "rejected", "cashed"];

const TAB_LABELS: Record<Tab, string> = {
  pending: "En attente",
  rejected: "Rejetés",
  cashed: "Encaissés",
};

const TAB_TITLES: Record<Tab, string> = {
  pending: "En attente d'encaissement",
  rejected: "Chèques rejetés",
  cashed: "Derniers chèques encaissés",
};

const ROW_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;
const COLLAPSED = { opacity: 0, height: 0 } as const;
const EXPANDED = { opacity: 1, height: "auto" } as const;

/** Au-delà de ce rang, les lignes arrivent ensemble : la cascade reste courte. */
const CASCADE_MAX_INDEX = 12;
/** Durée de la cascade complète (dernier décalage + animation), avec une marge. */
const CASCADE_MS = 1300;

function sumCents(items: InstallmentView[]): number {
  return items.reduce((sum, item) => sum + item.amountCents, 0);
}

/** « chèque(s) », ou « échéance(s) » si tous les versements ne sont pas des chèques. */
function nounFor(items: InstallmentView[]): string {
  const word = items.every((item) => item.method === "CHEQUE") ? "chèque" : "échéance";
  return items.length > 1 ? `${word}s` : word;
}

/** « 3 chèques · 285 € » */
function summaryOf(items: InstallmentView[]): string {
  return `${items.length} ${nounFor(items)} · ${formatEurosCompact(sumCents(items))}`;
}

function labelOf(item: InstallmentView): string {
  return installmentLabel(item.method, item.number, item.count);
}

function matches(query: string, item: InstallmentView): boolean {
  return matchesSearch(
    query,
    item.memberName,
    labelOf(item),
    item.planLabel,
    item.categoryName,
    item.chequeNumber,
    item.bank,
  );
}

/** « Lun. 23 nov. », avec l'année si ce n'est pas l'année en cours : « 5 janv. 2027 ». */
function dayLabel(day: string, today: string): string {
  return yearOf(day) === yearOf(today) ? formatShortDay(parseIsoDay(day)) : formatDayWithYear(day);
}

function relativeDay(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`;
}

/** Position dans la liste, pour l'apparition en cascade des lignes. */
function cascadeStyle(index: number): CSSProperties {
  return { "--i": Math.min(index, CASCADE_MAX_INDEX), "--stagger-base": "140ms" } as CSSProperties;
}

/**
 * Vrai pendant l'apparition en cascade d'une liste (CSS). Ensuite, les lignes
 * qui arrivent ou repartent sont animées une à une par Motion, sans décalage.
 * La cascade rejoue quand on revient sur la page (elle reste montée, cachée).
 */
function useCascade(): boolean {
  const [cascading, setCascading] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setCascading(false), CASCADE_MS);
    return () => {
      window.clearTimeout(timer);
      setCascading(true);
    };
  }, []);
  return cascading;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type ChequeBoardProps = {
  today: string;
  /** Échéances prévues ou rejetées, triées par date. */
  pending: InstallmentView[];
  /** Dernières échéances encaissées, de la plus récente à la plus ancienne. */
  cashed: InstallmentView[];
};

export function ChequeBoard({ today, pending, cashed }: ChequeBoardProps) {
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const actions = useInstallmentActions(today);
  const titleId = useId();

  const planned = pending.filter((item) => item.status === "PLANNED");
  const rejected = pending.filter((item) => item.status === "REJECTED");
  const late = planned.filter((item) => item.late);
  const soon = planned.filter((item) => !item.late && item.state === "DUE");

  const search = query.trim();
  const found: Record<Tab, InstallmentView[]> = {
    pending: planned.filter((item) => matches(search, item)),
    rejected: rejected.filter((item) => matches(search, item)),
    cashed: cashed.filter((item) => matches(search, item)),
  };
  const visible = found[tab];

  const groups: Group[] = [
    { key: "late", title: "En retard", dot: "bg-accent", items: visible.filter((item) => item.late) },
    {
      key: "week",
      title: "Cette semaine",
      dot: "bg-amber-line",
      items: visible.filter((item) => !item.late && item.state === "DUE"),
    },
    { key: "later", title: "Plus tard", dot: "bg-line-strong", items: visible.filter((item) => item.state === "PLANNED") },
  ];

  const elsewhere = TABS.filter((other) => other !== tab && found[other].length > 0);

  return (
    <>
      <section aria-label="Résumé des chèques" className="grid gap-3 sm:grid-cols-3 sm:gap-4 xl:gap-5">
        <SummaryCard
          label="À encaisser"
          items={planned}
          valueClassName="text-ink"
          hint={planned.length > 0 ? `${formatEurosCompact(sumCents(planned))} au total` : "Aucune échéance prévue"}
          className="stagger-1"
        />
        <SummaryCard
          label="En retard"
          items={late}
          valueClassName={late.length > 0 ? "text-accent" : "text-ink"}
          hint={
            late.length > 0
              ? `${formatEurosCompact(sumCents(late))} · depuis le ${formatDay(late[0].dueDay)}`
              : "Tout est à jour"
          }
          className="stagger-2"
        />
        <SummaryCard
          label="Dans les 7 jours"
          items={soon}
          valueClassName="text-amber"
          hint={
            soon.length > 0
              ? `${formatEurosCompact(sumCents(soon))} · dès ${
                  soon[0].dueDay === today ? "aujourd'hui" : `le ${formatDay(soon[0].dueDay)}`
                }`
              : "Rien à déposer cette semaine"
          }
          className="stagger-3"
        />
      </section>

      <div className="flex animate-rise flex-wrap items-center justify-between gap-3 stagger-3">
        <div role="group" aria-label="Filtrer les chèques par statut" className="flex flex-wrap gap-1.5 sm:gap-2">
          {TABS.map((value) => (
            <Chip
              key={value}
              selected={tab === value}
              onClick={() => setTab(value)}
              className="max-sm:px-3.5"
            >
              {TAB_LABELS[value]}
              <span className="ml-1.5 text-[13px] tabular-nums opacity-75">{found[value].length}</span>
            </Chip>
          ))}
        </div>
        <SearchField
          label="Rechercher un chèque"
          placeholder="Famille, n° de chèque, banque…"
          value={query}
          onChange={setQuery}
        />
      </div>

      <Card as="section" aria-labelledby={titleId} className="@container animate-rise stagger-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <CardTitle id={titleId}>{TAB_TITLES[tab]}</CardTitle>
          <p role="status" className="text-sm text-muted">
            {visible.length > 0 ? summaryOf(visible) : null}
          </p>
        </div>

        <TabBody key={tab}>
          {(cascading) => (
            <>
              {tab === "pending" ? (
                <PendingGroups groups={groups} today={today} cascading={cascading} actions={actions} />
              ) : (
                <Rows items={visible} offset={0} today={today} cascading={cascading} actions={actions} />
              )}

              {visible.length === 0 ? (
                search !== "" ? (
                  <EmptyState
                    title={`Aucun résultat pour « ${search} »`}
                    description={
                      elsewhere.length > 0
                        ? "Rien dans cette liste, mais la recherche donne des résultats ailleurs."
                        : "Cherchez par nom de famille, numéro de chèque, banque ou intitulé du cours."
                    }
                    action={
                      <>
                        {elsewhere.map((other) => (
                          <Button key={other} variant="secondary" size="sm" onClick={() => setTab(other)}>
                            Voir « {TAB_LABELS[other]} » ({found[other].length})
                          </Button>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                          Effacer la recherche
                        </Button>
                      </>
                    }
                  />
                ) : tab === "pending" ? (
                  <EmptyState
                    icon={ChequeIcon}
                    title="Aucun chèque en attente"
                    description="Les échéances apparaissent ici dès qu'un encaissement en plusieurs fois est enregistré."
                    action={
                      <ButtonLink href={newIncomeHref()} size="sm">
                        + Encaissement
                      </ButtonLink>
                    }
                  />
                ) : tab === "rejected" ? (
                  <EmptyState
                    icon={ChequeIcon}
                    title="Aucun chèque rejeté"
                    description="Si la banque refuse un chèque, marquez-le « Rejeté » : il attendra ici son chèque de remplacement."
                  />
                ) : (
                  <EmptyState
                    icon={ChequeIcon}
                    title="Aucun chèque encaissé pour l'instant"
                    description="Dès qu'une échéance est marquée comme encaissée, elle arrive ici avec son reçu."
                    action={
                      planned.length > 0 ? (
                        <Button variant="secondary" size="sm" onClick={() => setTab("pending")}>
                          Voir les chèques en attente
                        </Button>
                      ) : undefined
                    }
                  />
                )
              ) : null}

              {tab === "cashed" && visible.length > 0 ? (
                <p className="border-t border-divider pt-4 text-[13px] text-muted">
                  Seuls les encaissements les plus récents sont listés ici. L&apos;historique complet
                  est dans{" "}
                  <Link href="/mouvements" className="underline underline-offset-2">
                    Entrées &amp; sorties
                  </Link>
                  .
                </p>
              ) : null}
            </>
          )}
        </TabBody>
      </Card>

      {actions.dialogs}
    </>
  );
}

/** Contenu d'un onglet : remonté à chaque changement d'onglet, ce qui rejoue la cascade. */
function TabBody({ children }: { children: (cascading: boolean) => ReactNode }) {
  const cascading = useCascade();
  return <>{children(cascading)}</>;
}

/* ------------------------------------------------------------------ */
/* Cartes de résumé                                                    */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  items,
  hint,
  valueClassName,
  className,
}: {
  label: string;
  items: InstallmentView[];
  hint: string;
  valueClassName: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "@container grid min-w-0 animate-rise grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-card border border-line bg-surface px-5 py-4",
        "sm:block sm:p-5 desk:p-6",
        className,
      )}
    >
      <p className="col-start-1 row-start-1 text-[15px] leading-snug text-muted">{label}</p>
      <p
        className={clsx(
          "col-start-2 row-span-2 row-start-1 whitespace-nowrap text-[22px] font-semibold leading-[1.2]",
          "sm:mb-1 sm:mt-2.5 sm:text-[clamp(21px,14cqw,30px)]",
          valueClassName,
        )}
      >
        {items.length === 0 ? (
          "Aucun"
        ) : (
          <>
            <CountUp value={items.length} format="integer" /> {nounFor(items)}
          </>
        )}
      </p>
      <p className="col-start-1 row-start-2 text-sm leading-snug text-muted">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Listes                                                              */
/* ------------------------------------------------------------------ */

type Group = { key: string; title: string; dot: string; items: InstallmentView[] };

type ListProps = { today: string; cascading: boolean; actions: Actions };

/** Onglet « En attente » : en retard, cette semaine, plus tard. */
function PendingGroups({ groups, ...list }: { groups: Group[] } & ListProps) {
  const shown = groups.filter((group) => group.items.length > 0);
  return (
    <AnimatePresence initial={false}>
      {shown.map((group, index) => (
        <GroupSection
          key={group.key}
          group={group}
          offset={shown.slice(0, index).reduce((count, previous) => count + previous.items.length, 0)}
          first={index === 0}
          {...list}
        />
      ))}
    </AnimatePresence>
  );
}

function GroupSection({
  group,
  offset,
  first,
  ...list
}: { group: Group; offset: number; first: boolean } & ListProps) {
  const headingId = useId();
  return (
    <motion.section
      aria-labelledby={headingId}
      initial={COLLAPSED}
      animate={EXPANDED}
      exit={COLLAPSED}
      transition={ROW_TRANSITION}
      className="-mx-1 overflow-hidden px-1"
    >
      <h3
        id={headingId}
        style={cascadeStyle(offset)}
        className={clsx(
          "flex items-baseline justify-between gap-3 pb-2.5 text-sm",
          first ? "pt-3" : "pt-6",
          list.cascading && "animate-rise stagger-i",
        )}
      >
        <span className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className={clsx("size-2 rounded-full", group.dot)} />
          {group.title}
        </span>
        <span className="text-[13px] font-normal text-muted">{summaryOf(group.items)}</span>
      </h3>
      <Rows items={group.items} offset={offset} {...list} />
    </motion.section>
  );
}

function Rows({ items, offset, ...list }: { items: InstallmentView[]; offset: number } & ListProps) {
  return (
    <ul>
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.li
            key={item.id}
            initial={COLLAPSED}
            animate={EXPANDED}
            exit={COLLAPSED}
            transition={ROW_TRANSITION}
            className="-mx-1 overflow-hidden px-1"
          >
            <ChequeRow item={item} index={offset + index} {...list} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

/*
 * Une ligne, trois mises en page selon la largeur de la carte :
 *  - étroite (téléphone) : tout est empilé, les gestes en dernière ligne ;
 *  - moyenne : la date à gauche, le montant et le statut à droite, les gestes dessous ;
 *  - large : une seule rangée, les gestes au bout.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 [grid-template-areas:'date_badge'_'who_amount'_'detail_detail'_'actions_actions'] " +
  "@xl:grid-cols-[7rem_minmax(0,1fr)_auto] @xl:gap-y-0.5 @xl:[grid-template-areas:'date_who_amount'_'date_detail_badge'_'date_actions_actions'] " +
  "@4xl:grid-cols-[7rem_minmax(0,1fr)_6.5rem_auto] @4xl:[grid-template-areas:'date_who_amount_actions'_'date_detail_badge_actions']";

function ChequeRow({ item, index, today, cascading, actions }: { item: InstallmentView; index: number } & ListProps) {
  const label = labelOf(item);
  const cheque = [item.chequeNumber ? `n° ${item.chequeNumber}` : null, item.bank].filter(Boolean).join(" · ");
  const cashed = item.status === "CASHED";
  const shownDay = cashed && item.cashedDay ? item.cashedDay : item.dueDay;
  const context = ` — ${label}, ${item.memberName}`;

  // Sous la date : le délai pour une échéance en attente ; pour un chèque
  // encaissé, la date prévue si elle diffère de la date d'encaissement.
  const underDate = !cashed
    ? relativeDay(daysBetween(today, item.dueDay))
    : item.cashedDay && item.cashedDay !== item.dueDay
      ? `prévu le ${formatDay(item.dueDay)}`
      : null;

  return (
    <div
      style={cascadeStyle(index)}
      className={clsx(ROW_GRID, "border-t border-divider py-4", cascading && "animate-rise stagger-i")}
    >
      <p className="flex flex-wrap items-baseline gap-x-1.5 self-center text-sm leading-snug [grid-area:date] @xl:flex-col @xl:self-start @4xl:self-center">
        <span className="font-medium">
          <span className="sr-only">{cashed ? "Encaissé le " : "Prévu le "}</span>
          <time dateTime={shownDay}>{dayLabel(shownDay, today)}</time>
        </span>
        {underDate ? (
          <>
            <span aria-hidden="true" className="text-faint @xl:hidden">
              ·
            </span>
            <span className={clsx("text-[13px]", item.late ? "text-accent" : "text-muted")}>{underDate}</span>
          </>
        ) : null}
      </p>

      <p className="min-w-0 truncate font-medium leading-snug [grid-area:who] @xl:self-end">
        <Link href={memberHref(item.memberId)} className="text-ink no-underline hover:text-accent">
          {item.memberName}
        </Link>
      </p>

      <div className="min-w-0 text-sm leading-snug [grid-area:detail]">
        <p className="text-nav">
          {label} · {item.planLabel}
        </p>
        {cheque ? <p className="mt-0.5 text-[13px] text-muted">{cheque}</p> : null}
      </div>

      <StateBadge
        state={item.state}
        late={item.late}
        className="self-center justify-self-end [grid-area:badge] @xl:mt-1 @xl:self-start"
      />

      <p
        className={clsx(
          "self-end justify-self-end whitespace-nowrap font-semibold tabular-nums leading-snug [grid-area:amount]",
          cashed && "text-income",
        )}
      >
        {cashed ? formatSignedEuros(item.amountCents) : formatEuros(item.amountCents)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1 [grid-area:actions] @4xl:mt-0 @4xl:flex-nowrap @4xl:self-center @4xl:justify-self-end">
        {item.status === "PLANNED" ? (
          <>
            {/* Bouton plein pour ce qui est à déposer maintenant, discret pour le reste. */}
            <Button
              variant={item.state === "DUE" ? "primary" : "secondary"}
              size="sm"
              className="min-h-10"
              onClick={() => actions.cash(item)}
            >
              Encaisser
              <span className="sr-only">{context}</span>
            </Button>
            <Button variant="ghost" size="sm" className="min-h-10" onClick={() => actions.edit(item)}>
              Modifier
              <span className="sr-only">{context}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              title="Marquer comme rejeté"
              onClick={() => actions.reject(item)}
            >
              Rejeté
              <span className="sr-only"> : marquer comme rejeté{context}</span>
            </Button>
          </>
        ) : null}

        {item.status === "REJECTED" ? (
          <Button variant="secondary" size="sm" className="min-h-10" onClick={() => actions.edit(item)}>
            Remettre à encaisser
            <span className="sr-only">{context}</span>
          </Button>
        ) : null}

        {cashed ? (
          <>
            {item.receipt ? (
              <a
                href={receiptPdfHref(item.receipt.id)}
                target="_blank"
                rel="noopener"
                className={buttonClasses("secondary", "sm", "min-h-10")}
              >
                <ReceiptIcon size={16} />
                Reçu
                <span className="sr-only">
                  {" "}
                  n° {item.receipt.number} (PDF, nouvel onglet){context}
                </span>
              </a>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              title="Marquer comme rejeté"
              onClick={() => actions.reject(item)}
            >
              Rejeté
              <span className="sr-only"> : marquer comme rejeté{context}</span>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
