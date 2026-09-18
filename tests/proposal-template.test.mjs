import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const templateSource = readFileSync(new URL('../public/static/proposal-template.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../public/static/ppt-engine.js', import.meta.url), 'utf8');
function sandbox(extra = {}) {
  const c = vm.createContext({ DOMParser, XMLSerializer, JSZip, console, atob,
    document: { getElementById: () => null }, showAutoAlert() {}, ...extra });
  vm.runInContext(templateSource, c); vm.runInContext(engineSource, c);
  return c;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const para = (...parts) => `<a:p>${parts.map(p => `<a:r><a:rPr sz="1200"/><a:t>${esc(p)}</a:t></a:r>`).join('')}</a:p>`;
const shape = p => `<p:sp><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr><p:txBody>${p}</p:txBody></p:sp>`;
const slide = body => `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OR}"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
const cell = s => `<a:tc><a:txBody>${para(s)}</a:txBody></a:tc>`;
const row = values => `<a:tr>${values.map(cell).join('')}</a:tr>`;
const table = rows => `<p:graphicFrame><a:tbl>${rows.join('')}</a:tbl></p:graphicFrame>`;
async function template(body) {
  const z = new JSZip();
  z.file('ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${OR}"><p:sldMasterIdLst/><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9906000" cy="6858000"/></p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="${OR}/slide" Target="slides/slide1.xml"/></Relationships>`);
  z.file('ppt/slides/slide1.xml', slide(body));
  z.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="${R}"/>`);
  z.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>');
  return z.generateAsync({ type: 'base64' });
}
const menu = (code, b64) => ({ id: 1, menu_code: code, menu_name: '시험 제목', menu_number: '1.1', is_enabled: 1, category: 'proposal', children: [], sort_order: 1, rule: { merge_strategy: 'FOREIGN_TEMPLATE' }, templates: b64 ? [{ variant_code: 'DEFAULT', pptx_b64_key: b64 }] : [] });
function data() {
  return { projectTitle: '감리 사업 & 검증', targetProjectName: '대상 구축사업', clientOrg: 'A&B <기관>', targetStartDate: '2026-11-01', targetEndDate: '2027-02-28',
    requestMD: 100, requestStageCount: 1, requestAuditDays: 2,
    portalOrder: [{ name: '가', group: '감리원팀' }, { name: '나', group: '감리원팀' }],
    personGradeMap: { 가: { group: '감리원팀' }, 나: { group: '감리원팀' } }, personFieldMap: { 가: '응용', 나: 'DB' },
    stages: [{ stage: '설계', startDate: '2026-12-10', endDate: '2026-12-11', days: 2,
      감리원: { total: 999, people: [{ name: '가', pre: 1, audit: 4, post: 1 }, { name: '나', pre: 0, audit: 4, post: 0 }] }, 전문가: { people: [] } }],
  };
}
const docText = (c, xml) => c.ProposalTemplate.text(c.ProposalTemplate.parse(xml));

test('split runs, duplicate tokens, surrounding text and XML escaping survive', () => {
  const c = sandbox(), doc = c.ProposalTemplate.parse(slide(shape(para('앞 [주관', '기관] 뒤 [주관기관] 끝'))));
  const unresolved = c.ProposalTemplate.replace(doc, t => t === '[주관기관]' ? 'A&B <검증>' : undefined);
  assert.equal(unresolved.length, 0);
  assert.equal(c.ProposalTemplate.text(doc), '앞 A&B <검증> 뒤 A&B <검증> 끝');
  assert.equal(docText(c, new XMLSerializer().serializeToString(doc)), '앞 A&B <검증> 뒤 A&B <검증> 끝');
});
test('literal headings/references are not missing tokens; unknown fields stay visible', () => {
  const c = sandbox(), d = c.ProposalTemplate.parse(slide(shape(para('[붙임 2-1-1] [ 주요 자격 ] [미정필드]'))));
  assert.deepEqual(Array.from(c.ProposalTemplate.replace(d, () => undefined)), ['[미정필드]']);
});
test('MD sums are computed from assignments, not duplicated phase totals', () => {
  const c = sandbox(), ctx = c.ProposalTemplate.context(data());
  assert.equal(ctx.total.all, 10);
});
test('100 required / 10 proposed is unmet, never fulfilled by default', () => {
  const c = sandbox();
  let checks = c.ProposalTemplate.checks(c.ProposalTemplate.context(data(), { mdScope: 'all' }));
  assert.equal(checks[2].status, '미충족'); assert.equal(checks[3].status, '검토 필요');
  checks = c.ProposalTemplate.checks(c.ProposalTemplate.context(data()));
  assert.equal(checks[2].status, '검토 필요');
});
test('unknown requirements and empty staffing cannot be fulfilled', () => {
  const c = sandbox(), d = data(); d.requestMD = null; d.requestStageCount = null; d.requestAuditDays = null; d.stages = []; d.portalOrder = [];
  assert(c.ProposalTemplate.checks(c.ProposalTemplate.context(d, { mdScope: 'all' })).every(x => x.status === '검토 필요'));
});
test('additional stages and experts follow the explicitly selected MD basis', () => {
  const c = sandbox(), d = data(); d.requestMD = 15;
  d.stages.push({ ...d.stages[0], stage: '추가' });
  assert.equal(c.ProposalTemplate.checks(c.ProposalTemplate.context(d, { extraStages: ['추가'], mdScope: 'baseline-auditors' }))[2].status, '미충족');
  assert.equal(c.ProposalTemplate.checks(c.ProposalTemplate.context(d, { extraStages: ['추가'], mdScope: 'auditors' }))[2].status, '충족');
});
test('role normalization agrees with server data', () => {
  const c = sandbox(), d = data(); d.portalOrder.push({ name: '다', group: '전문가', expertSubGroup: '핵심기술' });
  d.personGradeMap.다 = { group: '전문가', expertSubGroup: '핵심기술' };
  const v = c.buildProjectViewModel(d); assert.equal(v.auditMembers.length, 2); assert.equal(v.coreExperts.length, 1);
});
test('dates reject impossible values and use UTC calendar arithmetic', () => {
  const c = sandbox(), T = c.ProposalTemplate;
  assert.equal(T.date('2026-02-30'), null); assert.equal(T.fmtDate(T.date('2024.02.29')), '2024.02.29');
  const map = T.scheduleMap(T.context(data()), menu('DETAIL_SCHEDULE')).map;
  assert.equal(map['[단계1시작일-7]'], '2026.12.03'); assert.equal(map['[n+2]'], 1);
});
test('missing template fails explicitly', async () => {
  const c = sandbox(); await assert.rejects(c.ProposalTemplate.build(menu('QA_SYSTEM'), { _raw: data() }), /템플릿/);
});
test('fixed template common fields preserve content and show missing data', async () => {
  const c = sandbox(), b64 = await template(shape(para('안내 [제', '목] / [주관기관] / [사업미정]')));
  const r = await c.ProposalTemplate.build(menu('AUDIT_PROCEDURE', b64), { _raw: data() });
  const text = docText(c, await r.zip.file('ppt/slides/slide1.xml').async('string'));
  assert.match(text, /A&B <기관>/); assert.match(text, /1.1 시험 제목/); assert.match(text, /\[사업미정\]/);
  assert(r.warnings.some(w => w.includes('미치환')));
});
test('registered schedule template fills year rollover, fields and dates', async () => {
  const c = sandbox(), b64 = await template(shape(para('[단계1] [단계1시작일] [단계1종료일] [단계2] [대상사업]')) + table([row(['기간', '2026년', '년', '년', '년', '년']), row(['대상', '[n]월', '[n+1]월', '[n+2]월', '[n+3]월', '[n+4]월'])]));
  const r = await c.ProposalTemplate.build(menu('SCHEDULE_PLAN', b64), { _raw: data() });
  const txt = docText(c, await r.zip.file('ppt/slides/slide1.xml').async('string'));
  assert.match(txt, /2026\.12\.10/); assert.match(txt, /2027년/); assert.match(txt, /11월12월1월2월3월/);
  assert(!txt.includes('[단계'));
});
test('stage capacity overflow is rejected rather than silently truncated', async () => {
  const c = sandbox(), d = data(); d.stages = Array.from({ length: 5 }, (_, i) => ({ ...d.stages[0], stage: `단계${i}` }));
  const b64 = await template(shape(para('[단계1]')));
  await assert.rejects(c.ProposalTemplate.build(menu('SCHEDULE_PLAN', b64), { _raw: d }), /초과/);
});
test('detail blocks remove absent stages and separate resident/acceptance MD', async () => {
  const c = sandbox(), d = data();
  d.stages.push({ ...d.stages[0], stage: '상주감리', 감리원: { people: [{ name: '가', pre: 0, audit: 20, post: 0 }] } });
  d.stages.push({ ...d.stages[0], stage: '검수지원', 감리원: { people: [{ name: '나', pre: 0, audit: 5, post: 0 }] } });
  const b64 = await template(table([
    row(['단계', '활동', '절차', '일정', 'MD']), row(['[단계1]', '감리시행', '착수회의', '[단계1시작일]', '(0)일 / (0)MD']),
    row(['[단계2]', '감리시행', '착수회의', '[단계2시작일]', '(0)일 / (0)MD']),
    row(['상주감리', '감리시행', '상주감리', '[단계5시작일]', '(0)일 / (0)MD']),
    row(['검수지원', '감리시행', '검수지원', '종료', '(0)일 / (0)MD']), row(['단계 감리팀 투입 공수 합계', '', '', '', '총 0MD'])]));
  const r = await c.ProposalTemplate.build(menu('DETAIL_SCHEDULE', b64), { _raw: d });
  const txt = docText(c, await r.zip.file('ppt/slides/slide1.xml').async('string'));
  assert.match(txt, /20\)MD/); assert.match(txt, /5\)MD/); assert.match(txt, /총 35MD/); assert(!txt.includes('[단계2]'));
});
test('action-confirmation repeated name tokens are resolved per phase column', async () => {
  const c = sandbox(), d = data();
  d.stages.push({ ...d.stages[0], stage: '종료', 감리원: { people: [{ name: '가', pre: 0, audit: 1, post: 0 }, { name: '나', pre: 0, audit: 1, post: 2 }] } });
  const b64 = await template(table([row(['단계', '', '', '[단계1]', '[단계2]', '[단계3]', '설명']),
    row(['인력', '[그룹1]', '[세부1]', '[이름1]', '[이름1]', '[이름1]', '']),
    row(['', '[그룹2]', '[세부2]', '[이름2]', '[이름2]', '[이름2]', '']),
    row(['합계', '', '', '[단계1MD]', '[단계2MD]', '[단계3MD]', ''])]));
  const r = await c.ProposalTemplate.build(menu('ACTION_CONFIRM_STAFF', b64), { _raw: d });
  const doc = c.ProposalTemplate.parse(await r.zip.file('ppt/slides/slide1.xml').async('string'));
  const rows = c.ProposalTemplate.nodes(doc, 'tr');
  const values = r => c.ProposalTemplate.nodes(r, 'tc').map(c.ProposalTemplate.text);
  assert.deepEqual(Array.from(values(rows[1]).slice(3, 6)), ['가', '', '']);
  assert.deepEqual(Array.from(values(rows[2]).slice(3, 6)), ['', '나', '']);
  assert.deepEqual(Array.from(values(rows[3]).slice(3, 6)), ['1', '2', '']);
});
test('registry retries after failed requests instead of caching rejected promise', async () => {
  let calls = 0;
  const c = sandbox({ fetch: async url => { assert.match(url, /category=proposal/); if (++calls === 1) throw new Error('temporary'); return { json: async () => ({ ok: true, data: [] }) }; } });
  await assert.rejects(vm.runInContext('PptMenuRegistry.load()', c));
  await vm.runInContext('PptMenuRegistry.load()', c); assert.equal(calls, 2);
});
test('merged parts preserve media content types and external links', async () => {
  const c = sandbox(), b64 = await template(shape(para('검증')));
  const base = await JSZip.loadAsync(b64, { base64: true });
  const src = await JSZip.loadAsync(b64, { base64: true });
  src.file('ppt/media/test.png', new Uint8Array([1, 2, 3]));
  src.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="rImg" Type="${OR}/image" Target="../media/test.png"/><Relationship Id="rExt" Type="${OR}/hyperlink" Target="mailto:test@example.com" TargetMode="External"/></Relationships>`);
  src.file('[Content_Types].xml', (await src.file('[Content_Types].xml').async('string')).replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  const result = await c.mergePresentationZips([{ zip: base }, { zip: src, mergeStrategy: 'FOREIGN_TEMPLATE' }]);
  assert(result.file('ppt/media/p1_test.png'));
  assert.match(await result.file('[Content_Types].xml').async('string'), /ContentType="image\/png"/);
  const rels = await result.file('ppt/slides/_rels/p1_slide1.xml.rels').async('string');
  assert.match(rels, /mailto:test@example.com/); assert.match(rels, /media\/p1_test.png/);
  assert.equal((await c.ProposalTemplate.slidePaths(result)).length, 2);
});
test('source master IDs are unique and within the OOXML master range', async () => {
  const c = sandbox(), b64 = await template(shape(para('검증')));
  const base = await JSZip.loadAsync(b64, { base64: true }), src = await JSZip.loadAsync(b64, { base64: true });
  src.file('ppt/_rels/presentation.xml.rels', (await src.file('ppt/_rels/presentation.xml.rels').async('string')).replace('</Relationships>', `<Relationship Id="rId2" Type="${OR}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId3" Type="${OR}/slideMaster" Target="slideMasters/slideMaster2.xml"/></Relationships>`));
  src.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${P}"/>`); src.file('ppt/slideMasters/slideMaster2.xml', `<p:sldMaster xmlns:p="${P}"/>`);
  const z = await c.mergePresentationZips([{ zip: base }, { zip: src, mergeStrategy: 'FOREIGN_TEMPLATE' }]);
  const ids = [...(await z.file('ppt/presentation.xml').async('string')).matchAll(/<p:sldMasterId\b[^>]*\bid="(\d+)"/g)].map(m => +m[1]);
  assert.equal(ids.length, 2); assert.equal(new Set(ids).size, 2); assert(ids.every(x => x >= 2147483648));
});
test('partial generation reports failed menus without fallback or false success', async () => {
  const b64 = await template(shape(para('[제목]'))), good = menu('QA_SYSTEM', b64), bad = { ...menu('ORGANIZATION'), id: 2 };
  const c = sandbox({ fetch: async url => ({ ok: true, json: async () => url.includes('master-templates') ? { ok: true, data: null } : { ok: true, data: [good, bad] } }) });
  const zip = await c.generateProposalPpt(c.buildProjectViewModel(data()));
  assert.equal(zip.proposalReport.status, '부분 생성');
  assert.equal(zip.proposalReport.entries[1].status, '생성 실패');
  assert.equal((await c.ProposalTemplate.slidePaths(zip)).length, 1);
});
