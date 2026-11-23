import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import type { Metadata } from "next";
import { MovementsBoard, type MovementsIntent } from "@/components/movements/movements-board";
import { MovementsHeaderActions, MovementsProvider } from "@/components/movements/movements-context";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listCategories } from "@/lib/data/categories";
import { listMemberOptions } from "@/lib/data/members";
import { listTransactions, TRANSACTIONS_LIMIT } from "@/lib/data/transactions";
import { todayIsoDay } from "@/lib/days";
import { idSchema } from "@/lib/validation";
import type { MemberOption } from "@/lib/views";

export const metadata: Metadata = { title: "Entrées & sorties" };

type SearchParams = PageProps<"/mouvements">["searchParams"];

export default function MovementsPage({ searchParams }: PageProps<"/mouvements">) {
  return (
    <MovementsProvider>
      <div className="flex flex-col gap-6">
        <PageHeader title="Entrées & sorties" actions={<MovementsHeaderActions />} />
        <Suspense fallback={<MovementsSkeleton />}>
          <MovementsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </MovementsProvider>
  );
}

/**
 * `?nouveau=encaissement` (éventuellement `&adherent=<id>`) ou `?nouveau=depense` :
 * formulaire à ouvrir en arrivant. Tout ce qui vient de l'adresse est vérifié.
 */
function readIntent(params: Awaited<SearchParams>, members: MemberOption[]): MovementsIntent {
  if (params.nouveau === "depense") return { kind: "expense", token: randomUUID() };
  if (params.nouveau !== "encaissement") return null;
  const id = idSchema.safeParse(params.adherent);
  const memberId = id.success && members.some((member) => member.id === id.data) ? id.data : null;
  return { kind: "income", memberId, token: randomUUID() };
}

async function MovementsContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, { items, truncated }, categories, members] = await Promise.all([
    searchParams,
    listTransactions(),
    listCategories(),
    listMemberOptions(),
  ]);
  // Après les lectures liées à la requête : la date du jour à Paris.
  const today = todayIsoDay();
  const active = categories.filter((category) => !category.archived);

  return (
    <MovementsBoard
      transactions={items}
      truncated={truncated}
      limit={TRANSACTIONS_LIMIT}
      incomeCategories={active.filter((category) => category.type === "INCOME")}
      expenseCategories={active.filter((category) => category.type === "EXPENSE")}
      members={members}
      today={today}
      intent={readIntent(params, members)}
    />
  );
}

/** Blocs d'attente aux dimensions du contenu : filtres, résumé, carte du tableau. */
function MovementsSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <span role="status" className="sr-only">
          Chargement des mouvements…
        </span>
        <div className="flex flex-col gap-3 desk:flex-row desk:items-start desk:justify-between">
          <div className="flex gap-2.5 overflow-hidden">
            <Skeleton className="h-10 w-[62px] shrink-0 rounded-full" />
            <Skeleton className="h-10 w-[104px] shrink-0 rounded-full" />
            <Skeleton className="h-10 w-[132px] shrink-0 rounded-full" />
            <Skeleton className="h-10 w-[76px] shrink-0 rounded-full" />
            <Skeleton className="h-10 w-[100px] shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-[46px] w-full rounded-control desk:w-[280px]" />
        </div>
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[720px] rounded-card" />
    </>
  );
}
