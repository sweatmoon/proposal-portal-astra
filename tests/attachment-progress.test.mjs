import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
import { parse } from 'node-html-parser';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('src/routes/ppt-attachment-bundle.ts');
const client = read('public/static/attachment-progress.js');
const moduleUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const MIME = 'application/x-attachment-progress';
function parser() {
  const window = { addEventListener() {} };
  vm.runInNewContext(client, { window, document: { addEventListener() {} }, Blob, TextDecoder, Uint8Array });
  return window.AttachmentProgress.readProgress;
}
async function deck(n) {
  const z = new JSZip();
  z.file('ppt/presentation.xml', '<p:presentation><p:sldIdLst>' + Array.from({ length: n }, (_, i) => '<p:sldId id="' + (256 + i) + '"/>').join('') + '</p:sldIdLst></p:presentation>');
  for (let i = 1; i <= n; i++) z.file('ppt/slides/slide' + i + '.xml', '<p:sld/>');
  return z;
}
let seq = 0;
async function app(t, options = {}) {
  const key = '__attachment_mock_' + seq++;
  const calls = [];
  const functions = [...source.matchAll(/import \{ (build\w+)/g)].map(m => m[1]);
  const mock = { queryOne: async sql => sql.includes('audit_projects') ? (options.project === null ? null : options.project || { project_name: '시험사업', client_org: '시험기관' }) : null, fetchClientLogo: async () => { throw new Error('No logo call without active master'); },
    prepareAttachmentMaster: async () => { throw new Error('No active master'); }, mergeWithAttachmentMaster: async () => { throw new Error('No active master'); },
    mergeDecksSharingMaster: async decks => {
    calls.push('merge'); if (options.fail === 'merge') throw new Error('합본 시험 오류');
    let n = 0; for (const z of decks) n += ((await z.file('ppt/presentation.xml').async('string')).match(/<p:sldId /g) || []).length;
    return deck(n);
  } };
  for (const name of functions) mock[name] = async (_buf, id, ...args) => {
    calls.push(name); options.observe?.(name, id, args);
    if (options.gate && name === functions[0]) await options.gate;
    if (options.fail === name) throw new Error('시험 NAS 조회 실패 <민감하지 않은 설명>');
    const n = name === 'buildCoverZip' ? 2 : name === 'buildCareerZip' ? 1 : 3;
    return { zip: await deck(n), personCount: 2, auditorCount: 2, peopleCount: 2, pageCount: n,
      skipped: name === 'buildLicenseCertificateZip' ? ['누락 <이름>'] : [],
      personnelResults: name === 'buildLicenseCertificateZip' ? [{ name: '성공인력', status: 'done', detail: '3장 포함' }, { name: '누락 <이름>', status: 'skipped', detail: '조회 결과 없음, 원인 미확정' }] : undefined,
      projectName: '시험사업' };
  };
  globalThis[key] = mock; t.after(() => delete globalThis[key]);
  const mockUrl = moduleUrl(Object.keys(mock).map(name => `export const ${name} = (...args) => globalThis[${JSON.stringify(key)}].${name}(...args);`).join('\n'));
  const js = compile(source).replace(/from ['"]([^'"]+)['"]/g, (_, path) => 'from ' + JSON.stringify(path.startsWith('.') ? mockUrl : import.meta.resolve(path)));
  return { route: (await import(moduleUrl(js))).default, calls };
}
function form(order = ['schedule', 'licenseCert']) {
  const f = new FormData(); f.set('order', JSON.stringify(order));
  for (const key of ['cover', ...order]) f.set(key, new Blob(['template']), key + '.pptx');
  return f;
}
const request = (route, body = form(), id = 1, streaming = true) => route.request('/' + id, { method: 'POST', body, headers: streaming ? { Accept: MIME } : {} });

test('attachment streaming sends actual ordered results, cover, merge and unchanged PPTX bytes', async t => {
  const { route, calls } = await app(t);
  const res = await request(route); assert.equal(res.headers.get('cache-control'), 'no-store');
  const events = []; const result = await parser()(res, e => events.push(e));
  assert.deepEqual(events.filter(e => e.type === 'start').map(e => e.key), ['master', 'schedule', 'licenseCert', 'cover', 'merge']);
  assert.equal(result.totalSlides, 8); assert.equal(result.blob.size, result.size);
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  assert.equal(Object.keys(zip.files).filter(k => /slide\d+\.xml$/.test(k)).length, 8);
  const item = events.find(e => e.type === 'item' && e.key === 'licenseCert');
  assert.equal(item.skipped[0], '누락 <이름>'); assert.equal(item.personnelResults[0].name, '성공인력');
  assert.deepEqual(calls, ['buildScheduleZip', 'buildLicenseCertificateZip', 'buildCoverZip', 'merge']);
});
test('attachment start event arrives while its builder is still pending, not fabricated completion', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const { route } = await app(t, { gate });
  const res = await request(route, form(['schedule']));
  let started; const start = new Promise(resolve => { started = resolve; });
  const events = [];
  const job = parser()(res, e => { events.push(e); if (e.type === 'start' && e.key === 'schedule') started(); });
  await start;
  assert.equal(events.some(e => e.type === 'item' && e.key === 'schedule'), false);
  release(); await job;
});
test('attachment failure preserves earlier results and stops without merging or returning a file', async t => {
  const { route, calls } = await app(t, { fail: 'buildLicenseCertificateZip' });
  const events = [];
  await assert.rejects(() => request(route).then(res => parser()(res, e => events.push(e))), e => e.itemKey === 'licenseCert' && /NAS/.test(e.message));
  assert(events.some(e => e.key === 'schedule' && e.type === 'item'));
  assert.equal(events.some(e => e.type === 'file'), false);
  assert.equal(calls.includes('merge'), false);
});
test('attachment merge failure remains an error even when every item succeeded', async t => {
  const { route } = await app(t, { fail: 'merge' });
  await assert.rejects(() => request(route).then(res => parser()(res, () => {})), e => e.itemKey === 'merge');
});
test('attachment legacy binary response remains compatible and slide totals use actual slide IDs', async t => {
  const { route } = await app(t);
  const res = await request(route, form(['career']), 1, false);
  assert(res.headers.get('content-type').includes('presentationml'));
  const summary = JSON.parse(decodeURIComponent(res.headers.get('X-Bundle-Summary')));
  assert.equal(summary[0].slideCount, 1); // not personCount * 2
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  assert.equal(Object.keys(zip.files).filter(k => /slide\d+\.xml$/.test(k)).length, 3);
});
test('attachment filenames preserve full saved names for stream and binary; free filename is fixed', async t => {
  const project = { project_name: '40자를 초과하는 사업명도 생략하지 않는 전체 사업명 검증입니다 '.repeat(3) + '끝/검증', client_org: '기관:원문' };
  const { route } = await app(t, { project });
  const expected = '[자동화][첨부] 기관_원문_' + project.project_name.replace('/', '_') + '.pptx';
  const f = form(); f.set('projectName', '조작'); f.set('clientOrg', '조작');
  assert.equal((await parser()(await request(route, f), () => {})).filename, expected);
  const binary = await request(route, form(), 1, false);
  assert.equal(decodeURIComponent(binary.headers.get('Content-Disposition').match(/filename="([^"]+)"/)[1]), expected);
  assert.equal((await parser()(await request(route, form(), 0), () => {})).filename, '[자동화][첨부] 커스텀생성.pptx');
  const missing = await app(t, { project: null });
  await assert.rejects(() => request(missing.route).then(res => parser()(res, () => {})), /사업을 찾을 수 없습니다/);
});
test('attachment free mode preserves names keywords and projectId=0 options', async t => {
  const { route } = await app(t, { observe: (name, id, args) => {
    if (name === 'buildCareerZip') {
      assert.equal(id, 0); assert.equal(args[1], true);
      assert.deepEqual(args[2].personnelNames, [{ name: '가', domain: 'DB' }]);
      assert.deepEqual(args[2].keywords, ['저장키워드']);
    }
  } });
  const f = form(['career']); f.set('careerOnePage', 'true'); f.set('personnelNames', JSON.stringify([{ name: '가', domain: 'DB' }])); f.set('freeKeywords', '["저장키워드"]');
  await parser()(await request(route, f, 0), () => {});
});
test('attachment validates missing files invalid IDs and unknown or repeated items before stream or NAS', async t => {
  const { route, calls } = await app(t);
  for (const [f, id] of [[form(), 1.5], [form(['__proto__']), 1], [form(['schedule', 'schedule']), 1], [form(), -1]]) {
    assert.equal((await request(route, f, id)).status, 400);
  }
  const f = form(); f.delete('licenseCert'); assert.equal((await request(route, f)).status, 400);
  const bad = form(); bad.set('cover', 'not a file'); assert.equal((await request(route, bad)).status, 400);
  assert.equal(calls.length, 0);
});
function wire(events, bytes = new Uint8Array([80, 75, 3, 4, 255, 10, 0])) {
  const head = Buffer.from(events.map(e => JSON.stringify(e)).join('\n') + '\n');
  return Buffer.concat([head, bytes]);
}
function response(bytes, chunkSize = 1) {
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.subarray(i, i + chunkSize));
    controller.close();
  } }), { headers: { 'content-type': MIME } });
}
test('attachment parser handles split UTF-8 JSON boundaries and binary bytes including newline', async () => {
  const events = [{ type: 'ready', items: [] }, { type: 'start', key: '한글' }, { type: 'file', filename: '시험.pptx', size: 7, totalSlides: 1 }];
  for (const n of [1, 2, 13, 99999]) {
    const received = []; const result = await parser()(response(wire(events), n), e => received.push(e));
    assert.equal(received[1].key, '한글');
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), new Uint8Array([80, 75, 3, 4, 255, 10, 0]));
  }
});
test('attachment parser rejects truncated, oversized, invalid and missing file responses without retry', async () => {
  for (const [events, bytes] of [
    [[{ type: 'file', filename: 'a', size: 8 }], undefined],
    [[{ type: 'file', filename: 'a', size: 6 }], undefined],
    [[{ type: 'file', filename: 'a', size: 7 }], new Uint8Array(7)],
    [[{ type: 'ready' }], new Uint8Array(0)],
    [[{ type: 'file', filename: 'a', size: -1 }], undefined],
  ]) await assert.rejects(() => parser()(response(wire(events, bytes)), () => {}));
  await assert.rejects(() => parser()(Response.json({ error: '입력 검증 실패' }, { status: 400 }), () => {}), /입력 검증 실패/);
  await assert.rejects(() => parser()(new Response('not stream'), () => {}), /진행 응답/);
});

