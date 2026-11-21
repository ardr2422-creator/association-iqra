-- Verrouillage de l'API publique de Supabase (écrit à la main).
--
-- Supabase expose automatiquement le schéma « public » par une API web, utilisable
-- avec la clé « publishable » (rôles Postgres `anon` et `authenticated`).
-- L'application n'utilise PAS cette API : elle passe par Prisma, côté serveur.
-- On retire donc tout droit à ces deux rôles, en plus du RLS déjà activé :
-- deux verrous indépendants valent mieux qu'un.
--
-- Sur un Postgres local, ces rôles n'existent pas : le bloc ne fait alors rien.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      -- Les tables créées plus tard (par le rôle qui exécute les migrations)
      -- naîtront elles aussi sans aucun droit pour l'API publique.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
