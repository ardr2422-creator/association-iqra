import "server-only";
import { requireUser } from "@/lib/auth/dal";
import type { CategoryItem } from "@/lib/categories";
import { getDb } from "@/lib/db";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Toutes les catégories (archivées comprises), triées par nom. */
export async function listCategories(): Promise<CategoryItem[]> {
  await requireUser();

  const rows = await getDb().category.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      color: true,
      archivedAt: true,
      _count: { select: { transactions: true, paymentPlans: true } },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      color: row.color,
      archived: row.archivedAt !== null,
      usageCount: row._count.transactions + row._count.paymentPlans,
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}
