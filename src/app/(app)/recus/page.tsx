import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { ReceiptIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Reçus" };

export default function Page() {
  return (
    <ComingSoon
      title="Reçus"
      icon={ReceiptIcon}
      description="Les reçus générés, à retélécharger à tout moment."
      features={[
        "Un reçu PDF au format A4 pour chaque encaissement",
        "Une numérotation qui se suit : 2026-0001, 2026-0002…",
        "Le montant en chiffres et en lettres, le moyen de paiement et l'échéancier",
      ]}
    />
  );
}
