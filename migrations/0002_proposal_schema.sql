-- ============================================================
-- 제안작업표 DB 스키마
-- 출처: [글로컬]한달빛글로컬보건연합대학 O2O플랫폼 구축(1단계) 사업 감리 용역.html
-- ============================================================

-- ──────────────────────────────────────────
-- 1. 감리 사업 (audit_projects)
--    제안작업표의 최상위 - 감리 대상 사업 정보
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_projects (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 사업 식별
  project_name          TEXT    NOT NULL,             -- 감리 사업명
  bid_notice_no         TEXT,                         -- 입찰공고번호
  client_org            TEXT,                         -- 발주처 (감리 발주 기관)
  registered_yearmonth  TEXT,                         -- 등록년월 (예: 2026.07)

  -- 대상 사업 정보
  target_project_name   TEXT,                         -- 대상 사업명 (감리 받는 사업)
  target_client_org     TEXT,                         -- 대상 사업 발주처
  target_contractor     TEXT,                         -- 사업수행사
  target_budget         INTEGER,                      -- 사업 예산 (원)
  target_period_start   TEXT,                         -- 대상 사업 기간 시작 (예: 2026.07)
  target_period_end     TEXT,                         -- 대상 사업 기간 종료 (예: 2027.10)
  target_keywords       TEXT,                         -- 주요 키워드 (쉼표 구분)
  keyword_mapping       TEXT,                         -- 키워드 변환 매핑 (텍스트)

  -- 입찰/금액 정보
  bid_amount            INTEGER,                      -- 입찰 금액 (VAT 포함, 원)
  bid_amount_excl_vat   INTEGER,                      -- 입찰 금액 (VAT 제외, 원)
  bid_rate              REAL,                         -- 투찰률 (%, 예: 80.00)
  base_budget           INTEGER,                      -- 배정 예산 (원)
  bid_deadline          TEXT,                         -- 입찰 마감 일시
  bid_open_dt           TEXT,                         -- 입찰 개시 일시
  eval_dt               TEXT,                         -- 평가 일시
  travel_cost_per_md    INTEGER DEFAULT 0,            -- 출장비 (1MD당, 원)

  -- 공수/단가 산정
  required_md           INTEGER,                      -- 요구 투입 공수 (MD)
  proposed_md           INTEGER,                      -- 제안 투입 공수 (MD)
  optimal_md            INTEGER,                      -- 적정 공수 (MD)
  md_unit_price_incl    INTEGER,                      -- 1MD 단가 (VAT 포함)
  md_unit_price_excl    INTEGER,                      -- 1MD 단가 (VAT 제외)
  base_unit_price       INTEGER,                      -- 기준 단가 (VAT 제외)
  proposal_allowance    INTEGER,                      -- 제안 수당 (원)
  proposal_allowance_rate REAL,                       -- 제안 수당률 (%)

  -- 감리 단계/일정 요약
  required_phases       INTEGER,                      -- 요구 단계 수 (예: 3단계)
  required_audit_days   INTEGER,                      -- 요구 감리 일수

  -- 평가/제안 방식
  eval_method           TEXT,                         -- 제안 평가 방식 (오프라인 발표 등)
  proposal_status       TEXT,                         -- 제안 작업 상태 (지원 요청 등)

  -- 제안 관련자
  writer                TEXT,                         -- 작성자
  director              TEXT,                         -- 총괄
  supporters            TEXT,                         -- 지원 담당자 (쉼표 구분)
  references_cc         TEXT,                         -- 참조자 (쉼표 구분)

  -- 특이사항 / 비고
  special_notes         TEXT,                         -- 특이 사항
  remarks               TEXT,                         -- 비고

  -- 제안서 생성
  proposal_template     TEXT,                         -- 제안서 템플릿 유형 (예: c Type)

  created_at            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 2. 감리 단계 일정 (audit_phases)
--    감리 단계별 일정 및 공수 계획
--    (요구정의/설계/솔루션점검/구현/종료/검수지원/상시감리)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_phases (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,

  phase_name        TEXT    NOT NULL,   -- 단계명 (요구정의/설계/솔루션점검/구현/종료/검수지원/상시감리)
  phase_days        INTEGER,            -- 현장 감리 일수
  phase_start_date  TEXT,               -- 시작일 (예: 2026.08.24)
  phase_end_date    TEXT,               -- 종료일 (예: 2026.08.28)
  phase_order       INTEGER DEFAULT 0,  -- 단계 순서 (정렬용)

  -- 공수 합계 (감리원+전문가 합산)
  total_auditor_cnt     INTEGER DEFAULT 0,  -- 감리원 인원수
  total_expert_cnt      INTEGER DEFAULT 0,  -- 전문가 인원수
  pre_survey_md         INTEGER DEFAULT 0,  -- 예비조사 (MD)
  audit_md              INTEGER DEFAULT 0,  -- 감리 (MD)
  action_confirm_md     INTEGER DEFAULT 0,  -- 조치확인 (MD)
  proposed_md           INTEGER DEFAULT 0,  -- 제안 (MD)

  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 3. 단계별 투입 인력 배정 (audit_phase_assignments)
--    각 단계에 투입되는 인력 및 MD 배분
--    ※ personnel 테이블과 JOIN 가능 (성명 기반)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_phase_assignments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id          INTEGER NOT NULL REFERENCES audit_phases(id) ON DELETE CASCADE,
  project_id        INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,

  -- 인력 연결 (personnel 테이블 FK, nullable - 미등록 인력 허용)
  personnel_id      INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  person_name       TEXT    NOT NULL,               -- 성명 (비정규화 - 빠른 조회용)

  member_type       TEXT    NOT NULL DEFAULT '감리원', -- 구분 (감리원/전문가/테스터)
  domain            TEXT,                           -- 담당 분야

  -- MD 배분
  pre_survey_md     INTEGER DEFAULT 0,   -- 예비조사 MD
  audit_md          INTEGER DEFAULT 0,   -- 감리 MD
  action_confirm_md INTEGER DEFAULT 0,   -- 조치확인 MD
  total_md          INTEGER GENERATED ALWAYS AS (
                      pre_survey_md + audit_md + action_confirm_md
                    ) STORED,            -- 소계 MD (자동 계산)

  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 4. 제안 인력 목록 (proposal_members)
--    제안 인력 섹션 (Row 57~88 기반)
--    단계 횡단 요약 테이블
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_members (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,

  -- 인력 연결
  personnel_id        INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  person_name         TEXT    NOT NULL,               -- 성명

  member_group        TEXT,                           -- 소속 그룹 (단계 감리팀/전문가/테스터)
  member_type         TEXT    NOT NULL DEFAULT '감리원', -- 구분 (감리원/전문가/테스터)
  domain              TEXT,                           -- 담당 분야

  -- MD 합산
  regular_md          INTEGER DEFAULT 0,              -- 정기 MD
  additional_md       INTEGER DEFAULT 0,              -- 추가 MD
  acceptance_md       INTEGER DEFAULT 0,              -- 검수지원 MD
  total_md            INTEGER GENERATED ALWAYS AS (
                        regular_md + additional_md + acceptance_md
                      ) STORED,                       -- 소계 MD

  -- 감리원 정보 스냅샷 (제안 당시 기준)
  is_fulltime         INTEGER DEFAULT 1,              -- 상근 여부
  auditor_grade       TEXT,                           -- 감리원 등급
  auditor_cert_no     TEXT,                           -- 감리원증 번호
  phone               TEXT,                           -- 연락처
  education_hours     INTEGER DEFAULT 0,              -- 교육 시간

  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 5. 제안 관련 파일 (proposal_files)
--    제안 관련 파일 목록
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,

  file_category   TEXT,               -- 파일 구분 (11.감리사업공고서/12.감리제안요청서 등)
  file_name       TEXT    NOT NULL,   -- 파일명
  file_size_kb    REAL,               -- 파일 크기 (KB)
  uploaded_at     TEXT,               -- 업로드 일시
  file_type       TEXT,               -- 파일 유형 (제안요청서/제안서/공유자료 등)

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 6. 첨부 목차 항목 (proposal_attachments_toc)
--    제안서 생성 시 첨부 목차
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_attachments_toc (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,

  item_order      INTEGER NOT NULL,   -- 순서
  item_name       TEXT    NOT NULL,   -- 목차 항목명

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 인덱스
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_projects_name       ON audit_projects(project_name);
CREATE INDEX IF NOT EXISTS idx_audit_projects_status     ON audit_projects(proposal_status);
CREATE INDEX IF NOT EXISTS idx_audit_phases_project      ON audit_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_phase   ON audit_phase_assignments(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_person  ON audit_phase_assignments(personnel_id);
CREATE INDEX IF NOT EXISTS idx_proposal_members_project  ON proposal_members(project_id);
CREATE INDEX IF NOT EXISTS idx_proposal_members_person   ON proposal_members(personnel_id);
CREATE INDEX IF NOT EXISTS idx_proposal_files_project    ON proposal_files(project_id);
