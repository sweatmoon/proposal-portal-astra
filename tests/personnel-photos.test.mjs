import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/nas-client.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../src/routes/personnel-list.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../public/static/proposal-detail.js', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../public/static/ppt-engine.js', import.meta.url), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
let sequence = 0;
async function nas(t, handler) {
  const keys = ['NAS_BASE_URL', 'NAS_USERNAME', 'NAS_PASSWORD', 'NAS_PHOTO_FOLDER', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_ENV'];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { NAS_BASE_URL: 'https://nas.test', NAS_USERNAME: 'test-account', NAS_PASSWORD: 'test-secret', NODE_ENV: 'production' });
  delete process.env.NAS_PHOTO_FOLDER;
  t.after(() => { for (const k of keys) old[k] === undefined ? delete process.env[k] : process.env[k] = old[k]; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const p = Object.fromEntries(init.body);
    calls.push(p);
    assert.equal(init.method, 'POST');
    const response = await handler?.(p);
    if (response) return response;
    if (p.method === 'login') return Response.json({ success: true, data: { sid: 'test-session' } });
    if (p.method === 'logout') return Response.json({ success: true });
    assert.equal(p.api, 'SYNO.FileStation.Download');
    assert.equal(JSON.parse(p.path).length, 1);
    return new Response(png, { headers: { 'content-type': 'application/octet-stream' } });
  });
  t.mock.method(console, 'warn', () => {});
  const url = moduleUrl(source + '\n// instance ' + sequence++);
  return { mod: await import(url), calls, url };
}

test('client logo matches exact normalized institution names without choosing other organizations or variants', async t => {
  const { mod } = await nas(t);
  const files = ['강원대학교.png', '강원대학교2.png', '강원대학교병원.png', '(재)한국정보문화산업진흥원.png', '경기도 과천시.png'].map(name => ({ name, isdir: false }));
  assert.equal(mod.matchClientLogo('강원대학교', files).filename, '강원대학교.png');
  assert.equal(mod.matchClientLogo('강원대', files).error, 'client_logo_not_found');
  assert.equal(mod.matchClientLogo('한국정보문화산업진흥원', files).filename, '(재)한국정보문화산업진흥원.png');
  assert.equal(mod.matchClientLogo('경기도 과천시', files).filename, '경기도 과천시.png');
  assert.equal(mod.matchClientLogo('강원대학교', [...files, { name: '강원대학교.jpg', isdir: false }]).error, 'client_logo_ambiguous');
  assert.equal(mod.matchClientLogo('../비밀', files).error, 'invalid_client_org');
});
test('client logo reads only designated folder with pagination then downloads one PNG and logs out', async t => {
  const { mod, calls } = await nas(t, p => {
    if (p.method === 'list') {
      assert.equal(p.folder_path, '/activo/04.제안팀/99.악티보포털참조용/01.제안서 작성용 로고, 도장/주관기관 로고(누끼 딴거)');
      return Response.json({ success: true, data: { total: 2, files: [{ name: p.offset === '0' ? '다른기관.png' : '시험기관.png', isdir: false }] } });
    }
  });
  const r = await mod.fetchClientLogo('시험기관');
  assert.equal(r.ok, true); assert.equal(r.dataUri, 'data:image/png;base64,' + png.toString('base64'));
  assert.deepEqual(calls.filter(c => c.method === 'list').map(c => c.offset), ['0', '1']);
  assert.equal(calls.filter(c => c.method === 'login').length, 1); assert.equal(calls.filter(c => c.method === 'logout').length, 1);
  assert(JSON.parse(calls.find(c => c.method === 'download').path)[0].endsWith('/시험기관.png'));
});
test('client logo ambiguity and missing files do not download or fall back to another image', async t => {
  const { mod, calls } = await nas(t, p => p.method === 'list' && Response.json({ success: true, data: { files: [{ name: '시험기관.png', isdir: false }, { name: '시험기관.jpg', isdir: false }] } }));
  assert.equal((await mod.fetchClientLogo('시험기관')).error, 'client_logo_ambiguous');
  assert.equal((await mod.fetchClientLogo('없는기관')).error, 'client_logo_not_found');
  assert.equal(calls.filter(c => c.method === 'download').length, 0);
  assert.equal(calls.filter(c => c.method === 'logout').length, 2);
});
test('client logo keeps NAS permission errors distinct from not-found and never exposes secrets', async t => {
  const { mod, calls } = await nas(t, p => p.method === 'list' && Response.json({ success: false, error: { code: 407, message: 'test-secret test-session' } }));
  const r = await mod.fetchClientLogo('시험기관');
  assert.equal(r.error, 'nas_error'); assert.equal(r.stage, 'list'); assert.equal(r.code, 407);
  assert(!JSON.stringify(r).includes('test-secret')); assert(!JSON.stringify(r).includes('test-session'));
  assert.equal(calls.filter(c => c.method === 'logout').length, 1);
});
test('client logo retries expired sessions and rejects non-image download bodies', async t => {
  let downloads = 0;
  const { mod, calls } = await nas(t, p => {
    if (p.method === 'list') return Response.json({ success: true, data: { files: [{ name: '시험기관.png', isdir: false }] } });
    if (p.method === 'download' && downloads++ === 0) return Response.json({ success: false, error: { code: 106 } });
    if (p.method === 'download') return new Response('<html>not an image</html>');
  });
  const r = await mod.fetchClientLogo('시험기관');
  assert.equal(r.ok, false); assert.equal(r.stage, 'download'); assert.equal(r.dataUri, undefined);
  assert.equal(calls.filter(c => c.method === 'login').length, 2); assert.equal(calls.filter(c => c.method === 'logout').length, 2);
});
test('client logo API uses stored project organization and validates project ID before NAS', async () => {
  const db = moduleUrl(`export const calls=[]; export async function query() {throw new Error('forbidden')}; export async function queryOne(sql, params) { calls.push({sql,params}); return params[0]===42 ? {client_org:'저장 기관'} : null; }`);
  const nasModule = moduleUrl(`export const calls=[]; export async function fetchClientLogo(org) { calls.push(org); return {ok:false,error:'client_logo_not_found'}; }`);
  const source = readFileSync(new URL('../src/routes/projects.ts', import.meta.url), 'utf8').replace("'hono'", JSON.stringify(import.meta.resolve('hono'))).replace("'../db/client.js'", JSON.stringify(db)).replace("'../lib/nas-client.js'", JSON.stringify(nasModule));
  const route = (await import(moduleUrl(source))).default;
  assert.equal((await route.request('/0/client-logo')).status, 400);
  assert.equal((await route.request('/41/client-logo')).status, 404);
  const response = await route.request('/42/client-logo?clientOrg=조작된기관');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok:false,error:'client_logo_not_found',projectId:42,clientOrg:'저장 기관' });
  assert.deepEqual((await import(nasModule)).calls, ['저장 기관']);
  assert((await import(db)).calls.every(c => c.sql === 'SELECT client_org FROM audit_projects WHERE id = $1'));
});

