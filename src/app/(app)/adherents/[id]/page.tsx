import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberSheet } from "@/components/members/member-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getMember } from "@/lib/data/members";

export const metadata: Metadata = { title: "Fiche adhérent" };

export default function MemberPage({ params }: PageProps<"/adherents/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <p className="animate-rise text-sm">
        <Link href="/adherents" className="-my-2.5 inline-flex min-h-10 items-center no-underline">
          ← Tous les adhérents
        </Link>
      </p>
      <Suspense fallback={<MemberSkeleton />}>
        <MemberContent params={params} />
      </Suspense>
    </div>
  );
}

async function MemberContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // `getMember` vérifie la session et la forme de l'identifiant ; inconnu ou mal formé : page 404.
  const member = await getMember(id);
  if (!member) notFound();
  return <MemberSheet member={member} />;
}

/** Blocs d'attente aux dimensions de la fiche : en-tête, trois chiffres, échéancier, historique. */
function MemberSkeleton() {
  return (
    <>
      <div className="flex items-center gap-[18px]">
        <span role="status" className="sr-only">
          Chargement de la fiche…
        </span>
        <Skeleton className="size-16 shrink-0 rounded-card" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-[18px] w-72 max-w-[60vw]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
        <Skeleton className="h-[118px] rounded-card xl:h-[126px]" />
        <Skeleton className="h-[118px] rounded-card xl:h-[126px]" />
        <Skeleton className="h-[118px] rounded-card sm:col-span-2 xl:col-span-1 xl:h-[126px]" />
      </div>
      <Skeleton className="h-[330px] rounded-card" />
      <Skeleton className="h-[300px] rounded-card" />
    </>
  );
}
