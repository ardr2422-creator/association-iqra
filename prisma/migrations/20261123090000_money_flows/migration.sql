-- Encaissements, dépenses, échéanciers et reçus (étapes 3 à 8).

-- Payeur d'une entrée qui n'est pas un adhérent.
ALTER TABLE "transactions" ADD COLUMN "payer_name" TEXT;

-- Contenu figé du reçu (la table est encore vide : aucun reçu n'a été émis).
ALTER TABLE "receipts" ADD COLUMN "snapshot" JSONB NOT NULL;

-- Solde de départ et mode démonstration.
ALTER TABLE "settings" ADD COLUMN "opening_balance_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "settings" ADD COLUMN "demo_mode" BOOLEAN NOT NULL DEFAULT false;

-- Garde-fous : un encaissement d'échéance garde sa date, une échéance encaissée a sa date.
ALTER TABLE "installments" ADD CONSTRAINT "installments_cashed_has_date"
  CHECK (("status" = 'CASHED') = ("cashed_on" IS NOT NULL));
