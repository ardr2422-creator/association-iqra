import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { CalendarIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Calendrier" };

export default function Page() {
  return (
    <ComingSoon
      title="Calendrier"
      icon={CalendarIcon}
      description="La vue mensuelle des encaissements prévus."
      features={[
        "Un mois par écran, avec les chèques à encaisser chaque jour",
        "Les retards et les échéances de la semaine d'un coup d'œil",
      ]}
    />
  );
}
