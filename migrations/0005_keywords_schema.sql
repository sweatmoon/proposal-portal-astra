-- ============================================================
-- 키워드 관련 테이블 추가
-- 출처: 제안서ERD.xlsx (엑셀 ERD 기반 누락 테이블 보완)
-- ============================================================

-- ──────────────────────────────────────────
-- 1. 키워드 (keywords)
--    사업별 키워드 태그 목록
--    엑셀 ERD: PK=키워드명, FK=감리사업명
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keywords (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  keyword         TEXT    NOT NULL,   -- 키워드명
  sort_order      INTEGER DEFAULT 0,  -- 정렬 순서

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),

  -- 동일 사업 내 키워드 중복 방지
  UNIQUE (project_id, keyword)
);

-- ──────────────────────────────────────────
-- 2. 키워드 수정 (keyword_mappings)
--    키워드 별칭/변환 매핑 테이블
--    엑셀 ERD: FK=키워드명, FK=감리사업명, 변환키워드
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keyword_mappings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  keyword_id       INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  original_keyword TEXT    NOT NULL,  -- 원본 키워드명 (비정규화 - 빠른 조회용)
  mapped_keyword   TEXT    NOT NULL,  -- 변환 키워드 (별칭)

  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),

  UNIQUE (keyword_id, mapped_keyword)
);

-- ──────────────────────────────────────────
-- 인덱스
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_keywords_project ON keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_kwmap_project    ON keyword_mappings(project_id);
CREATE INDEX IF NOT EXISTS idx_kwmap_keyword    ON keyword_mappings(keyword_id);

-- ──────────────────────────────────────────
-- 기존 audit_projects target_keywords 텍스트 → keywords 테이블 마이그레이션
-- (글로컬 사업 시드 데이터: project_id=1 기준)
-- ──────────────────────────────────────────
INSERT OR IGNORE INTO keywords (project_id, keyword, sort_order) VALUES
  (1, '한달빛글로컬보건연합대학',   0),
  (1, '보건대학',                    1),
  (1, '대학',                        2),
  (1, '학사',                        3),
  (1, '포털',                        4),
  (1, '모바일',                      5),
  (1, '비교과',                      6),
  (1, '역량',                        7),
  (1, '학습관리',                    8),
  (1, 'LMS',                         9),
  (1, '평생교육',                   10),
  (1, 'IR',                         11),
  (1, '성과관리',                   12),
  (1, 'IR성과관리',                 13),
  (1, 'O2O',                        14),
  (1, 'O2O플랫폼',                  15),
  (1, '평생학번',                   16),
  (1, '융합교육학기제',             17),
  (1, '글로컬대학30',               18),
  (1, '단일 거버넌스',              19),
  (1, '스쿨제',                     20),
  (1, '연합대학',                   21),
  (1, '시스템 통합',                22),
  (1, '민간클라우드',               23),
  (1, '데이터 연계성 분석',         24),
  (1, '데이터 흐름 분석',           25),
  (1, '하이브리드 학습',            26),
  (1, 'DX/AX 혁신 교수법',          27),
  (1, 'AI 실시간 자막 및 번역',     28),
  (1, 'LRS',                        29),
  (1, 'xAPI',                       30),
  (1, '전자정부 표준프레임워크',    31);

-- ──────────────────────────────────────────
-- 키워드 수정 샘플 데이터 (영문 약어 → 한글 매핑)
-- ──────────────────────────────────────────
INSERT OR IGNORE INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
SELECT 1, id, keyword, 'Learning Management System'
  FROM keywords WHERE project_id = 1 AND keyword = 'LMS';

INSERT OR IGNORE INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
SELECT 1, id, keyword, 'Investor Relations'
  FROM keywords WHERE project_id = 1 AND keyword = 'IR';

INSERT OR IGNORE INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
SELECT 1, id, keyword, 'Online to Offline'
  FROM keywords WHERE project_id = 1 AND keyword = 'O2O';

INSERT OR IGNORE INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
SELECT 1, id, keyword, 'Learning Record Store'
  FROM keywords WHERE project_id = 1 AND keyword = 'LRS';

INSERT OR IGNORE INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
SELECT 1, id, keyword, 'Experience API'
  FROM keywords WHERE project_id = 1 AND keyword = 'xAPI';
