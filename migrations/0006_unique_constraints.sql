-- UPSERT를 위한 UNIQUE 제약 추가
-- personnel: name 기준 (같은 이름의 인력은 덮어쓰기)
-- audit_projects: project_name 기준 (같은 사업명은 덮어쓰기)

CREATE UNIQUE INDEX IF NOT EXISTS uq_personnel_name
  ON personnel(name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_projects_name
  ON audit_projects(project_name);