test('known filenames download without folder List; one login/logout for a batch', async t => {
  const { mod, calls } = await nas(t);
  const rows = await mod.fetchPersonnelPhotoResults(['가상인력A', '가상인력B', '가상인력A']);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.ok && r.dataUri === 'data:image/png;base64,' + png.toString('base64')));
  assert.equal(calls.filter(c => c.method === 'login').length, 1);
  assert.equal(calls.filter(c => c.method === 'logout').length, 1);
  assert.equal(calls.filter(c => c.method === 'list').length, 0);
  assert.match(JSON.parse(calls.find(c => c.method === 'download').path)[0], /증명사진\(가상인력A\)\.png$/);
});

test('permissions and missing paths are different; JSON served as text is never image data', async t => {
  const { mod } = await nas(t, p => p.method === 'download' && new Response(JSON.stringify({ success: false, error: { code: p.path.includes('없음') ? 408 : 407 } }), { headers: { 'content-type': 'text/plain' } }));
  const [denied, absent] = await mod.fetchPersonnelPhotoResults(['권한', '없음']);
  assert.equal(denied.error, 'nas_error');
  assert.equal(denied.code, 407);
  assert.equal(absent.error, 'photo_path_not_found');
  assert.equal(denied.stage, 'download');
  assert.equal(denied.dataUri, undefined);
});

