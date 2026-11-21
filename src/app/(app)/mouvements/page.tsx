import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { TransfersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Entrées & sorties" };

export default function Page() {
  return (
    <ComingSoon
      title="Entrées & sorties"
      icon={TransfersIcon}
      description="Tous les mouvements de l'association, au même endroit."
      features={[
        "Le tableau de toutes les entrées et sorties, avec recherche et filtres par catégorie",
        "Les boutons « + Encaissement » et « + Dépense »",
        "Le paiement en 1, 2, 3 ou 4 fois, avec création automatique des échéances de chèques",
      ]}
    />
  );
}
