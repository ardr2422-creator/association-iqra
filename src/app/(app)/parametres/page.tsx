import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { SettingsIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Paramètres" };

export default function Page() {
  return (
    <ComingSoon
      title="Paramètres"
      icon={SettingsIcon}
      description="Les informations de l'association, reprises sur les reçus."
      features={[
        "Adresse, email, téléphone, numéro RNA et nom du trésorier",
        "L'option « reçu fiscal pour les dons », désactivée tant que l'association ne l'a pas confirmée",
      ]}
    />
  );
}
