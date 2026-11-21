import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { ChequeIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Chèques" };

export default function Page() {
  return (
    <ComingSoon
      title="Chèques"
      icon={ChequeIcon}
      description="Tous les chèques en attente, triés par date."
      features={[
        "Les statuts : prévu, à encaisser, encaissé, rejeté",
        "Le bouton « Marquer comme encaissé »",
        "Les chèques en retard mis en évidence",
      ]}
    />
  );
}
