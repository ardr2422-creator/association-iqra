// Charge les données de démonstration dans la base de test (utilisé par les tests).
import { todayIsoDay } from "../../src/lib/days";

async function main() {
  const { getDb } = await import("../../src/lib/db");
  const { lockMoney } = await import("../../src/lib/services/money");
  const { loadDemoData } = await import("../../src/lib/services/demo");
  const db = getDb();
  await db.$transaction(
    async (tx) => {
      await lockMoney(tx);
      await loadDemoData(tx, todayIsoDay());
    },
    { timeout: 60_000 },
  );
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
