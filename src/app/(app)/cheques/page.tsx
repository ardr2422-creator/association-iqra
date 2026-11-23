import { Suspense } from "react";
import type { Metadata } from "next";
import { ChequeBoard } from "@/components/cheques/cheque-board";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listInstallments } from "@/lib/data/installments";

export const metadata: Metadata = { title: "Chèques" };

export default function ChequesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Chèques"
        description="Les échéances des paiements en plusieurs fois, triées par date."
      />
      <Suspense fallback={<ChequesSkeleton />}>
        <ChequesContent />
      </Suspense>
    </div>
  );
}

async function ChequesContent() {
  const { today, pending, cashed } = await listInstallments();
  return <ChequeBoard today={today} pending={pending} cashed={cashed} />;
}

/** Blocs d'attente aux dimensions du vrai contenu : rien ne saute à l'arrivée des données. */
function ChequesSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4 xl:gap-5">
        <span role="status" className="sr-only">
          Chargement des chèques…
        </span>
        <Skeleton className="h-[74px] rounded-card sm:h-[132px] desk:h-[140px]" />
        <Skeleton className="h-[74px] rounded-card sm:h-[132px] desk:h-[140px]" />
        <Skeleton className="h-[74px] rounded-card sm:h-[132px] desk:h-[140px]" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 sm:gap-2">
          <Skeleton className="h-10 w-[116px] rounded-full sm:w-[132px]" />
          <Skeleton className="h-10 w-[92px] rounded-full sm:w-[100px]" />
          <Skeleton className="h-10 w-[112px] rounded-full sm:w-[124px]" />
        </div>
        <Skeleton className="h-[46px] w-full rounded-control desk:w-[280px]" />
      </div>
      <Skeleton className="h-[720px] rounded-card" />
    </>
  );
}
