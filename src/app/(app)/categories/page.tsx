import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listCategories } from "@/lib/data/categories";
import { CategoryBoard } from "./category-board";

export const metadata: Metadata = { title: "Catégories" };

export default function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catégories"
        description="Elles servent à classer chaque entrée et chaque sortie. Vous pouvez en ajouter, les renommer ou changer leur couleur à tout moment."
      />
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </div>
  );
}

async function CategoriesContent() {
  const categories = await listCategories();
  return <CategoryBoard categories={categories} />;
}

function CategoriesSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
      <span role="status" className="sr-only">
        Chargement des catégories…
      </span>
      <Skeleton className="h-[430px] rounded-card" />
      <Skeleton className="h-[374px] rounded-card xl:h-[430px]" />
    </div>
  );
}