test('login failure preserves code without secrets or false not-found', async t => {
  const { mod, calls } = await nas(t, p => p.method === 'login' && Response.json({ success: false, error: { code: 400, detail: 'test-secret' } }));
  const rows = await mod.fetchPersonnelPhotoResults(['가상인력']);
  assert.equal(rows[0].stage, 'login');
  assert.equal(rows[0].code, 400);
  assert.equal(rows[0].error, 'nas_error');
  assert.ok(!JSON.stringify(rows).includes('test-secret'));
  assert.equal(calls.length, 1);
});

test('NAS photo reads allow 60 seconds and retry only timed-out personnel, keeping successful images', async t => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', ms => { deadlines.push(ms); return new AbortController().signal; });
  let secondAttempts = 0;
  const { mod, calls } = await nas(t, p => {
    if (p.method === 'download' && p.path.includes('단계감리원B') && secondAttempts++ === 0) {
      const error = new Error('deadline exceeded'); error.name = 'TimeoutError'; throw error;
    }
  });
  const rows = await mod.fetchPersonnelPhotoResults(['단계감리원A', '단계감리원B']);
  assert(rows.every(r => r.ok));
  assert.deepEqual(deadlines, calls.map(p => p.method === 'logout' ? 10000 : 60000));
  assert.equal(calls.filter(p => p.method === 'download' && p.path.includes('단계감리원A')).length, 1);
  assert.equal(calls.filter(p => p.method === 'download' && p.path.includes('단계감리원B')).length, 2);
  assert.equal(calls.filter(p => p.method === 'login').length, 2);
});
test('NAS photo timeout exhaustion is distinct from connection failure and file-not-found', async t => {
  const { mod, calls } = await nas(t, p => {
    if (p.method === 'download') { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; }
  });
  const [row] = await mod.fetchPersonnelPhotoResults(['단계감리원']);
  assert.equal(row.ok, false); assert.equal(row.error, 'nas_timeout'); assert.equal(row.stage, 'download');
  assert.equal(calls.filter(p => p.method === 'download').length, 2); assert.equal(row.dataUri, undefined);
});
test('NAS transient gateway errors retry while permission errors do not', async t => {
  let tries = 0;
  const { mod, calls } = await nas(t, p => {
    if (p.method === 'download' && p.path.includes('일시실패') && tries++ === 0) return new Response('busy', { status: 503 });
    if (p.method === 'download' && p.path.includes('권한없음')) return Response.json({ success: false, error: { code: 407 } });
  });
  const rows = await mod.fetchPersonnelPhotoResults(['일시실패', '권한없음']);
  assert(rows[0].ok); assert.equal(rows[1].code, 407);
  assert.equal(calls.filter(p => p.method === 'download' && p.path.includes('권한없음')).length, 1);
});

test('expired session is retried; already successful photos are not downloaded twice', async t => {
  let secondAttempts = 0;
  const { mod, calls } = await nas(t, p => {
    if (p.method === 'download' && p.path.includes('인력B') && secondAttempts++ === 0) return Response.json({ success: false, error: { code: 106 } });
  });
  const rows = await mod.fetchPersonnelPhotoResults(['인력A', '인력B']);
  assert.ok(rows.every(r => r.ok));
  assert.equal(calls.filter(p => p.method === 'login').length, 2);
  assert.equal(calls.filter(p => p.method === 'download' && p.path.includes('인력A')).length, 1);
});

test('photo batches serialize sessions and invalid names never reach NAS', async t => {
  const { mod, calls } = await nas(t);
  await Promise.all([mod.fetchPersonnelPhotoResults(['인력A']), mod.fetchPersonnelPhotoResults(['인력B'])]);
  assert.deepEqual(calls.map(c => c.method), ['login', 'download', 'logout', 'login', 'download', 'logout']);
  calls.length = 0;
  const rows = await mod.fetchPersonnelPhotoResults(['../secret', 'a/b', 'a\\b']);
  assert.ok(rows.every(r => r.error === 'invalid_name'));
  assert.equal(calls.length, 0);
});