async function actualBuilder(t, path, mocks) {
  const key = '__builder_' + seq++;
  globalThis[key] = mocks; t.after(() => delete globalThis[key]);
  const mockUrl = moduleUrl(Object.keys(mocks).map(name => `export const ${name} = (...args) => globalThis[${JSON.stringify(key)}].${name}(...args);`).join('\n'));
  const js = compile(read(path)).replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(name.startsWith('.') ? mockUrl : import.meta.resolve(name)));
  return import(moduleUrl(js));
}
test('actual license builder reports included pages, empty PPTX and unavailable personnel without inferred causes', async t => {
  const template = readFileSync(new URL('../artifacts/safety_health_registered_template.pptx', import.meta.url));
  const empty = await new JSZip().generateAsync({ type: 'nodebuffer' });
  const mod = await actualBuilder(t, 'src/routes/ppt-license-certificate.ts', {
    fetchAuditorCertificatePptxs: async () => new Map([['성공', template], ['빈자료', empty]]),
    fetchCompanyStampPng: async () => null,
    query: async () => { throw new Error('No DB in free mode'); }, queryOne: async () => { throw new Error('No DB in free mode'); },
  });
  const result = await mod.buildLicenseCertificateZip(template, 0, false, '원본대조필', '', ['성공', '빈자료', '미수신']);
  assert.equal(result.personCount, 1); assert.equal(result.slideCount, 1);
  assert.deepEqual(result.skipped, ['빈자료', '미수신']);
  assert.equal(result.personnelResults[0].detail, '1장 포함');
  assert.match(result.personnelResults[1].detail, /슬라이드가 없습니다/);
  assert.match(result.personnelResults[2].detail, /구분되지 않습니다/);
});
test('actual career certificate builder preserves all PDF pages and adds truthful per-person results', async t => {
  const mod = await actualBuilder(t, 'src/routes/ppt-career-certificate.ts', {
    fetchCareerCertPdfs: async () => new Map([['성공', Buffer.from('pdf')]]),
    fetchCompanyStampPng: async () => null,
    pdfAllPagesToPng: async () => [Buffer.from('page1'), Buffer.from('page2')],
    buildStampedDeckZip: async (_template, _map, pages) => deck(pages.length),
    applyPlaceholderMap: xml => xml,
    query: async () => { throw new Error('No DB in free mode'); }, queryOne: async () => { throw new Error('No DB in free mode'); },
  });
  const result = await mod.buildCareerCertificateZip(Buffer.from('template'), 0, false, '원본대조필', '', ['성공', '미수신']);
  assert.equal(result.personCount, 1); assert.deepEqual(result.skipped, ['미수신']);
  assert.equal(result.personnelResults[0].detail, '2장 포함');
  assert.match(result.personnelResults[1].detail, /구분되지 않습니다/);
  assert(result.zip.file('ppt/slides/slide2.xml'));
});

