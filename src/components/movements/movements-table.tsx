"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryTone } from "@/lib/categories";
import { yearOf } from "@/lib/days";
import { formatDay, formatDayWithYear, formatSignedEuros } from "@/lib/format";
import { memberHref, receiptPdfHref } from "@/lib/routes";
import { searchKey } from "@/lib/search";
import type { TransactionView } from "@/lib/views";
import { CancelIcon, SOFT_TRANSITION } from "./form-parts";

/** Nombre de lignes affichées d'un coup ; « Afficher plus » ajoute le même nombre. */
export const PAGE_SIZE = 50;

/** Au-delà, les lignes arrivent ensemble : la cascade ne dure jamais plus d'une demi-seconde. */
const MAX_CASCADE = 12;

/*
 * Un seul balisage pour deux mises en page, selon la largeur de la carte
 * (requête de conteneur `@3xl`, 768px) :
 *  - carte large : un vrai tableau, colonnes alignées par une sous-grille ;
 *  - carte étroite (téléphone) : chaque mouvement devient un bloc empilé.
 * Les rôles ARIA gardent la lecture « tableau » dans les deux cas.
 */
const TABLE =
  // Carte un peu juste : la colonne « Qui » garde sa largeur, la catégorie se raccourcit en dernier recours.
  "@3xl:grid @3xl:grid-cols-[auto_minmax(10rem,1fr)_auto_auto_auto_auto_auto] " +
  // Carte large : l'espace libre se répartit entre les colonnes, comme sur la maquette.
  "@4xl:grid-cols-[auto_minmax(0,1.6fr)_minmax(max-content,1fr)_minmax(max-content,0.8fr)_auto_auto_auto]";

const HEAD_ROW = "sr-only @3xl:not-sr-only @3xl:col-span-full @3xl:grid @3xl:grid-cols-subgrid";
const HEAD_CELL = "px-3 pb-3.5 text-[13px] font-medium leading-snug text-muted";

const ROW =
  "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 overflow-hidden border-t border-divider py-4 " +
  "@max-3xl:nth-2:border-t-0 @max-3xl:nth-2:pt-1 " +
  "@3xl:col-span-full @3xl:grid-cols-subgrid @3xl:gap-0 @3xl:py-0";

/** Cellule en mode tableau : mêmes marges que la maquette (18px / 12px). */
const CELL_BASE = "@3xl:[grid-area:auto] @3xl:px-3 @3xl:text-[15px]";
const CELL = `${CELL_BASE} @3xl:py-[18px]`;

const ICON_BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-field text-nav " +
  "transition-[background-color,color,scale] duration-fast ease-soft hover:bg-primary-soft hover:text-accent active:scale-[0.94]";

type MovementsTableProps = {
  /** Mouvements déjà filtrés, du plus récent au plus ancien. */
  rows: TransactionView[];
  today: string;
  /** `cascade` : les lignes présentes à l'affichage arrivent l'une après l'autre. */
  entrance: "cascade" | "none";
  onCancel: (transaction: TransactionView) => void;
};

