"use client";

import { useId, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDownIcon, MembersIcon, RestoreIcon } from "@/components/icons";
import { Avatar } from "@/components/members/avatar";
import { NewMemberButton } from "@/components/members/member-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/form";
import { SearchField } from "@/components/ui/search-field";
import { restoreMember } from "@/app/(app)/adherents/actions";
import { daysBetween, yearOf } from "@/lib/days";
import { formatDay, formatDayWithYear, formatEuros, plural } from "@/lib/format";
import { DUE_SOON_DAYS } from "@/lib/payments";
import { memberHref } from "@/lib/routes";
import { matchesSearch } from "@/lib/search";
import type { MemberListItem } from "@/lib/views";

const ROW_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * Colonnes de la liste quand la carte est assez large (≥ 768px) : vignette,
 * nom, versé, reste à payer, chèques, flèche. En dessous, chaque adhérent est
 * présenté sur plusieurs lignes.
 */
const COLUMNS = "@3xl:grid-cols-[44px_minmax(0,1fr)_112px_112px_204px_18px] @3xl:gap-x-4";

function contactLine(member: MemberListItem): string {
  return [member.phone, member.email].filter(Boolean).join(" · ");
}

export function MemberBoard({ members, today }: { members: MemberListItem[]; today: string }) {
  const [query, setQuery] = useState("");
  // Cascade d'arrivée des lignes : seulement pour celles présentes à l'ouverture
  // de la page, et plus du tout dès que la liste est filtrée.
  const [cascade, setCascade] = useState(true);
  const [initialIds] = useState(() => new Set(members.map((member) => member.id)));

  const year = yearOf(today);
  const active = members.filter((member) => !member.archived);
  const archived = members.filter((member) => member.archived);
  const visible = active.filter((member) =>
    matchesSearch(query, member.name, member.phone, member.phone?.replace(/\s/g, ""), member.email),
  );
  const searching = query.trim() !== "";

  if (members.length === 0) {
    return (
      <Card as="section" aria-label="Liste des adhérents" className="animate-rise stagger-1">
        <EmptyState
          icon={MembersIcon}
          title="Aucun adhérent pour l'instant"
          description="Ajoutez une première famille ou un premier adhérent : vous pourrez ensuite enregistrer ses paiements, suivre ses chèques et retrouver ses reçus."
          action={<NewMemberButton size="sm">Ajouter un adhérent</NewMemberButton>}
        />
      </Card>
    );
  }

  const countLabel =
    active.length === 0
      ? "Aucun adhérent actif"
      : !searching
        ? plural(active.length, "adhérent")
        : visible.length === 0
          ? `Aucun adhérent sur ${active.length}`
          : `${plural(visible.length, "adhérent")} sur ${active.length}`;

  return (
    <>
      <div className="flex animate-rise flex-wrap items-center justify-between gap-x-4 gap-y-3 stagger-1">
        <p role="status" className="text-[15px] text-muted">
          {countLabel}
        </p>
        <SearchField
          label="Rechercher un adhérent"
          placeholder="Rechercher un nom, un téléphone…"
          value={query}
          onChange={(value) => {
            setCascade(false);
            setQuery(value);
          }}
        />
      </div>

      <Card as="section" aria-label="Liste des adhérents" className="@container animate-rise stagger-2">
        {active.length === 0 ? (
          <EmptyState
            icon={MembersIcon}
            title="Aucun adhérent actif"
            description="Tous vos adhérents sont archivés. Restaurez-en un ci-dessous, ou ajoutez-en un nouveau."
            action={<NewMemberButton size="sm">Ajouter un adhérent</NewMemberButton>}
          />
        ) : (
          <>
            <div
              aria-hidden="true"
              className={clsx("hidden pb-3 text-[13px] leading-tight text-muted @3xl:grid", COLUMNS)}
            >
              <span className="col-span-2">Adhérent</span>
              <span className="text-right">Versé en {year}</span>
              <span className="text-right">Reste à payer</span>
              <span className="pl-4">Chèques</span>
            </div>
            <ul className="-mb-4 -mt-4 @3xl:mt-0">
              <AnimatePresence initial={false}>
                {visible.map((member, index) => (
                  <motion.li
                    key={member.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={ROW_TRANSITION}
                    className="-mx-2 overflow-hidden px-2"
                  >
                    <MemberRow
                      member={member}
                      year={year}
                      today={today}
                      cascadeIndex={cascade && initialIds.has(member.id) ? Math.min(index, 14) : null}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {visible.length === 0 ? (
              <div className="mt-4 @3xl:border-t @3xl:border-divider">
                <EmptyState
                  title="Aucun résultat"
                  description={`Aucun adhérent ne correspond à « ${query.trim()} ». Vérifiez l'orthographe ou essayez un autre mot.`}
                  action={
                    <Button variant="secondary" size="sm" className="min-h-10" onClick={() => setQuery("")}>
                      Effacer la recherche
                    </Button>
                  }
                />
              </div>
            ) : null}
          </>
        )}
      </Card>

      <AnimatePresence initial={false}>
        {archived.length > 0 ? (
          <motion.div
            key="archived"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={ROW_TRANSITION}
          >
            <ArchivedMembers items={archived} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Une ligne de la liste                                               */
/* ------------------------------------------------------------------ */

function MemberRow({
  member,
  year,
  today,
  cascadeIndex,
}: {
  member: MemberListItem;
  year: number;
  today: string;
  /** Rang dans la cascade d'arrivée, ou `null` si la ligne n'en fait pas partie. */
  cascadeIndex: number | null;
}) {
  const contact = contactLine(member);
  return (
    <div
      style={
        cascadeIndex === null
          ? undefined
          : ({ "--i": cascadeIndex, "--stagger-base": "180ms" } as CSSProperties)
      }
      className={clsx(
        "group relative grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 border-t border-divider py-4",
        // En colonne (téléphone), pas de filet au-dessus de la première ligne.
        "in-[li:first-child]:border-transparent @3xl:in-[li:first-child]:border-divider",
        COLUMNS,
        cascadeIndex !== null && "animate-rise stagger-i",
      )}
    >
      <Avatar
        name={member.name}
        className="transition-[scale] duration-base ease-soft group-hover:scale-[1.06]"
      />
      <div className="min-w-0">
        <p className="truncate font-medium leading-snug">
          {/* Le lien couvre toute la ligne : on peut cliquer n'importe où. */}
          <Link
            href={memberHref(member.id)}
            className="text-ink no-underline transition-colors duration-fast ease-soft after:absolute after:inset-0 group-hover:text-accent"
          >
            {member.name}
          </Link>
        </p>
        <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">
          {contact || "Pas de coordonnées"}
        </p>
      </div>

      <div className="col-start-2 flex flex-wrap gap-x-7 gap-y-1.5 @3xl:contents">
        <p className="leading-snug @3xl:text-right">
          <span className="block text-xs text-muted @3xl:sr-only">Versé en {year}</span>
          <span
            className={clsx(
              "font-semibold tabular-nums",
              member.paidThisYearCents > 0 ? "text-income" : "text-faint",
            )}
          >
            {formatEuros(member.paidThisYearCents)}
          </span>
        </p>
        <p className="leading-snug @3xl:text-right">
          <span className="block text-xs text-muted @3xl:sr-only">Reste à payer</span>
          {member.remainingCents > 0 ? (
            <span className="font-semibold tabular-nums text-accent">{formatEuros(member.remainingCents)}</span>
          ) : (
            <span className="text-faint">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Rien</span>
            </span>
          )}
        </p>
      </div>

      <div className="col-start-2 empty:hidden @3xl:col-start-auto @3xl:pl-4 @3xl:empty:block">
        <DueBadge member={member} today={today} />
      </div>

      <ChevronDownIcon
        size={18}
        className="hidden -rotate-90 text-faint transition-[translate,color] duration-base ease-soft group-hover:translate-x-0.5 group-hover:text-accent @3xl:block"
      />
    </div>
  );
}

/** « 1 chèque en retard », sinon la prochaine échéance, sinon rien. */
function DueBadge({ member, today }: { member: MemberListItem; today: string }) {
  if (member.lateCount > 0) {
    return <Badge tone="late">{plural(member.lateCount, "chèque")} en retard</Badge>;
  }
  if (!member.nextDue) return null;
  const days = daysBetween(today, member.nextDue.day);
  const day = days > 180 ? formatDayWithYear(member.nextDue.day) : formatDay(member.nextDue.day);
  return <Badge tone={days <= DUE_SOON_DAYS ? "amber" : "neutral"}>Prochain chèque le {day}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Adhérents archivés (section repliée)                                */
/* ------------------------------------------------------------------ */

function ArchivedMembers({ items }: { items: MemberListItem[] }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const panelId = useId();

  const restore = (member: MemberListItem) => {
    if (pendingId) return;
    setPendingId(member.id);
    setError(null);
    startTransition(async () => {
      const result = await restoreMember(member.id);
      if (!result.ok) setError(result.message);
      setPendingId(null);
    });
  };

  return (
    <Card as="section">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="-m-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-field p-2 text-left transition-[background-color] duration-fast ease-soft hover:bg-page"
        >
          <span className="text-[19px] font-semibold leading-snug">Adhérents archivés</span>
          <Badge tone="neutral" className="tabular-nums">
            {items.length}
          </Badge>
          <ChevronDownIcon
            size={20}
            className={clsx(
              "ml-auto shrink-0 text-nav transition-[rotate] duration-base ease-soft",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={ROW_TRANSITION}
            className="-mx-2 overflow-hidden px-2"
          >
            <p className="pb-3 pt-2.5 text-sm text-muted">
              Masqués de la liste et des formulaires. Leurs paiements et leurs reçus sont conservés.
            </p>
            <div role="alert" className="empty:hidden">
              {error ? <p className="animate-fade pb-2 text-sm text-accent">{error}</p> : null}
            </div>
            <ul>
              <AnimatePresence initial={false}>
                {items.map((member) => (
                  <motion.li
                    key={member.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={ROW_TRANSITION}
                    className="-mx-2 overflow-hidden px-2"
                  >
                    <div className="flex items-center gap-3.5 border-t border-divider py-3">
                      <Avatar name={member.name} muted />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium leading-snug">
                          <Link href={memberHref(member.id)} className="text-ink no-underline hover:text-accent">
                            {member.name}
                          </Link>
                        </p>
                        <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">
                          {contactLine(member) || "Pas de coordonnées"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-10 shrink-0"
                        aria-disabled={pendingId !== null}
                        aria-label={`Restaurer « ${member.name} »`}
                        onClick={() => restore(member)}
                      >
                        {pendingId === member.id ? <Spinner /> : <RestoreIcon size={16} />}
                        Restaurer
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}
