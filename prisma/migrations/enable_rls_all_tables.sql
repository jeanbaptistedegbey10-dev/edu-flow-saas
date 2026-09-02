-- =============================================================================
-- EduFlow — Activation de Row Level Security (RLS) sur toutes les tables publiques
-- =============================================================================
-- Sécurité : corrige l'alerte Supabase / Vercel « RLS Disabled in Public ».
-- Active RLS sur l'ensemble des tables du schéma `public` sans modifier les
-- politiques existantes (aucune policy n'est créée ici — chaque modèle définit
-- ses propres politiques via Supabase Dashboard ou migrations ultérieures).
--
-- Idempotent : peut être rejoué sans risque.
-- =============================================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
    END LOOP;
END $$;
