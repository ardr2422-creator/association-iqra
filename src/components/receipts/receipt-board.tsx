"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ReceiptIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { yearOf } from "@/lib/days";
import { formatDayWithYear, formatEuros, plural } from "@/lib/format";
import { memberHref, newIncomeHref, receiptPdfHref } from "@/lib/routes";
import { matchesSearch } from "@/lib/search";
import type { ReceiptListItem } from "@/lib/views";

const PAGE_SIZE = 50;
/** Au-delà de ce rang, les lignes arrivent ensemble : la cascade reste courte. */
const CASCADE_MAX_INDEX = 12;

function cascade(index: number): CSSProperties {
  return { "--i": Math.min(index, CASCADE_MAX_INDEX), "--stagger-base": "120ms" } as CSSProperties;
}

export function ReceiptBoard({ receipts, today }: { receipts: ReceiptListItem[]; today: string }) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (receipts.length === 0) {
    return (
      <Card className="animate-rise stagger-1">
        <EmptyState
          icon={ReceiptIcon}
          title="Aucun reçu pour l'instant"
          description="Les reçus sont créés automatiquement : chaque encaissement enregistré reçoit le sien, numéroté à la suite."
          action={<ButtonLink href={newIncomeHref()}>+ Encaissement</ButtonLink>}
        />
      </Card>
    );
  }

  const years = [...new Set(receipts.map((receipt) => yearOf(receipt.issuedDay)))].sort((a, b) => b - a);
  const filtered = receipts.filter(
    (receipt) =>
      (year === null || yearOf(receipt.issuedDay) === year) &&
      matchesSearch(query, receipt.number, receipt.payerName, receipt.designation, formatDayWithYear(receipt.issuedDay)),
  );
  const visible = filtered.slice(0, limit);
  const total = filtered.filter((receipt) => !receipt.cancelled).reduce((sum, receipt) => sum + receipt.amountCents, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex animate-rise flex-wrap items-center gap-2.5 stagger-1">
        {years.length > 1 ? (
          <div role="group" aria-label="Filtrer par année" className="flex flex-wrap gap-2.5">
            <Chip selected={year === null} onClick={() => { setYear(null); setLimit(PAGE_SIZE); }}>
              Tout
            </Chip>
            {years.map((value) => (
              <Chip key={value} selected={year === value} onClick={() => { setYear(value); setLimit(PAGE_SIZE); }}>
                {value}
              </Chip>
            ))}
          </div>
        ) : null}
        <p className="text-sm text-muted" aria-live="polite">
          {plural(filtered.length, "reçu")} · {formatEuros(total)}
        </p>
        <div className="hidden flex-1 desk:block" />
        <SearchField
          label="Rechercher un reçu"
          placeholder="Rechercher un numéro, un nom…"
          value={query}
          onChange={(value) => { setQuery(value); setLimit(PAGE_SIZE); }}
        />
      </div>

      <Card as="section" aria-label="Liste des reçus" className="@container animate-rise stagger-2">
        {filtered.length === 0 ? (
          <EmptyState
            title="Aucun reçu ne correspond"
            description="Essayez un autre numéro, un autre nom, ou effacez la recherche."
            action={
              <Button variant="secondary" size="sm" onClick={() => { setQuery(""); setYear(null); }}>
                Effacer la recherche
              </Button>
            }
          />
        ) : (
          <>
            <div aria-hidden="true" className="hidden grid-cols-[104px_116px_minmax(0,1.1fr)_minmax(0,1.3fr)_112px_196px] gap-x-4 px-1 pb-3.5 text-[13px] font-medium text-muted @3xl:grid">
              <span>N°</span>
              <span>Date</span>
              <span>Reçu de</span>
              <span>Désignation</span>
              <span className="text-right">Montant</span>
              <span />
            </div>
            <ul>
              {visible.map((receipt, index) => (
                <li
                  key={receipt.id}
                  style={cascade(index)}
                  className={clsx(
                    "grid animate-rise grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-divider px-1 py-4 stagger-i",
                    "@3xl:grid-cols-[104px_116px_minmax(0,1.1fr)_minmax(0,1.3fr)_112px_196px]",
                  )}
                >
                  <p className={clsx("font-semibold tabular-nums", receipt.cancelled && "text-muted")}>
                    <span className="sr-only">Reçu n° </span>
                    {receipt.number}
                  </p>
                  <p className="text-right text-[15px] text-muted @3xl:text-left">
                    {formatDayWithYear(receipt.issuedDay)}
                  </p>
                  <p className="col-span-2 min-w-0 truncate font-medium @3xl:col-span-1">
                    {receipt.memberId ? (
                      <Link href={memberHref(receipt.memberId)} className="text-ink no-underline hover:text-accent">
                        {receipt.payerName}
                      </Link>
                    ) : (
                      receipt.payerName
                    )}
                  </p>
                  <p className="col-span-2 min-w-0 truncate text-[15px] text-muted @3xl:col-span-1">
                    {receipt.designation}
                  </p>
                  <p className="col-span-2 flex items-center gap-2 @3xl:col-span-1 @3xl:justify-end">
                    <span className={clsx("font-semibold tabular-nums", receipt.cancelled ? "text-muted line-through" : "text-income")}>
                      {formatEuros(receipt.amountCents)}
                    </span>
                    {receipt.cancelled ? <Badge tone="neutral">Annulé</Badge> : null}
                  </p>
                  <p className="col-span-2 flex gap-1 @3xl:col-span-1 @3xl:justify-end">
                    <a
                      href={receiptPdfHref(receipt.id)}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Ouvrir le reçu n° ${receipt.number} (PDF, nouvel onglet)`}
                      className={buttonClasses("secondary", "sm")}
                    >
                      Ouvrir
                    </a>
                    <a
                      href={`${receiptPdfHref(receipt.id)}?telecharger=1`}
                      download
                      aria-label={`Télécharger le reçu n° ${receipt.number}`}
                      className={buttonClasses("ghost", "sm")}
                    >
                      Télécharger
                    </a>
                  </p>
                </li>
              ))}
            </ul>
            {filtered.length > visible.length ? (
              <div className="flex justify-center border-t border-divider pt-5">
                <Button variant="secondary" size="sm" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                  Afficher plus ({filtered.length - visible.length} restants)
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      <p className="text-[13px] text-muted">
        Un reçu reste tel qu&apos;il a été émis, même si l&apos;adhérent ou les paramètres changent ensuite.
        {yearOf(today) ? " La numérotation repart à 0001 chaque année." : ""}
      </p>
    </div>
  );
}
