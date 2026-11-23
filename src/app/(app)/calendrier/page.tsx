import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarBoard } from "@/components/calendar/calendar-board";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listMonthInstallments } from "@/lib/data/installments";

export const metadata: Metadata = { title: "Calendrier" };

export default function CalendarPage({ searchParams }: PageProps<"/calendrier">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendrier"
        description="Les encaissements prévus, mois par mois : chèques à déposer, en retard ou déjà encaissés."
      />
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CalendarContent({ searchParams }: Pick<PageProps<"/calendrier">, "searchParams">) {
  const { mois } = await searchParams;
  // Mois absent ou invalide : on affiche le mois en cours.
  const data =
    (typeof mois === "string" ? await listMonthInstallments(mois) : null) ?? (await listMonthInstallments(undefined));
  if (!data) return null;
  return <CalendarBoard key={data.month} month={data.month} today={data.today} items={data.items} />;
}

function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <span role="status" className="sr-only">
        Chargement du calendrier…
      </span>
      <Skeleton className="h-[46px] w-full max-w-[520px] rounded-control" />
      <Skeleton className="hidden h-[640px] rounded-card desk:block" />
      <Skeleton className="h-[420px] rounded-card" />
    </div>
  );
}
