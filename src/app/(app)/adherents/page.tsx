import { Suspense } from "react";
import type { Metadata } from "next";
import { MemberBoard } from "@/components/members/member-board";
import { NewMemberButton } from "@/components/members/member-form";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers } from "@/lib/data/members";
import { todayIsoDay } from "@/lib/days";

export const metadata: Metadata = { title: "Adhérents" };

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Adhérents"
        description="Les familles et les adhérents de l'association : ce qu'ils ont versé, ce qu'il leur reste à payer et leurs chèques à venir."
        actions={<NewMemberButton />}
      />
      <Suspense fallback={<MembersSkeleton />}>
        <MembersContent />
      </Suspense>
    </div>
  );
}

async function MembersContent() {
  const members = await listMembers();
  // La lecture ci-dessus dépend de la requête : la date du jour peut être lue ici.
  return <MemberBoard members={members} today={todayIsoDay()} />;
}

/** Blocs d'attente aux dimensions de la barre de recherche et de la liste. */
function MembersSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <span role="status" className="sr-only">
          Chargement des adhérents…
        </span>
        <Skeleton className="h-[22px] w-28" />
        <Skeleton className="h-[46px] w-full rounded-control desk:w-[280px]" />
      </div>
      <Skeleton className="h-[620px] rounded-card" />
    </>
  );
}
