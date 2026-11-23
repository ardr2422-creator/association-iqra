import "server-only";
import { refresh } from "next/cache";
import { todayIsoDay } from "@/lib/days";
import { getDb } from "@/lib/db";
import { isDomainError } from "@/lib/services/errors";
import { lockMoney, type Tx } from "@/lib/services/money";
import { UNEXPECTED, type ActionResult } from "@/lib/validation";

/**
 * Exécute une écriture comptable dans une transaction verrouillée, puis
 * rafraîchit la page. À appeler depuis une action serveur, après
 * `requireUser()` et la validation des données reçues.
 *
 * Un refus métier (`DomainError`) devient un message lisible ; toute autre
 * erreur est journalisée côté serveur et remplacée par un message générique.
 */
export async function runMoney<T extends object>(
  scope: string,
  work: (tx: Tx, today: string) => Promise<T>,
  options?: { timeout?: number },
): Promise<ActionResult<T>> {
  let result: T;
  try {
    const today = todayIsoDay();
    result = await getDb().$transaction(async (tx) => {
      await lockMoney(tx);
      return work(tx, today);
    }, options);
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    console.error(`[${scope}] écriture impossible`, error);
    return { ok: false, message: UNEXPECTED };
  }
  refresh();
  return { ok: true, ...result };
}
