import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse } from 'node-html-parser';
import { PGlite } from '@electric-sql/pglite';

// No DATABASE_URL, server or filesystem database. Execute production SQL against isolated in-memory PostgreSQL.
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const tableUrl = url(compile(read('src/parsers/html-table-parser.ts')));
const parserUrl = url(compile(read('src/parsers/personnel-parser.ts')).replace("'./html-table-parser.js'", JSON.stringify(tableUrl)));
const { parsePersonnelHtml } = await import(parserUrl);
const queryLog = [];
let db, rejectSync = false;
const client = { async query(sql, params) {
  queryLog.push(sql);
  if (rejectSync && /UPDATE proposal_members AS pm/.test(sql)) throw new Error('TEST_SYNC_FAILURE');
  const result = await db.query(sql, params);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
} };
globalThis.__personnelSyncTransaction = async fn => {
  await client.query('BEGIN');
  try { const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
};
const dbUrl = url('export const transaction = fn => globalThis.__personnelSyncTransaction(fn)');
const source = read('src/routes/upload-personnel.ts');
const upload = await import(url(compile(source).replace("'hono'", JSON.stringify(import.meta.resolve('hono')))
  .replace("'../parsers/personnel-parser.js'", JSON.stringify(parserUrl)).replace("'../db/client.js'", JSON.stringify(dbUrl))));
const sync = upload.syncProposalMemberProfile;
const table = rows => '<table>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</table>';
function profile({ name = '김현호', status = '비상근', grade = '수석감리원', cert = '서울 제123호', phone = '010-2222-3333', hours = '40시간', education = true } = {}) {
  return table([['메뉴']]).repeat(3) + table([
    ['성명 (직위)', '감리', 'IT', '프로젝트', '자격', '회사'],
    [name + ' (팀장, ' + status + ')', '', '', '', '', '새회사'],
    ['감리원증', '감리원 등급', '기술 등급'], [cert, grade, '기술사'],
    ['이메일', '연락처', '생년월일'], ['', phone, '800101'],
  ]) + (education ? table([['교육명', '교육이수시간', '교육기관'], ['계속교육', hours, '교육원']]) : '');
}
async function post(html) {
  const form = new FormData(); form.set('file', new Blob([html]), 'profile.html');
  return upload.default.request('/', { method: 'POST', body: form });
}
const rows = async table => (await db.query('SELECT * FROM ' + table + ' ORDER BY id')).rows;
const allowed = ['personnel_id', 'auditor_grade', 'auditor_cert_no', 'phone', 'education_hours'];
const protectedMember = row => Object.fromEntries(Object.entries(row).filter(([key]) => !allowed.includes(key)));
before(async () => {
  db = new PGlite();
  const schema = read('src/db/schema.sql');
  for (const name of ['personnel', 'personnel_certifications', 'personnel_audit_history', 'audit_projects', 'audit_phases', 'audit_phase_assignments', 'proposal_members']) {
    const ddl = schema.match(new RegExp('CREATE TABLE IF NOT EXISTS ' + name + ' \\([\\s\\S]*?\\);'))?.[0];
    assert(ddl); await db.exec(ddl);
  }
  await db.exec(`CREATE TABLE personnel_it_career (id SERIAL PRIMARY KEY, personnel_id INTEGER, period_start TEXT, period_end TEXT, career TEXT, duty TEXT, basis TEXT);
    CREATE TABLE personnel_project_career (id SERIAL PRIMARY KEY, personnel_id INTEGER, year_range TEXT, project_name TEXT, client_org TEXT, domain TEXT, role TEXT, company TEXT, remarks TEXT);
    CREATE FUNCTION guard_business_fields() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF (to_jsonb(NEW) - ARRAY['personnel_id','auditor_grade','auditor_cert_no','phone','education_hours'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['personnel_id','auditor_grade','auditor_cert_no','phone','education_hours'])
      THEN RAISE EXCEPTION 'PROTECTED_BUSINESS_FIELDS_CHANGED'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER guard_business_fields AFTER UPDATE ON proposal_members FOR EACH ROW EXECUTE FUNCTION guard_business_fields();`);
});
beforeEach(async () => {
  rejectSync = false; queryLog.length = 0;
  await db.exec(`TRUNCATE personnel, audit_projects, personnel_it_career, personnel_project_career RESTART IDENTITY CASCADE;
    INSERT INTO personnel (name, auditor_grade, auditor_cert_no, phone, education_hours, is_fulltime) VALUES
      ('김현호','감리원','구번호','010-0000-0000',12,1), ('다른인력','전문가','다른번호','010-9999-9999',99,0);
    INSERT INTO audit_projects (project_name, client_org, bid_amount, required_md, proposed_md, director, proposal_status, bid_deadline)
      VALUES ('진행사업','기관A',123456789,151,180,'사업총괄','진행','2026-12-30'),('완료사업','기관B',987654321,77,80,'다른총괄','완료','2025-12-30');
    INSERT INTO proposal_members (project_id,personnel_id,person_name,member_group,member_type,domain,regular_md,additional_md,acceptance_md,is_fulltime,auditor_grade,auditor_cert_no,phone,education_hours) VALUES
      (1,1,'김현호','감리팀','총괄','사업관리',31,7,2,1,'이전등급','이전번호','이전전화',12),
      (1,NULL,' 김현호 ','전문가/핵심기술','전문가','보안',2,3,5,0,'별도등급','별도번호','별도전화',15),
      (2,NULL,'김현호','감리팀','감리원','응용',11,2,3,NULL,'이전등급','이전번호','이전전화',22),
      (2,2,'다른인력','테스터','테스터','DB',7,8,9,0,'다른등급','다른번호','다른전화',99);
    INSERT INTO audit_phases (project_id,phase_name,phase_days,phase_start_date,phase_end_date,phase_order)
      VALUES (1,'설계',5,'2026-11-01','2026-11-05',1),(2,'종료',7,'2025-10-01','2025-10-07',1);
    INSERT INTO audit_phase_assignments (phase_id,project_id,personnel_id,person_name,member_type,domain,pre_survey_md,audit_md,action_confirm_md)
      VALUES (1,1,NULL,'김현호','총괄','사업관리',1,5,2),(2,2,1,'김현호','감리원','응용',2,7,3);
    INSERT INTO personnel_audit_history (personnel_id,audit_yearmonth,project_name) VALUES (1,'2020.01','기존이력');`);
});
after(async () => { await db?.close(); delete globalThis.__personnelSyncTransaction; });

test('parser whitelist excludes employment and assignment data; explicit zero differs from absent or malformed hours', () => {
  const p = parsePersonnelHtml(profile({hours:'0 시간'}));
  assert.equal(p.personnel.is_fulltime,0);
  assert.equal(p.memberProfileUpdates.education_hours,0);
  assert.deepEqual(Object.keys(p.memberProfileUpdates).sort(),['auditor_cert_no','auditor_grade','education_hours','phone']);
  for (const hours of ['', '-', '미확인', '-3', '40~80', '약40시간', '4,0', 'Infinity']) {
    assert.equal(parsePersonnelHtml(profile({hours})).memberProfileUpdates.education_hours,undefined);
  }
  assert.equal(parsePersonnelHtml(profile({education:false})).memberProfileUpdates.education_hours,undefined);
  assert.equal(parsePersonnelHtml(profile({hours:'1,000시간'})).memberProfileUpdates.education_hours,1000);
  const missing = parsePersonnelHtml(profile({grade:'-',cert:'미등록',phone:'',education:false}));
  assert.deepEqual(missing.memberProfileUpdates,{});
});
test('upload updates only four fields across all projects, creates K links and preserves every business value', async () => {
  const members = await rows('proposal_members');
  const protectedTables = ['audit_projects','audit_phases','audit_phase_assignments'];
  const before = await Promise.all(protectedTables.map(rows));
  const res = await post(profile()); assert.equal(res.status,200);
  const result = await res.json();
  assert.deepEqual(result.data.profile_sync, {matched_rows:3,updated_rows:3,updated_projects:2,linked_rows:2,skipped_rows:0,
    fields:['auditor_grade','auditor_cert_no','phone','education_hours'],warnings:[]});
  const after = await rows('proposal_members');
  assert.deepEqual(after.map(protectedMember),members.map(protectedMember));
  assert.deepEqual(after.map(r=>r.is_fulltime),[1,0,null,0]);
  for (const row of after.slice(0,3)) {
    assert.equal(row.personnel_id,1); assert.equal(row.auditor_grade,'수석감리원'); assert.equal(row.auditor_cert_no,'서울 제123호');
    assert.equal(row.phone,'010-2222-3333'); assert.equal(row.education_hours,40);
  }
  assert.deepEqual(after[3],members[3]);
  assert.deepEqual(await Promise.all(protectedTables.map(rows)),before);
  const updates = queryLog.filter(sql=>/UPDATE proposal_members/.test(sql)); assert.equal(updates.length,1);
  const set = updates[0].split('SET')[1].split('WHERE')[0];
  assert.deepEqual([...set.matchAll(/\b(\w+)\s*=/g)].map(m=>m[1]).sort(),allowed.slice().sort());
  assert.equal(queryLog.at(-1),'COMMIT');
});
test('profile-sync ignores injected business properties, including is_fulltime and name/project/MD', async () => {
  const before = await rows('proposal_members');
  await sync(client,1,'김현호',{auditor_grade:'갱신등급',is_fulltime:0,project_id:999,person_name:'변경금지',regular_md:999,domain:'변경금지'});
  const after = await rows('proposal_members');
  assert.deepEqual(after.map(protectedMember),before.map(protectedMember));
  assert.equal(after[0].auditor_grade,'갱신등급');
  assert.equal(after[0].auditor_cert_no,before[0].auditor_cert_no);
});
test('missing common values preserve both personnel and proposal values, but still establish unambiguous K links', async () => {
  const before = await rows('proposal_members'); const person = (await rows('personnel'))[0];
  const res = await post(profile({grade:'-',cert:'',phone:'미입력',education:false}));assert.equal(res.status,200);
  const result = await res.json();assert.equal(result.data.profile_sync.linked_rows,2);
  const after = await rows('proposal_members');
  for (let i=0;i<after.length;i++) for (const key of ['auditor_grade','auditor_cert_no','phone','education_hours']) assert.equal(after[i][key],before[i][key]);
  const latest = (await rows('personnel'))[0];
  for (const key of ['auditor_grade','auditor_cert_no','phone','education_hours']) assert.equal(latest[key],person[key]);
});
test('explicit zero hours updates all matching rows and repeated upload reports no false changes', async () => {
  assert.equal((await post(profile({hours:'0'}))).status,200);
  assert((await rows('proposal_members')).slice(0,3).every(r=>r.education_hours===0));
  const result = await (await post(profile({hours:'0'}))).json();
  assert.equal(result.data.profile_sync.updated_rows,0);assert.equal(result.data.profile_sync.linked_rows,0);
  assert.equal(result.data.profile_sync.updated_projects,0);
});
test('existing wrong links and name mismatches are preserved and reported rather than reassigned', async () => {
  await db.exec(`INSERT INTO proposal_members (project_id,personnel_id,person_name,domain,is_fulltime) VALUES
    (1,2,'김현호','기존 연결 보존',0),(2,1,'이름불일치','보존',1);`);
  const before = (await rows('proposal_members')).slice(-2);
  const result = await (await post(profile())).json();
  assert.equal(result.data.profile_sync.skipped_rows,2);assert.equal(result.data.profile_sync.warnings.length,1);
  assert.deepEqual((await rows('proposal_members')).slice(-2),before);
});
test('ambiguous trimmed personnel names block new links, while existing correct ID links update safely', async () => {
  await db.exec(`INSERT INTO personnel (name) VALUES (' 김현호 ')`);
  const before = await rows('proposal_members');
  const result = await (await post(profile())).json();
  assert.equal(result.data.profile_sync.matched_rows,1); assert.equal(result.data.profile_sync.linked_rows,0);
  assert.equal(result.data.profile_sync.skipped_rows,2);
  const after = await rows('proposal_members');
  assert.deepEqual(after.slice(1),before.slice(1));assert.equal(after[0].auditor_grade,'수석감리원');
});
test('newly registered personnel link to previously registered projects without altering names or employment', async () => {
  await db.exec(`INSERT INTO proposal_members (project_id,person_name,domain,is_fulltime,regular_md) VALUES (1,'신규인력','기존분야',0,17);`);
  const before = (await rows('proposal_members')).at(-1);
  const result = await (await post(profile({name:'신규인력',status:'상근'}))).json();
  assert.equal(result.data.profile_sync.linked_rows,1);
  const after = (await rows('proposal_members')).at(-1);
  assert.deepEqual(protectedMember(after),protectedMember(before));assert.equal(after.personnel_id,result.data.personnel_id);
});
test('sync failure rolls back personnel, history and project profile together', async () => {
  const names = ['personnel','personnel_audit_history','proposal_members'];
  const before = await Promise.all(names.map(rows));rejectSync=true;
  const res = await post(profile());assert.equal(res.status,500);
  assert.deepEqual(await Promise.all(names.map(rows)),before);
  assert.equal(queryLog.at(-1),'ROLLBACK');assert(!queryLog.includes('COMMIT'));
});
test('upload with no matching project reports zero without creating project personnel or changing assignments', async () => {
  const before = await rows('proposal_members');
  const result = await (await post(profile({name:'배정없음'}))).json();
  assert.equal(result.data.profile_sync.matched_rows,0);assert.equal(result.data.profile_sync.updated_rows,0);
  assert.deepEqual(await rows('proposal_members'),before);
});
test('name and K handlers appear on refreshed proposal SSR after an unlinked member is synchronized', async () => {
  const layoutUrl = url(compile(read('src/views/layout.ts')));
  globalThis.__syncPageRows = async sql => sql.includes('FROM proposal_members') ? rows('proposal_members').then(all=>all.filter(r=>r.project_id===1)) : [];
  const pagesDb = url(`export const query = sql => globalThis.__syncPageRows(sql); export async function queryOne(){return {id:1,project_name:'사업 유지'}}`);
  const pageModule = await import(url(compile(read('src/routes/pages.ts')).replace("'hono'", JSON.stringify(import.meta.resolve('hono')))
    .replace("'../db/client.js'",JSON.stringify(pagesDb)).replace("'../views/layout.js'",JSON.stringify(layoutUrl))));
  const get = async()=>parse(await (await pageModule.default.request('/proposals/1')).text());
  const before = await get(); const oldCount = before.querySelectorAll('[onclick]').filter(el=>(el.getAttribute('onclick')||'').startsWith('openKModal(')).length;
  await post(profile()); const after = await get();
  const links=after.querySelectorAll('[onclick]').filter(el=>(el.getAttribute('onclick')||'').startsWith('openKModal('));
  assert.equal(links.length,oldCount+1);assert(links.some(el=>el.getAttribute('onclick').startsWith('openKModal(1,1,')));
  assert(after.querySelectorAll('[onclick]').some(el=>el.getAttribute('onclick')==='openPersonModal(1)' && el.text.includes('김현호')));
  const uploadPage = parse(await (await pageModule.default.request('/upload')).text());
  const scripts = uploadPage.querySelectorAll('script:not([src])').map(script=>script.rawText);
  for (const script of scripts) new vm.Script(script);
  const summaryFunction = scripts.join('\n').match(/function personnelSyncSummary\(sync\) \{[\s\S]*?\n  \}/)?.[0];
  assert(summaryFunction);
  const context = vm.createContext({}); vm.runInContext(summaryFunction,context);
  const summary = context.personnelSyncSummary({updated_projects:2,updated_rows:3,linked_rows:2,skipped_rows:1});
  assert(summary.includes('신규 이름/(K) 연결 2건')); assert(summary.includes('사업 상근/비상근·배정정보 유지'));
  assert(summary.includes('이름 중복·기존 연결 충돌·이름 불일치'));
  assert(!context.personnelSyncSummary({updated_rows:'<img onerror=alert(1)>'}).includes('<img'));
  delete globalThis.__syncPageRows;
});
