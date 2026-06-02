-- ============================================================
-- SOLIDBASE CONSULTING — Supabase Setup SQL
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- 1. CREATE assessment_requests TABLE
CREATE TABLE IF NOT EXISTS assessment_requests (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              TIMESTAMPTZ DEFAULT now(),
  status                  TEXT        NOT NULL DEFAULT 'new',

  selected_tier           TEXT        NOT NULL,

  full_name               TEXT        NOT NULL,
  email                   TEXT        NOT NULL,
  phone                   TEXT        NOT NULL,
  country_of_residence    TEXT        NOT NULL,
  referral_source         TEXT,

  plot_address            TEXT        NOT NULL,
  estate_name             TEXT,
  lga                     TEXT        NOT NULL,
  plot_size               TEXT,
  survey_plan_number      TEXT,
  title_number            TEXT,
  number_of_plots         INTEGER,
  acquisition_method      TEXT,
  seller_agent_name       TEXT,

  concerns                JSONB       DEFAULT '[]'::jsonb,
  other_concerns          TEXT,
  preferred_call_datetime TEXT,
  uploaded_documents      JSONB       DEFAULT '[]'::jsonb,
  consent_given           BOOLEAN     NOT NULL DEFAULT false
);


-- 2. ENABLE ROW LEVEL SECURITY
ALTER TABLE assessment_requests ENABLE ROW LEVEL SECURITY;

-- Anon key can INSERT only — never read, update, or delete
CREATE POLICY "anon_can_insert" ON assessment_requests
  FOR INSERT TO anon
  WITH CHECK (true);


-- 3. STORAGE BUCKET
-- If this fails, create it manually: Storage → New Bucket → "assessment-documents" → Private
INSERT INTO storage.buckets (id, name, public)
VALUES ('assessment-documents', 'assessment-documents', false)
ON CONFLICT (id) DO NOTHING;


-- 4. STORAGE RLS — anon can upload, cannot read or list
CREATE POLICY "anon_can_upload_docs"
  ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'assessment-documents');
