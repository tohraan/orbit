-- 016 — the Dossier: what a student keeps, and what we read from it.
--
-- db/015 created `student_documents` with the right bones (owner, path, kind,
-- parsed_at, parsed jsonb) plus RLS and a private per-owner storage bucket.
-- This migration adds only what the feature needs on top, because 015 is
-- shipped and migrations here are append-only.
--
-- THE SHAPE OF `extracted` AND `applied`, and why they are two columns.
--
-- Parsing a CV produces a CLAIM ("this document mentions robotics"), not a
-- fact about the student. Writing claims straight into the profile would mean
-- the matcher silently re-ranks on something nobody agreed to, and a student
-- who saw their results change could not find out why. So:
--
--   extracted  what the parser found, with the sentence it came from.
--              Never read by the matcher. Reviewable, and discardable.
--   applied    the subset the student explicitly confirmed. THIS is what
--              reaches the profile.
--
-- One is evidence, the other is consent, and keeping them apart is what makes
-- "we read your CV" an offer rather than a surprise.
--
--   extracted = {
--     "terms":  [{"term":"robotics","evidence":"Built a robotics…","reach":12}],
--     "level":  {"value":"masters","evidence":"M.Sc. candidate"} | null,
--     "chars":  8412,
--     "pages":  2,
--     "engine": "pdfjs-text-layer" | "plain-text"
--   }
--   applied   = {"terms":["robotics"],"level":"masters","at":"2026-10-03T…"}

alter table student_documents add column if not exists label        text;
alter table student_documents add column if not exists extracted    jsonb;
alter table student_documents add column if not exists applied      jsonb;

-- Why a document was not read, said out loud rather than left as a null that
-- the UI has to guess at. 'stored' is the honest state for a JPG or a .docx:
-- we keep it, we did not read it, and the interface says exactly that.
--   pending | parsed | no_text | unsupported | failed | stored
alter table student_documents add column if not exists parse_status text not null default 'pending';

alter table student_documents add column if not exists page_count   int;

-- A student uploading the same file twice means to replace it, not to collect
-- two. Scoped to the owner: two students may of course upload identical files.
alter table student_documents add column if not exists content_hash text;
create unique index if not exists student_documents_owner_hash
  on student_documents (student_id, content_hash)
  where content_hash is not null;

-- The list view reads (owner, kind) constantly; the index from 015 is on
-- (student_id, uploaded_at desc) and does not serve it.
create index if not exists student_documents_by_kind
  on student_documents (student_id, kind);

-- 015's `_own` policy is `for all using (auth.uid() = student_id)`, which
-- already covers every column added here. Nothing to re-grant: a column added
-- to an RLS-protected table inherits the table's policies.
