import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ReceiptBoard } from "@/components/receipts/receipt-board";
import { Skeleton } from "@/components/ui/skeleton";
import { listReceipts } from "@/lib/data/receipts";
import { todayIsoDay } from "@/lib/days";

export const metadata: Metadata = { title: "Reçus" };

export default function ReceiptsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reçus"
        description="Chaque encaissement génère un reçu numéroté. Vous pouvez les rouvrir ou les télécharger à tout moment."
      />
      <Suspense fallback={<ReceiptsSkeleton />}>
        <ReceiptsContent />
      </Suspense>
    </div>
  );
}

async function ReceiptsContent() {
  const receipts = await listReceipts();
  return <ReceiptBoard receipts={receipts} today={todayIsoDay()} />;
}

function ReceiptsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        Chargement des reçus…
      </span>
      <Skeleton className="h-[46px] w-full rounded-control desk:w-[280px]" />
      <Skeleton className="h-[560px] rounded-card" />
    </div>
  );
}
