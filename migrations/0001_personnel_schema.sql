-- ============================================================
-- 인력정보 DB 스키마
-- 출처: 프로파일(강신배).html 구조 기반
-- ============================================================

-- ──────────────────────────────────────────
-- 1. 인력 기본정보 (personnel)
--    개인 식별 정보, 감리원 등급, 학력 등
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 기본 식별
  name                TEXT    NOT NULL,               -- 성명
  position            TEXT,                           -- 직위 (예: 수석, 책임, 선임)
  is_fulltime         INTEGER NOT NULL DEFAULT 1,     -- 상근 여부 (1=상근, 0=비상근)
  company             TEXT,                           -- 소속 회사

  -- 연락처
  email               TEXT    UNIQUE,                 -- 이메일
  phone               TEXT,                           -- 연락처
  birthdate           TEXT,                           -- 생년월일 (YYMMDD 또는 YYYY-MM-DD)

  -- 감리원 정보
  auditor_cert_no     TEXT,                           -- 감리원증 번호 (예: 서울 제134호)
  auditor_grade       TEXT,                           -- 감리원 등급 (수석감리원/감리원/테스터)
  tech_grade          TEXT,                           -- 기술 등급 (기술사/특급/고급/중급 등)
  auditor_career_yrs  REAL    DEFAULT 0,              -- 감리 경력 (년수)
  auditor_start_date  TEXT,                           -- 감리 시작일

  -- 학력
  school              TEXT,                           -- 최종학교
  major               TEXT,                           -- 전공 분야
  degree              TEXT,                           -- 학위 (학사/석사/박사/박사과정)

  -- 주요 경력 요약 (자유 텍스트)
  career_summary      TEXT,                           -- 주요 경력 (기간 및 회사)
  career_qualif        TEXT,                          -- 주요 경력 및 자격 요약
  career_project      TEXT,                           -- 시스템 개발/프로젝트 실무 경력
  career_expert       TEXT,                           -- 주요 이력 (전문가용)

  -- 교육
  education_name      TEXT,                           -- 교육명
  education_hours     INTEGER DEFAULT 0,              -- 교육 이수 시간
  education_org       TEXT,                           -- 교육 기관

  created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 2. 자격증 (personnel_certifications)
--    1인 다수 자격증 보유 가능
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_certifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,

  cert_name       TEXT    NOT NULL,   -- 자격증 명 (예: 정보시스템 수석감리원)
  cert_year       TEXT,               -- 취득 연도
  issuer          TEXT,               -- 발급처 (예: 행정안전부)
  is_national     INTEGER DEFAULT 1,  -- 국가공인 여부 (1=국가공인, 0=민간)
  related_field   TEXT,               -- 관련 분야

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 3. 감리 실적 (personnel_audit_history)
--    개인 감리 참여 이력 (Row 87~192 기반)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_audit_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,

  audit_yearmonth TEXT    NOT NULL,   -- 참여 연월 (예: 2026.06)
  project_name    TEXT    NOT NULL,   -- 사업명
  client_org      TEXT,               -- 주관 기관
  sector          TEXT,               -- 공공/민간 구분
  domain          TEXT,               -- 담당 분야 (예: 응용시스템, 사업관리)
  role            TEXT,               -- 역할 (총괄/감리원/전문가/컨설턴트)
  phase           TEXT,               -- 참여 단계 (요구정의/설계/구현/종료 등)
  participation_rate INTEGER DEFAULT 100, -- 참여율 (%)

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 4. IT 경력 (personnel_it_career)
--    IT 실무 경력 (Row 193~209 기반)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_it_career (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,

  period_start    TEXT,               -- 시작 기간 (예: 2015.10)
  period_end      TEXT,               -- 종료 기간 (예: 2017.03)
  project_name    TEXT    NOT NULL,   -- 프로젝트명
  client_org      TEXT,               -- 주관 기관 / 발주처
  domain          TEXT,               -- 담당 분야
  role            TEXT,               -- 역할 (PM/PL/팀장 등)
  company         TEXT,               -- 소속 회사
  remarks         TEXT,               -- 비고

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ──────────────────────────────────────────
-- 인덱스
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_personnel_name         ON personnel(name);
CREATE INDEX IF NOT EXISTS idx_personnel_auditor_grade ON personnel(auditor_grade);
CREATE INDEX IF NOT EXISTS idx_audit_history_personnel ON personnel_audit_history(personnel_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_yearmonth ON personnel_audit_history(audit_yearmonth);
CREATE INDEX IF NOT EXISTS idx_it_career_personnel     ON personnel_it_career(personnel_id);
CREATE INDEX IF NOT EXISTS idx_certifications_personnel ON personnel_certifications(personnel_id);