test('configured photo folder overrides default; malformed responses are not accepted', async t => {
  const { mod, calls } = await nas(t, p => p.method === 'download' && new Response('<html>error</html>'));
  process.env.NAS_PHOTO_FOLDER = '/configured/photos/';
  const [row] = await mod.fetchPersonnelPhotoResults(['인력A']);
  assert.equal(row.error, 'nas_invalid_response');
  assert.equal(JSON.parse(calls.find(c => c.method === 'download').path)[0], '/configured/photos/증명사진(인력A).png');
});

test('name route bypasses dynamic id route; batch is read-only and validates input', async t => {
  const { calls, url } = await nas(t);
  const db = moduleUrl('export async function query(){throw new Error("DB must not be accessed")}; export const queryOne=query;');
  const routes = routeSource.replace("'hono'", JSON.stringify(import.meta.resolve('hono')))
    .replace("'../db/client.js'", JSON.stringify(db)).replace("'../lib/nas-client.js'", JSON.stringify(url));
  const { default: app } = await import(moduleUrl(routes));
  const r = await app.request('/photo-image-by-name?name=' + encodeURIComponent('가상인력'));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const batch = await app.request('/photo-images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ names: ['인력A', '인력B'] }) });
  assert.equal((await batch.json()).results.length, 2);
  const before = calls.length;
  for (const names of [[], ['../escape'], [23], Array(101).fill('가')]) {
    const bad = await app.request('/photo-images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ names }) });
    assert.equal(bad.status, 400);
  }
  assert.equal(calls.length, before);
});

async function complianceApi({ member = { person_name: '시험PM' }, person = { name: '시험PM', auditor_start_date: '2020.07', career_expert: '등록 주요이력' }, history = [], fail = false } = {}) {
  const db = moduleUrl(`export const calls = [];
    export async function queryOne(sql, params) {
      if (!/^SELECT /i.test(sql)) throw new Error('Read-only SELECT required');
      calls.push({sql, params}); if (${fail}) throw new Error('db secret must not leak');
      return sql.includes('proposal_members') ? ${JSON.stringify(member)} : ${JSON.stringify(person)};
    }
    export async function query(sql, params) {
      if (!/^SELECT /i.test(sql) || !sql.includes('personnel_audit_history')) throw new Error('Unexpected query');
      calls.push({sql, params}); return ${JSON.stringify(history)};
    }
    // instance ${sequence++}`);
  const nas = moduleUrl('export function fetchPersonnelPhotoResults(){throw new Error("NAS forbidden")}; export function validPhotoName(){return true}');
  const routes = routeSource.replace("'hono'", JSON.stringify(import.meta.resolve('hono')))
    .replace("'../db/client.js'", JSON.stringify(db)).replace("'../lib/nas-client.js'", JSON.stringify(nas));
  return { mod: await import(moduleUrl(routes)), db: await import(db) };
}
test('compliance DB summary counts role-specific history rows and matches personnel career years/months', async () => {
  const { mod } = await complianceApi();
  const history = Array.from({ length: 141 }, (_, i) => ({ audit_yearmonth: '2020.07', role: i < 19 ? '총괄 감리원' : '감리원' }));
  const result = mod.summarizeComplianceHistory({}, history, new Date(2026, 8, 18));
  assert.equal(result.directorCount, 19); assert.equal(result.auditCount, 141); assert.equal(result.career, '6년 2개월');
  const roles = ['총괄', '감리총괄', 'PM', '총괄(PM)', '부총괄', '비총괄', '총괄 보조', '감리원', null];
  const r = mod.summarizeComplianceHistory({ auditor_start_date: '2020.07' }, roles.map(role => ({ role })), new Date(2026, 8, 18));
  assert.equal(r.directorCount, 4); assert.equal(r.missingRoleCount, 1); assert.equal(r.career, '6년 2개월');
  assert.equal(mod.summarizeComplianceHistory({}, [], new Date(2026, 8, 18)).career, null);
  assert.equal(mod.summarizeComplianceHistory({ auditor_start_date: '2027.01' }, [], new Date(2026, 8, 18)).career, null);
  assert.equal(mod.summarizeComplianceHistory({ auditor_start_date: '2020.13' }, [], new Date(2026, 8, 18)).career, null);
});
test('compliance profile API uses linked personnel ID, SELECT-only data and no NAS', async () => {
  const { mod, db } = await complianceApi({ history: [{ role: '총괄', audit_yearmonth: '2020.07' }, { role: '감리원', audit_yearmonth: '2021.09' }] });
  const response = await mod.default.request('/7/compliance-profile?projectId=42');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { data } = await response.json();
  assert.equal(data.personnelId, 7); assert.equal(data.projectId, 42); assert.equal(data.name, '시험PM');
  assert.equal(data.directorCount, 1); assert.equal(data.auditCount, 2); assert.equal(data.highlights, '등록 주요이력');
  assert.deepEqual(db.calls.map(c => c.params), [[42, 7], [7], [7]]);
  const count = db.calls.length;
  for (const path of ['/0/compliance-profile?projectId=42', '/7/compliance-profile', '/7.5/compliance-profile?projectId=42', '/7/compliance-profile?projectId=-1']) {
    assert.equal((await mod.default.request(path)).status, 400);
  }
  assert.equal(db.calls.length, count);
});
test('compliance profile returns personnel certificate number with linked proposal fallback', async () => {
  for (const [stored, fallback, expected] of [[' DB-307 ', 'OLD-01', 'DB-307'], [null, ' PROPOSAL-02 ', 'PROPOSAL-02'], ['', null, '']]) {
    const { mod, db } = await complianceApi({
      person: { name: '시험PM', auditor_cert_no: stored, auditor_start_date: '2020.07', career_expert: '' },
      member: { person_name: '시험PM', auditor_cert_no: fallback },
    });
    const response = await mod.default.request('/7/compliance-profile?projectId=42');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.certNo, expected);
    assert(db.calls[0].sql.includes('auditor_cert_no')); assert(db.calls[1].sql.includes('auditor_cert_no'));
  }
});
test('compliance profile distinguishes real zero history from unlinked person and DB failure', async () => {
  const zero = await complianceApi();
  const data = (await (await zero.mod.default.request('/7/compliance-profile?projectId=42')).json()).data;
  assert.equal(data.auditCount, 0); assert.equal(data.directorCount, 0);
  const absent = await complianceApi({ member: null });
  assert.equal((await absent.mod.default.request('/7/compliance-profile?projectId=42')).status, 404);
  assert.equal(absent.db.calls.length, 1);
  const failed = await complianceApi({ fail: true });
  const response = await failed.mod.default.request('/7/compliance-profile?projectId=42');
  assert.equal(response.status, 503); assert(!JSON.stringify(await response.json()).includes('secret'));
});

test('education profile reads linked personnel education fields only, with ID validation and no NAS', async () => {
  const { mod, db } = await complianceApi({ person: { education_name: ' 교육 A&B ', education_hours: '42.5', education_org: ' 교육기관 ' } });
  const response = await mod.default.request('/7/education-profile?projectId=42');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data, { personnelId: 7, projectId: 42, name: '시험PM', educationName: '교육 A&B', educationHours: 42.5, educationOrg: '교육기관' });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map(c => c.params), [[42, 7], [7]]);
  assert.equal(db.calls[1].sql, 'SELECT education_name, education_hours, education_org FROM personnel WHERE id = $1');
  for (const path of ['/0/education-profile?projectId=42', '/7/education-profile', '/7.5/education-profile?projectId=42', '/7/education-profile?projectId=-1', '/x/education-profile?projectId=42']) {
    assert.equal((await mod.default.request(path)).status, 400);
  }
  assert.equal(db.calls.length, 2);
});
test('education profile preserves actual zero and distinguishes missing or invalid hours', async () => {
  for (const [raw, expected] of [[0, 0], ['0', 0], [null, null], ['', null], [' ', null], [-1, null], ['unknown', null]]) {
    const { mod } = await complianceApi({ person: { education_hours: raw } });
    const response = await mod.default.request('/7/education-profile?projectId=42');
    const p = (await response.json()).data;
    assert.equal(p.educationHours, expected); assert.equal(p.educationName, ''); assert.equal(p.educationOrg, '');
  }
});
test('education profile rejects unlinked personnel, missing records and DB failure without substituting zero', async () => {
  for (const [opts, status, error] of [[{ member: null }, 404, 'person_not_in_proposal'], [{ person: null }, 404, 'person_not_found'], [{ fail: true }, 503, 'education_profile_unavailable']]) {
    const { mod, db } = await complianceApi(opts);
    const response = await mod.default.request('/7/education-profile?projectId=42');
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error });
    if (opts.member === null) assert.equal(db.calls.length, 1);
  }
});

