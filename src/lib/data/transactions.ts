import "server-only";
import { requireUser } from "@/lib/auth/dal";
import { toTransactionView, transactionSelect } from "@/lib/data/mappers";
import { getDb } from "@/lib/db";
import type { TransactionView } from "@/lib/views";

/** Nombre maximal de mouvements envoyés à la page (les plus récents). */
export const TRANSACTIONS_LIMIT = 1000;

/**
 * Les mouvements (entrées et sorties, annulés compris), du plus récent au
 * plus ancien. La recherche et les filtres se font ensuite dans la page, en
 * JavaScript : aucun texte saisi n'est envoyé à la base comme motif.
 */
export async function listTransactions(): Promise<{ items: TransactionView[]; truncated: boolean }> {
  await requireUser();
  const rows = await getDb().transaction.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: TRANSACTIONS_LIMIT + 1,
    select: transactionSelect,
  });
  return {
    items: rows.slice(0, TRANSACTIONS_LIMIT).map(toTransactionView),
    truncated: rows.length > TRANSACTIONS_LIMIT,
  };
}
