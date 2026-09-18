-- keyword_mappings.keyword_id 를 NULL 허용으로 변경
-- (original_keyword가 keywords 테이블에 없는 경우도 저장 가능)
--
-- SQLite는 ALTER COLUMN을 지원하지 않으므로 테이블 재생성 방식 사용

CREATE TABLE keyword_mappings_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES audit_projects(id) ON DELETE CASCADE,
  keyword_id       INTEGER REFERENCES keywords(id) ON DELETE SET NULL,  -- NULL 허용
  original_keyword TEXT    NOT NULL,
  mapped_keyword   TEXT    NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (project_id, original_keyword, mapped_keyword)
);

INSERT INTO keyword_mappings_new (id, project_id, keyword_id, original_keyword, mapped_keyword, created_at)
SELECT id, project_id, keyword_id, original_keyword, mapped_keyword, created_at
FROM keyword_mappings;

DROP TABLE keyword_mappings;
ALTER TABLE keyword_mappings_new RENAME TO keyword_mappings;

CREATE INDEX IF NOT EXISTS idx_kwmap_project  ON keyword_mappings(project_id);
CREATE INDEX IF NOT EXISTS idx_kwmap_keyword  ON keyword_mappings(keyword_id);
