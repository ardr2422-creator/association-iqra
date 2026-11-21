import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { MembersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Adhérents" };

export default function Page() {
  return (
    <ComingSoon
      title="Adhérents"
      icon={MembersIcon}
      description="Les familles et adhérents de l'association."
      features={[
        "La liste des familles avec leurs coordonnées",
        "La fiche de chaque adhérent : total versé, reste à payer, inscriptions",
        "L'échéancier des chèques et l'historique des paiements, avec un lien vers chaque reçu",
      ]}
    />
  );
}