function photoBrowser(fetch) {
  const c = vm.createContext({ fetch, atob, Uint8Array });
  vm.runInContext(detail.slice(detail.indexOf('async function loadProposalPhotos('), detail.indexOf('async function downloadPhotoAssignPptx(')), c);
  return c;
}
test('unlinked people receive distinct photos by name; repeated slots and TBD handled', async () => {
  const requests = [];
  const c = photoBrowser(async (_, init) => {
    requests.push(JSON.parse(init.body).names);
    return Response.json({ ok: true, results: [{ name: '인력A', ok: true, dataUri: 'data:image/png;base64,AQ==' }, { name: '인력B', ok: true, dataUri: 'data:image/png;base64,Ag==' }] });
  });
  const pages = [{ slotPeople: { 1: { personnelId: 0, name: '인력A' }, 2: { personnelId: 0, name: '인력B' } } }, { slotPeople: { 1: { personnelId: 0, name: '인력A' }, 2: { name: 'TBD1' } } }];
  const warnings = await c.loadProposalPhotos(pages);
  assert.deepEqual(requests, [['인력A', '인력B']]);
  assert.equal(new Uint8Array(pages[0].slotPeople[1].photoArrayBuffer)[0], 1);
  assert.equal(new Uint8Array(pages[0].slotPeople[2].photoArrayBuffer)[0], 2);
  assert.equal(new Uint8Array(pages[1].slotPeople[1].photoArrayBuffer)[0], 1);
  assert.match(warnings[0], /미정 인력/);
});

