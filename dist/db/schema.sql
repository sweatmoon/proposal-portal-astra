-- ============================================================
-- PostgreSQL 마이그레이션 (D1/SQLite → PostgreSQL 변환)
-- 실행: tsx src/db/migrate.ts
-- ============================================================

-- ──────────────────────────────────────────
-- 1. personnel (인력 기본정보)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel (
  id                  SERIAL PRIMARY KEY,
  name                TEXT    NOT NULL UNIQUE,
  position            TEXT,
  is_fulltime         INTEGER NOT NULL DEFAULT 1,
  company             TEXT,
  email               TEXT    UNIQUE,
  phone               TEXT,
  birthdate           TEXT,
  auditor_cert_no     TEXT,
  auditor_grade       TEXT,
  tech_grade          TEXT,
  auditor_career_yrs  REAL    DEFAULT 0,
  auditor_start_date  TEXT,
  school              TEXT,
  major               TEXT,
  degree              TEXT,
  career_summary      TEXT,
  career_qualif       TEXT,
  career_project      TEXT,
  career_expert       TEXT,
  education_name      TEXT,
  education_hours     INTEGER DEFAULT 0,
  education_org       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 2. personnel_certifications (자격증)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_certifications (
  id              SERIAL PRIMARY KEY,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  cert_name       TEXT    NOT NULL,
  cert_year       TEXT,
  issuer          TEXT,
  is_national     INTEGER DEFAULT 1,
  related_field   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 3. personnel_audit_history (감리실적)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_audit_history (
  id               SERIAL PRIMARY KEY,
  personnel_id     INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  audit_yearmonth  TEXT    NOT NULL,
  project_name     TEXT    NOT NULL,
  client_org       TEXT,
  sector           TEXT,
  domain           TEXT,
  role             TEXT,
  phase            TEXT,
  participation_rate INTEGER DEFAULT 100,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 4. personnel_it_career (IT경력)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_it_career (
  id              SERIAL PRIMARY KEY,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  period_start    TEXT,
  period_end      TEXT,
  project_name    TEXT    NOT NULL,
  client_org      TEXT,
  domain          TEXT,
  role            TEXT,
  company         TEXT,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 5. audit_projects (감리 사업)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_projects (
  id                      SERIAL PRIMARY KEY,
  project_name            TEXT    NOT NULL UNIQUE,
  bid_notice_no           TEXT,
  client_org              TEXT,
  registered_yearmonth    TEXT,
  target_project_name     TEXT,
  target_client_org       TEXT,
  target_contractor       TEXT,
  target_budget           BIGINT,
  target_period_start     TEXT,
  target_period_end       TEXT,
  target_keywords         TEXT,
  keyword_mapping         TEXT,
  bid_amount              BIGINT,
  bid_amount_excl_vat     BIGINT,
  bid_rate                REAL,
  base_budget             BIGINT,
  bid_deadline            TEXT,
  bid_open_dt             TEXT,
  eval_dt                 TEXT,
  travel_cost_per_md      INTEGER DEFAULT 0,
  required_md             INTEGER,
  proposed_md             INTEGER,
  optimal_md              INTEGER,
  md_unit_price_incl      INTEGER,
  md_unit_price_excl      INTEGER,
  base_unit_price         INTEGER,
  proposal_allowance      BIGINT,
  proposal_allowance_rate REAL,
  required_phases         INTEGER,
  required_audit_days     INTEGER,
  eval_method             TEXT,
  proposal_status         TEXT,
  writer                  TEXT,
  director                TEXT,
  supporters              TEXT,
  references_cc           TEXT,
  special_notes           TEXT,
  remarks                 TEXT,
  proposal_template       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 6. audit_phases (감리 단계)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_phases (
  id                  SERIAL PRIMARY KEY,
  project_id          INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  phase_name          TEXT    NOT NULL,
  phase_days          INTEGER,
  phase_start_date    TEXT,
  phase_end_date      TEXT,
  phase_order         INTEGER DEFAULT 0,
  total_auditor_cnt   INTEGER DEFAULT 0,
  total_expert_cnt    INTEGER DEFAULT 0,
  pre_survey_md       INTEGER DEFAULT 0,
  audit_md            INTEGER DEFAULT 0,
  action_confirm_md   INTEGER DEFAULT 0,
  proposed_md         INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 7. audit_phase_assignments (단계별 인력 배정)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_phase_assignments (
  id                SERIAL PRIMARY KEY,
  phase_id          INTEGER NOT NULL REFERENCES audit_phases(id) ON DELETE CASCADE,
  project_id        INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  personnel_id      INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  person_name       TEXT    NOT NULL,
  member_type       TEXT    NOT NULL DEFAULT '감리원',
  domain            TEXT,
  pre_survey_md     INTEGER DEFAULT 0,
  audit_md          INTEGER DEFAULT 0,
  action_confirm_md INTEGER DEFAULT 0,
  -- total_md는 GENERATED 대신 일반 컬럼으로 (PostgreSQL 호환)
  total_md          INTEGER GENERATED ALWAYS AS (pre_survey_md + audit_md + action_confirm_md) STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 8. proposal_members (제안 인력)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_members (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  personnel_id      INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  person_name       TEXT    NOT NULL,
  member_group      TEXT,
  member_type       TEXT    NOT NULL DEFAULT '감리원',
  domain            TEXT,
  regular_md        INTEGER DEFAULT 0,
  additional_md     INTEGER DEFAULT 0,
  acceptance_md     INTEGER DEFAULT 0,
  total_md          INTEGER GENERATED ALWAYS AS (regular_md + additional_md + acceptance_md) STORED,
  is_fulltime       INTEGER DEFAULT 1,
  auditor_grade     TEXT,
  auditor_cert_no   TEXT,
  phone             TEXT,
  education_hours   INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 9. proposal_files (제안 파일)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_files (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  file_category   TEXT,
  file_name       TEXT    NOT NULL,
  file_size_kb    REAL,
  uploaded_at     TEXT,
  file_type       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 10. proposal_attachments_toc (첨부 목차)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_attachments_toc (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  item_order  INTEGER NOT NULL,
  item_name   TEXT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 11. keywords (키워드)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keywords (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  keyword     TEXT    NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, keyword)
);

-- ──────────────────────────────────────────
-- 12. keyword_mappings (키워드 매핑)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keyword_mappings (
  id               SERIAL PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  keyword_id       INTEGER REFERENCES keywords(id) ON DELETE SET NULL,
  original_keyword TEXT    NOT NULL,
  mapped_keyword   TEXT    NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, original_keyword, mapped_keyword)
);

-- ──────────────────────────────────────────
-- 인덱스
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_personnel_name             ON personnel(name);
CREATE INDEX IF NOT EXISTS idx_personnel_auditor_grade    ON personnel(auditor_grade);
CREATE INDEX IF NOT EXISTS idx_audit_history_personnel    ON personnel_audit_history(personnel_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_yearmonth    ON personnel_audit_history(audit_yearmonth);
CREATE INDEX IF NOT EXISTS idx_it_career_personnel        ON personnel_it_career(personnel_id);
CREATE INDEX IF NOT EXISTS idx_certifications_personnel   ON personnel_certifications(personnel_id);
CREATE INDEX IF NOT EXISTS idx_audit_projects_name        ON audit_projects(project_name);
CREATE INDEX IF NOT EXISTS idx_audit_projects_status      ON audit_projects(proposal_status);
CREATE INDEX IF NOT EXISTS idx_audit_phases_project       ON audit_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_phase    ON audit_phase_assignments(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_person   ON audit_phase_assignments(personnel_id);
CREATE INDEX IF NOT EXISTS idx_proposal_members_project   ON proposal_members(project_id);
CREATE INDEX IF NOT EXISTS idx_proposal_members_person    ON proposal_members(personnel_id);
CREATE INDEX IF NOT EXISTS idx_proposal_files_project     ON proposal_files(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_project           ON keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_kwmap_project              ON keyword_mappings(project_id);
CREATE INDEX IF NOT EXISTS idx_kwmap_keyword              ON keyword_mappings(keyword_id);