export function MovementsTable({ rows, today, entrance, onCancel }: MovementsTableProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  // Lignes qui arrivent en cascade (premier affichage, « Afficher plus »). Une
  // ligne absente de ce lot vient d'être enregistrée : elle se déplie en douceur.
  const [batch, setBatch] = useState(() => ({
    ids: new Set(entrance === "cascade" ? rows.slice(0, PAGE_SIZE).map((row) => row.id) : []),
    offset: 0,
  }));

  const shown = rows.slice(0, visible);
  const remaining = rows.length - shown.length;
  const year = yearOf(today);

  const showMore = () => {
    setBatch({ ids: new Set(rows.slice(visible, visible + PAGE_SIZE).map((row) => row.id)), offset: visible });
    setVisible(visible + PAGE_SIZE);
  };

  return (
    <>
      <div role="table" aria-label="Entrées et sorties" className={TABLE}>
        <div role="row" className={HEAD_ROW}>
          <span role="columnheader" className={HEAD_CELL}>
            Date
          </span>
          <span role="columnheader" className={HEAD_CELL}>
            Qui
          </span>
          <span role="columnheader" className={HEAD_CELL}>
            Catégorie
          </span>
          <span role="columnheader" className={HEAD_CELL}>
            Paiement
          </span>
          <span role="columnheader" className={clsx(HEAD_CELL, "text-right")}>
            Montant
          </span>
          <span role="columnheader" className={clsx(HEAD_CELL, "text-right")}>
            Reçu
          </span>
          <span role="columnheader" className="sr-only">
            Actions
          </span>
        </div>

        <AnimatePresence initial={false}>
          {shown.map((row, index) => {
            const cascade = batch.ids.has(row.id);
            return (
              <motion.div
                key={row.id}
                role="row"
                tabIndex={-1}
                data-row={row.id}
                data-cancelled={row.cancelled ? "" : undefined}
                initial={cascade ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={SOFT_TRANSITION}
                style={
                  cascade
                    ? ({ "--i": Math.min(index - batch.offset, MAX_CASCADE), "--stagger-base": "140ms" } as CSSProperties)
                    : undefined
                }
                className={clsx(ROW, cascade && "animate-rise stagger-i")}
              >
                <MovementCells row={row} year={year} onCancel={onCancel} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {remaining > 0 ? (
        <div className="flex justify-center border-t border-divider pt-5">
          <Button variant="secondary" size="sm" onClick={showMore}>
            Afficher plus{" "}
            <span className="font-normal text-muted">
              ({remaining} {remaining > 1 ? "restants" : "restant"})
            </span>
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Précision sous le nom : le libellé du paiement, s'il dit autre chose que la catégorie. */
function detailOf(row: TransactionView): string | null {
  if (row.type === "EXPENSE") return null;
  const prefix = `${row.categoryName} · `;
  const text = row.label.startsWith(prefix) ? row.label.slice(prefix.length) : row.label;
  const key = searchKey(text);
  return key === "" || key === searchKey(row.categoryName) || key === searchKey(row.who) ? null : text;
}

function MovementCells({
  row,
  year,
  onCancel,
}: {
  row: TransactionView;
  year: number;
  onCancel: (transaction: TransactionView) => void;
}) {
  const income = row.type === "INCOME";
  const detail = detailOf(row);
  const day = yearOf(row.day) === year ? formatDay(row.day) : formatDayWithYear(row.day);
  const amount = formatSignedEuros(income ? row.amountCents : -row.amountCents);

  return (
    <>
      <div role="cell" className={clsx("whitespace-nowrap text-sm text-muted [grid-area:2/1] @3xl:text-ink", CELL)}>
        {day}
      </div>

      <div role="cell" className={clsx("min-w-0 [grid-area:1/1/auto/span_2]", CELL)}>
        <p className="break-words font-medium leading-snug">
          {row.memberId ? (
            <Link href={memberHref(row.memberId)} className="text-ink no-underline hover:text-accent">
              {row.who}
            </Link>
          ) : (
            row.who
          )}
        </p>
        {detail ? <p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{detail}</p> : null}
      </div>

      <div role="cell" className={clsx("mt-1.5 min-w-0 [grid-area:3/1/auto/span_2] @3xl:mt-0 @3xl:py-[15px]", CELL_BASE)}>
        <Badge tone={categoryTone(row.categoryColor)} className="max-w-full">
          <span className="truncate">{row.categoryName}</span>
        </Badge>
      </div>

      <div
        role="cell"
        className={clsx(
          "-ml-1 min-w-0 text-sm text-muted [grid-area:2/2/auto/span_3] before:mr-1.5 before:content-['·'] @3xl:ml-0 @3xl:whitespace-nowrap @3xl:before:content-none",
          CELL,
        )}
      >
        {row.methodLabel}
        {row.chequeNumber ? (
          <span className="text-[13px] text-faint @3xl:block">
            <span className="@3xl:hidden"> · </span>n° {row.chequeNumber}
          </span>
        ) : null}
      </div>

      <div
        role="cell"
        className={clsx(
          "flex flex-col items-end gap-1 self-start whitespace-nowrap [grid-area:1/3/auto/span_2] @3xl:self-center",
          CELL_BASE,
          // Montant barré + pastille « Annulé » : un peu moins de marge pour garder la hauteur des autres lignes.
          row.cancelled ? "@3xl:py-3" : "@3xl:py-[18px]",
        )}
      >
        {row.cancelled ? (
          <>
            <s className="font-semibold tabular-nums text-muted">{amount}</s>
            <Badge tone="neutral">Annulé</Badge>
          </>
        ) : (
          <span className={clsx("font-semibold tabular-nums", income ? "text-income" : "text-accent")}>{amount}</span>
        )}
      </div>

      <div role="cell" className={clsx("mt-1.5 justify-self-end [grid-area:3/3] @3xl:mt-0 @3xl:text-right", CELL_BASE)}>
        {row.receipt ? (
          <a
            href={receiptPdfHref(row.receipt.id)}
            target="_blank"
            rel="noopener"
            aria-label={`Reçu n° ${row.receipt.number} (PDF, nouvel onglet)`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center text-sm @3xl:min-w-0"
          >
            PDF
          </a>
        ) : (
          <span className="hidden text-sm text-faint @3xl:inline">
            <span aria-hidden="true">—</span>
            <span className="sr-only">Pas de reçu</span>
          </span>
        )}
      </div>

      <div role="cell" className="mt-1.5 justify-self-end [grid-area:3/4] @3xl:mt-0 @3xl:pl-1 @3xl:[grid-area:auto]">
        {row.cancelled ? null : (
          <button
            type="button"
            className={ICON_BUTTON}
            title="Annuler ce mouvement"
            aria-label={`Annuler ce mouvement : ${row.who}, ${day}, ${amount}`}
            onClick={() => onCancel(row)}
          >
            <CancelIcon size={18} />
          </button>
        )}
      </div>
    </>
  );
}