test('NAS failure warning preserves cause; stale images cleared', async () => {
  const c = photoBrowser(async () => Response.json({ ok: true, results: [{ name: '인력A', ok: false, error: 'nas_error', stage: 'download', code: 407 }] }));
  const p = { name: '인력A', photoArrayBuffer: new ArrayBuffer(2) };
  const warnings = await c.loadProposalPhotos([{ slotPeople: { 1: p } }]);
  assert.equal(p.photoArrayBuffer, undefined);
  assert.match(warnings[0], /NAS 조회 실패.*407/);
  assert.ok(!warnings[0].includes('실제 사진 없음'));
});

test('partial PPT downloads without confirm, while report stays attached', async () => {
  let clicked = false;
  const alerts = [];
  const c = vm.createContext({
    PptxGenJS: {}, JSZip: {}, parsedData: { projectTitle: '검증' },
    setBtnState() {}, buildProjectViewModel: () => ({}),
    generateProposalPpt: async () => ({ proposalReport: { status: '부분 생성' }, generateAsync: async () => new Blob(['pptx']) }),
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: () => ({ click() { clicked = true; } }) },
    setTimeout() {}, showAutoAlert: msg => alerts.push(msg), console,
    confirm() { throw new Error('confirmation must not block download'); },
  });
  vm.runInContext(engine.slice(engine.indexOf('async function downloadProposalPpt('), engine.indexOf('function invalidatePptMenuCache(')), c);
  await c.downloadProposalPpt(null);
  assert.equal(clicked, true);
  assert.ok(alerts.some(a => a.includes('다운로드했습니다')));
  assert.ok(!detail.slice(detail.indexOf('async function downloadPhotoAssignPptx('), detail.indexOf('// ── 전체 합본 PPT')).includes('confirm('));
});