export async function attachmentHtml() {
  const layout = moduleUrl(compile(read('src/views/layout.ts')));
  const db = moduleUrl('export async function query(){return []} export async function queryOne(){return null}');
  const js = compile(read('src/routes/pages.ts')).replace(/from ['"]([^'"]+)['"]/g, (_, path) => 'from ' + JSON.stringify(path === '../db/client.js' ? db : path === '../views/layout.js' ? layout : import.meta.resolve(path)));
  const route = (await import(moduleUrl(js))).default;
  const res = await route.request('/ppt-generate'); assert.equal(res.status, 200);
  return res.text();
}
test('attachment SSR connects both generation paths to accessible shared modal and preserves inputs', async () => {
  const html = await attachmentHtml(); const doc = parse(html);
  assert.equal(doc.querySelector('#bundleResultModal').getAttribute('role'), 'dialog');
  assert(doc.querySelector('#brProgress')); assert(doc.querySelector('#brReopen'));
  assert(doc.querySelector('script[src="/static/attachment-progress.js"]'));
  assert(html.includes('max-height:92vh')); assert(html.includes('max-w-5xl'));
  assert.equal((html.match(/AttachmentProgress.begin\(order/g) || []).length, 2);
  assert.equal((html.match(/await AttachmentProgress.request\(/g) || []).length, 2);
  assert.equal((html.match(/if \(AttachmentProgress.active\)/g) || []).length, 3);
  for (const script of doc.querySelectorAll('script:not([src])')) new vm.Script(script.rawText);
  assert(html.includes("fd.append('personnelNames'")); assert(html.includes("fd.append('careerCertStampNumber'"));
  assert(!html.includes('파일 다운로드 완료')); assert(!client.includes('innerHTML'));
});
