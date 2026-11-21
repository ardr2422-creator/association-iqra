-- CreateEnum
CREATE TYPE "flow_type" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CHEQUE', 'TRANSFER', 'CARD');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "installment_status" AS ENUM ('PLANNED', 'CASHED', 'REJECTED');

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "joined_on" DATE NOT NULL DEFAULT CURRENT_DATE,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "flow_type" NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bordeaux',
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "flow_type" NOT NULL,
    "category_id" TEXT NOT NULL,
    "member_id" TEXT,
    "label" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'COMPLETED',
    "cheque_number" TEXT,
    "bank" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "label" TEXT,
    "participants" INTEGER,
    "total_cents" INTEGER NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "method" "payment_method" NOT NULL DEFAULT 'CHEQUE',
    "cheque_number" TEXT,
    "bank" TEXT,
    "status" "installment_status" NOT NULL DEFAULT 'PLANNED',
    "cashed_on" DATE,
    "transaction_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "payer_name" TEXT NOT NULL,
    "payer_address" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_counters" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "association_name" TEXT NOT NULL DEFAULT 'Association Iqra',
    "address" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "rna" TEXT,
    "treasurer_name" TEXT,
    "reminder_email" TEXT,
    "fiscal_receipts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_name_idx" ON "members"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_type_name_key" ON "categories"("type", "name");

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_member_id_idx" ON "transactions"("member_id");

-- CreateIndex
CREATE INDEX "payment_plans_member_id_idx" ON "payment_plans"("member_id");

-- CreateIndex
CREATE INDEX "payment_plans_category_id_idx" ON "payment_plans"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "installments_transaction_id_key" ON "installments"("transaction_id");

-- CreateIndex
CREATE INDEX "installments_status_due_date_idx" ON "installments"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "installments_plan_id_number_key" ON "installments"("plan_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_transaction_id_key" ON "receipts"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_year_sequence_key" ON "receipts"("year", "sequence");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajouts écrits à la main (Prisma ne les modélise pas)
-- ---------------------------------------------------------------------------

-- Garde-fous comptables.
ALTER TABLE "transactions"  ADD CONSTRAINT "transactions_amount_positive"   CHECK ("amount_cents" > 0);
ALTER TABLE "installments"  ADD CONSTRAINT "installments_amount_positive"   CHECK ("amount_cents" > 0);
ALTER TABLE "installments"  ADD CONSTRAINT "installments_number_range"      CHECK ("number" BETWEEN 1 AND 4);
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_total_positive"   CHECK ("total_cents" > 0);
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_count_range"      CHECK ("installment_count" BETWEEN 1 AND 4);
ALTER TABLE "receipts"      ADD CONSTRAINT "receipts_sequence_positive"     CHECK ("sequence" > 0);
ALTER TABLE "settings"      ADD CONSTRAINT "settings_single_row"            CHECK ("id" = 1);

-- Sécurité Supabase : RLS activé sans aucune règle = accès refusé par défaut via
-- l'API publique de Supabase (clé « publishable »). L'application passe par Prisma,
-- connecté en tant que propriétaire des tables, qui n'est pas concerné par RLS.
ALTER TABLE "members"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_plans"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "installments"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipts"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipt_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings"         ENABLE ROW LEVEL SECURITY;
-- Table de suivi des migrations de Prisma (absente de la base temporaire de vérification).
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
