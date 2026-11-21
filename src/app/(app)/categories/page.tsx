import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { CategoriesIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Catégories" };

export default function Page() {
  return (
    <ComingSoon
      title="Catégories"
      icon={CategoriesIcon}
      description="Les catégories d'entrées et de sorties, modifiables à tout moment."
      features={[
        "Créer, renommer et supprimer une catégorie",
        "Au départ : Dons, Adhésions, Cours d'anglais, Cours d'arabe, Soutien scolaire, Sorties",
        "Quelques catégories de dépenses génériques",
      ]}
    />
  );
}
