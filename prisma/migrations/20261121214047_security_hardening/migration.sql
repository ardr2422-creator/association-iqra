-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempts_key_created_at_idx" ON "login_attempts"("key", "created_at");

-- ---------------------------------------------------------------------------
-- Ajouts écrits à la main
-- ---------------------------------------------------------------------------

-- Même verrou que les autres tables : aucune lecture par l'API publique.
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;

-- Fonctions : Postgres autorise par défaut tout le monde (PUBLIC) à exécuter une
-- fonction, et les rôles de l'API publique en héritent. On retire ce droit pour
-- les fonctions existantes et pour toutes celles créées plus tard par ce rôle.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
