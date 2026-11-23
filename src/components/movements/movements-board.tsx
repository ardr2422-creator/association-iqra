"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TransfersIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import type { CategoryItem } from "@/lib/categories";
import { formatEuros, plural } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import type { MemberOption, TransactionView } from "@/lib/views";
import { CancelMovement } from "./cancel-movement";
import { ExpenseForm } from "./expense-form";
import { IncomeForm } from "./income-form";
import { useMovementsDialog } from "./movements-context";
import { MovementsTable } from "./movements-table";

/**
 * Formulaire à ouvrir à l'arrivée sur la page (`?nouveau=…`). Le jeton change
 * à chaque rendu du serveur : une même demande n'ouvre la fenêtre qu'une fois.
 */
export type MovementsIntent =
  | { kind: "income"; memberId: string | null; token: string }
  | { kind: "expense"; token: string }
  | null;

type MovementsBoardProps = {
  transactions: TransactionView[];
  /** Le serveur n'a envoyé que les `limit` mouvements les plus récents. */
  truncated: boolean;
  limit: number;
  incomeCategories: CategoryItem[];
  expenseCategories: CategoryItem[];
  members: MemberOption[];
  today: string;
  intent: MovementsIntent;
};

const ALL = "all";
const EXPENSES = "expenses";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export function MovementsBoard({
  transactions,
  truncated,
  limit,
  incomeCategories,
  expenseCategories,
  members,
  today,
  intent,
}: MovementsBoardProps) {
  const { content, open, instance, show, close } = useMovementsDialog();
  const router = useRouter();

  // « all », « expenses », ou l'identifiant d'une catégorie d'entrée.
  const [filter, setFilter] = useState(ALL);
  const [query, setQuery] = useState("");
  // Un filtre rejoue l'apparition en cascade ; la recherche met à jour sans animation.
  const [entrance, setEntrance] = useState<"cascade" | "none">("cascade");

  // Lien « + Encaissement » venu d'une autre page : on ouvre le formulaire,
  // puis on retire le paramètre de l'adresse (recharger ne le rouvre pas).
  const handledIntent = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || handledIntent.current === intent.token) return;
    handledIntent.current = intent.token;
    show(intent.kind === "income" ? { kind: "income", memberId: intent.memberId } : { kind: "expense" });
    router.replace("/mouvements", { scroll: false });
  }, [intent, show, router]);

  // Une pastille par catégorie d'entrée présente dans la liste.
  const incomeChips = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of transactions) {
      if (row.type === "INCOME") names.set(row.categoryId, row.categoryName);
    }
    return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name));
  }, [transactions]);

  const activeFilter =
    filter === ALL || filter === EXPENSES || incomeChips.some((chip) => chip.id === filter) ? filter : ALL;

  const rows = useMemo(
    () =>
      transactions.filter((row) => {
        if (activeFilter === EXPENSES ? row.type !== "EXPENSE" : activeFilter !== ALL && row.categoryId !== activeFilter) {
          return false;
        }
        return matchesSearch(query, row.who, row.label, row.categoryName, row.methodLabel, row.chequeNumber);
      }),
    [transactions, activeFilter, query],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cancelled = 0;
    for (const row of rows) {
      if (row.cancelled) cancelled += 1;
      else if (row.type === "INCOME") income += row.amountCents;
      else expense += row.amountCents;
    }
    return { income, expense, cancelled };
  }, [rows]);

  // Après une annulation, le focus revient sur la ligne concernée (son bouton
  // « Annuler » a disparu : sans cela, le focus repartirait en haut de la page).
  const boardRef = useRef<HTMLElement>(null);
  const focusAfterClose = useRef<string | null>(null);
  useEffect(() => {
    if (open || !focusAfterClose.current) return;
    const id = focusAfterClose.current;
    focusAfterClose.current = null;
    const row = [...(boardRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])].find(
      (element) => element.dataset.row === id,
    );
    row?.focus({ preventScroll: true });
  }, [open]);

  const chooseFilter = (next: string) => {
    setEntrance("cascade");
    setFilter(next);
  };
  const resetFilters = () => {
    setEntrance("cascade");
    setFilter(ALL);
    setQuery("");
  };

  // « 42 mouvements · entrées 2 470,00 € · sorties 2 064,15 € » (annulés hors totaux).
  const summary = [
    plural(rows.length, "mouvement") +
      (totals.cancelled > 0 ? ` (dont ${plural(totals.cancelled, "annulé")})` : ""),
    activeFilter === EXPENSES ? null : `entrées ${formatEuros(totals.income)}`,
    activeFilter === ALL || activeFilter === EXPENSES ? `sorties ${formatEuros(totals.expense)}` : null,
  ].filter((part): part is string => part !== null);

  const title =
    content?.kind === "income"
      ? "Nouvel encaissement"
      : content?.kind === "expense"
        ? "Nouvelle dépense"
        : "Annuler ce mouvement";

  return (
    <>
      {transactions.length === 0 ? (
        <Card as="section" className="animate-rise stagger-1">
          <EmptyState
            icon={TransfersIcon}
            title="Aucun mouvement pour l'instant"
            description="Enregistrez un premier encaissement (cours, adhésion, don…) ou une première dépense : ils apparaîtront ici, du plus récent au plus ancien."
            action={
              <>
                <Button size="sm" onClick={() => show({ kind: "income", memberId: null })}>
                  Enregistrer un encaissement
                </Button>
                <Button size="sm" variant="secondary" onClick={() => show({ kind: "expense" })}>
                  Enregistrer une dépense
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex animate-rise flex-col gap-3 stagger-1">
            <div className="flex flex-col gap-3 desk:flex-row desk:items-start desk:gap-2.5">
              <div
                role="group"
                aria-label="Filtrer par catégorie"
                className="-mx-5 -my-1 flex gap-2.5 overflow-x-auto px-5 py-1 [scrollbar-width:none] desk:m-0 desk:flex-1 desk:flex-wrap desk:overflow-visible desk:p-0"
              >
                <Chip selected={activeFilter === ALL} onClick={() => chooseFilter(ALL)}>
                  Tout
                </Chip>
                {incomeChips.map((chip) => (
                  <Chip key={chip.id} selected={activeFilter === chip.id} onClick={() => chooseFilter(chip.id)}>
                    {chip.name}
                  </Chip>
                ))}
                <Chip selected={activeFilter === EXPENSES} onClick={() => chooseFilter(EXPENSES)}>
                  Dépenses
                </Chip>
              </div>
              <SearchField
                label="Rechercher un mouvement"
                placeholder="Rechercher un nom, une catégorie…"
                value={query}
                onChange={(value) => {
                  setEntrance("none");
                  setQuery(value);
                }}
              />
            </div>
            <p role="status" className="text-sm tabular-nums text-muted">
              {rows.length === 0
                ? "Aucun mouvement ne correspond"
                : summary.map((part, index) => (
                    // Le retour à la ligne se fait entre deux éléments, jamais au milieu d'un montant.
                    <span key={index} className="inline-block whitespace-pre">
                      {part}
                      {index < summary.length - 1 ? " · " : null}
                    </span>
                  ))}
            </p>
          </div>

          <Card as="section" ref={boardRef} aria-label="Mouvements" className="@container animate-rise stagger-2">
            {rows.length === 0 ? (
              <EmptyState
                title="Aucun résultat"
                description={
                  query.trim()
                    ? `Aucun mouvement ne correspond à «\u00a0${query.trim()}\u00a0». Vérifiez l'orthographe ou élargissez la recherche.`
                    : "Aucun mouvement dans cette catégorie."
                }
                action={
                  <Button size="sm" variant="secondary" onClick={resetFilters}>
                    Tout afficher
                  </Button>
                }
              />
            ) : (
              <MovementsTable
                key={`${activeFilter}|${query}`}
                rows={rows}
                today={today}
                entrance={entrance}
                onCancel={(transaction) => show({ kind: "cancel", transaction })}
              />
            )}
            {truncated ? (
              <p className="mt-4 border-t border-divider pt-4 text-center text-[13px] text-muted">
                Seuls les {new Intl.NumberFormat("fr-FR").format(limit)} mouvements les plus récents sont chargés
                ici. Les plus anciens restent enregistrés.
              </p>
            ) : null}
          </Card>
        </>
      )}

      <Dialog open={open} onClose={close} title={content ? title : ""} size={content?.kind === "cancel" ? "md" : "lg"}>
        {content?.kind === "income" ? (
          <IncomeForm
            key={instance}
            members={members}
            categories={incomeCategories}
            today={today}
            initialMemberId={content.memberId}
            onDone={close}
            onAgain={() => show({ kind: "income", memberId: null })}
          />
        ) : null}
        {content?.kind === "expense" ? (
          <ExpenseForm key={instance} categories={expenseCategories} today={today} onDone={close} />
        ) : null}
        {content?.kind === "cancel" ? (
          <CancelMovement
            key={instance}
            transaction={content.transaction}
            onKeep={close}
            onCancelled={() => {
              focusAfterClose.current = content.transaction.id;
              close();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
