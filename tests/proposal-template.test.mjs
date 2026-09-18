import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import ts from 'typescript';
import { parse as parseHtml } from 'node-html-parser';

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

const complianceB64 = readFileSync(new URL('../public/static/compliance-template.pptx', import.meta.url)).toString('base64');
function complianceSandbox(values = {}) {
  return sandbox({ document: { getElementById: id => ({ value: values[id] || '' }) } });
}
const complianceChoices = { 'proposal-compliance-pm': '가' };
function complianceFixture() {
  const d = data(); d.requestMD = 10;
  d.personGradeMap.가 = { group: '감리원팀', grade: '수석감리원', residency: '상근', fulltimeKnown: true, certNo: 'A-01' };
  d.personGradeMap.나 = { group: '감리원팀', grade: '수석감리원', residency: '비상근', fulltimeKnown: false };
  d.pmName = '저장된제안총괄';
  return d;
}
function visibleComplianceText(c, xml) {
  const doc = c.ProposalTemplate.parse(xml), tree = doc.getElementsByTagNameNS(P, 'spTree')[0];
  return Array.from(tree.childNodes).filter(n => n.nodeType === 1).slice(2, 7).map(c.ProposalTemplate.text).join('');
}
function withoutText(c, xml) {
  const doc = c.ProposalTemplate.parse(xml);
  for (const t of c.ProposalTemplate.nodes(doc, 't')) { t.textContent = ''; t.removeAttribute('xml:space'); }
  return new XMLSerializer().serializeToString(doc);
}
test('3.6 uses uploaded one-slide design; replaces every visible token and preserves XML styling, relationships and off-slide references', async () => {
  const c = complianceSandbox(complianceChoices), original = await JSZip.loadAsync(complianceB64, { base64: true });
  const result = await c.ProposalTemplate.build(menu('COMPLIANCE', complianceB64), complianceFixture());
  assert.equal(result.slideCount, 1);
  const path = 'ppt/slides/slide1.xml', before = await original.file(path).async('string'), after = await result.zip.file(path).async('string');
  const shown = visibleComplianceText(c, after);
  assert(!/\[[^\]]+\]/.test(shown)); assert(shown.includes('기본 1단계'));
  assert(shown.includes('전체 배정 공수: 10 MD')); assert(shown.includes('수석감리원 / 상근 / 자격번호 A-01'));
  assert(!shown.includes('이승학')); assert(!shown.includes('100% 충족')); assert(!shown.includes('221'));
  assert.equal(withoutText(c, after), withoutText(c, before));
  const treeBefore = c.ProposalTemplate.parse(before).getElementsByTagNameNS(P, 'spTree')[0];
  const treeAfter = c.ProposalTemplate.parse(after).getElementsByTagNameNS(P, 'spTree')[0];
  const ser = n => new XMLSerializer().serializeToString(n);
  assert.deepEqual(Array.from(treeAfter.childNodes).slice(7).map(ser), Array.from(treeBefore.childNodes).slice(7).map(ser));
  for (const path of Object.keys(original.files).filter(p => !original.files[p].dir && !/^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p))) {
    assert.deepEqual(await result.zip.file(path).async('uint8array'), await original.file(path).async('uint8array'), path);
  }
  assert(!result.warnings.some(w => w.includes('미치환')));
});
test('3.6 does not infer PM or verified residency and career from director/legacy labels', () => {
  const c = sandbox(), d = complianceFixture();
  let result = c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d), menu('COMPLIANCE'));
  assert(result.map['[총괄감리원]'].includes('미지정')); assert(!result.map['[총괄감리원]'].includes(d.pmName));
  assert(result.map['[감리원구성]'].includes('미확인 1명')); assert(!result.map['[감리원구성]'].includes('50%'));
  assert.equal(result.map['[총괄판정]'], '검토 필요'); assert.equal(result.map['[감리원판정]'], '검토 필요');
  assert.equal(result.map['[공통판정]'], '검토 필요'); assert(result.map['[총괄경력]'].includes('증빙 확인 필요'));
  result = c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d, { compliancePM: '미배정인력' }), menu('COMPLIANCE'));
  assert(result.map['[총괄감리원]'].includes('미지정'));
});
test('3.6 automatically requires every base stage to meet stored days, never a sum or stale total choice', () => {
  const c = sandbox(), d = complianceFixture(); d.requestStageCount = 3; d.requestAuditDays = 5;
  d.stages[0].days = 5;
  d.stages.push({ ...d.stages[0], stage: '구현', days: 4 }, { ...d.stages[0], stage: '종료', days: 6 },
    { ...d.stages[0], stage: '검수지원', days: 2 }, { ...d.stages[0], stage: '추가제안', days: 1 });
  const calc = dayScope => c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d, { dayScope, extraStages: ['추가제안'] }), menu('COMPLIANCE'));
  for (const legacy of ['', 'per-stage', 'total']) assert.equal(calc(legacy).map['[방법일수판정]'], '미충족');
  assert(calc('total').map['[일수비교기준]'].endsWith('4일'));
  assert(calc('').map['[단계별감리일정]'].includes('검수지원'));
  d.stages[1].days = 5;
  assert.equal(calc('').map['[방법일수판정]'], '충족');
  d.requestAuditDays = '6'; assert.equal(calc('').map['[방법일수판정]'], '미충족');
  d.requestAuditDays = 5; d.stages[0].endDate = '2020-01-01';
  assert.equal(calc('').map['[방법일수판정]'], '검토 필요');
});
test('3.6 missing/invalid days remain review, known zero or short stage fails even if another stage is unknown', () => {
  const c = sandbox(), d = complianceFixture(); d.requestStageCount = 2; d.requestAuditDays = 5;
  d.stages[0].days = 5; d.stages.push({ ...d.stages[0], stage: '종료' });
  const calc = () => c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d), menu('COMPLIANCE'));
  for (const value of [null, undefined, '', -1, 'bad']) {
    d.stages[1].days = value;
    assert.equal(calc().map['[방법일수판정]'], '검토 필요');
  }
  d.stages[0].days = 4; d.stages[1].days = null;
  assert.equal(calc().map['[방법일수판정]'], '미충족');
  d.stages[1].days = 0; assert.equal(calc().map['[방법일수판정]'], '미충족');
  d.requestAuditDays = null; assert.equal(calc().map['[방법일수판정]'], '검토 필요');
});
test('3.6 automatically compares total MD and rejects missing/negative/non-numeric/raw-null MD', () => {
  const c = sandbox(), d = complianceFixture();
  const calc = opt => c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d, opt), menu('COMPLIANCE'));
  assert.equal(calc({}).map['[공수판정]'], '충족');
  assert.equal(calc({ mdScope: 'all' }).map['[공수판정]'], '충족');
  assert(calc({ mdScope: 'all' }).map['[공수비교내역]'].includes('100%'));
  d.requestMD = '20'; assert.equal(calc({ mdScope: 'all' }).map['[공수판정]'], '미충족');
  for (const invalid of [null, -1, 'bad', '']) {
    d.stages[0].감리원.people[0].pre = invalid;
    assert.equal(calc({ mdScope: 'all' }).map['[공수판정]'], '검토 필요');
  }
  d.stages[0].감리원.people[0].pre = 0; d.stages[0].감리원.people[0].mdComplete = false;
  assert.equal(calc({ mdScope: 'all' }).map['[공수판정]'], '검토 필요');
  d.stages = []; assert.equal(calc({ mdScope: 'all' }).map['[공수판정]'], '검토 필요');
});
test('3.6 deduplicates actually assigned staff and separates expert categories without inventing experience', () => {
  const c = sandbox(), d = complianceFixture(); d.personGradeMap.나.fulltimeKnown = true;
  for (const [name, group, expertSubGroup] of [['핵', '전문가', '핵심기술'], ['필', '전문가', '필수기술'], ['보', '전문가', '보안진단'], ['테', '테스터', ''], ['기타', '전문가', ''], ['미배정', '전문가', '핵심기술']]) {
    d.portalOrder.push({ name, group }); d.personGradeMap[name] = { group, expertSubGroup }; d.personFieldMap[name] = name + '&분야';
    if (name !== '미배정') d.stages[0].전문가.people.push({ name, pre: 0, audit: 1, post: 0 });
  }
  d.stages.push({ ...d.stages[0], stage: '종료' });
  const { map } = c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d, { mdScope: 'all' }), menu('COMPLIANCE'));
  assert(map['[감리원구성]'].includes('감리원 2명')); assert(map['[감리원구성]'].includes('50%'));
  for (const label of ['핵심 기술 1명', '필수 기술 1명', '보안 진단 1명', '테스트 1명', '기타/미분류 1명']) assert(map['[전문가구성]'].includes(label));
  assert(!map['[전문가구성]'].includes('미배정')); assert.equal(map['[전문가공수]'], 8); assert.equal(map['[테스트공수]'], 2);
  assert.equal(map['[공통판정]'], '검토 필요');
});
test('3.6 still rejects an absent template without fallback', async () => {
  const c = sandbox();
  await assert.rejects(c.ProposalTemplate.build(menu('COMPLIANCE'), data()), /DEFAULT/);
});
test('3.6 replaces only existing tokens; optional absence is not an error and unsupported tokens stay reported', async () => {
  const c = sandbox();
  for (const code of ['COMPLIANCE', 'SUMMARY_TABLE']) {
    const b64 = await template(shape(para('고정 문구: 100% 충족')) + shape(para('[요구 단계] / [공수합계] / [지원하지않는토큰]')));
    const result = await c.ProposalTemplate.build(menu(code, b64), data());
    const txt = docText(c, await result.zip.file('ppt/slides/slide1.xml').async('string'));
    assert(txt.includes('고정 문구: 100% 충족')); assert(txt.includes('1 / 10 / [지원하지않는토큰]'));
    assert.equal(result.slideCount, 1);
    assert(result.warnings.some(w => w.includes('미치환: [지원하지않는토큰]')));
    assert(!result.warnings.some(w => /누락 토큰|완성 양식/.test(w)));
    const fixed = await c.ProposalTemplate.build(menu(code, await template(shape(para('고정 문구만 있는 장표')))), data());
    assert.equal(docText(c, await fixed.zip.file('ppt/slides/slide1.xml').async('string')), '고정 문구만 있는 장표');
    assert(!fixed.warnings.some(w => w.includes('미치환')));
  }
});
test('3.6 preserves fixed summary and status cells in the original design instead of inferring replacements', async () => {
  const c = complianceSandbox(complianceChoices), z = await JSZip.loadAsync(complianceB64, { base64: true });
  const path = 'ppt/slides/slide1.xml', doc = c.ProposalTemplate.parse(await z.file(path).async('string'));
  const fixed = { '[준수요약]': '제안요청 사항 100% 충족', '[추가제안요약]': '사업 성공에 필요한 추가 제안',
    '[방법일수판정]': '충족', '[공수판정]': '충족', '[총괄판정]': '충족', '[감리원판정]': '충족', '[공통판정]': '충족' };
  c.ProposalTemplate.replace(doc, token => fixed[token]);
  const serialize = n => new XMLSerializer().serializeToString(n);
  z.file(path, serialize(doc));
  const fixedParagraphs = c.ProposalTemplate.nodes(doc, 'p').map((p, i) => ({ p, i }))
    .filter(({ p }) => !/\[[^\]]+\]/.test(c.ProposalTemplate.text(p)));
  const result = await c.ProposalTemplate.build(menu('COMPLIANCE', await z.generateAsync({ type: 'base64' })), data());
  const afterXML = await result.zip.file(path).async('string'), after = c.ProposalTemplate.parse(afterXML);
  assert(visibleComplianceText(c, afterXML).includes('제안요청 사항 100% 충족'));
  assert(visibleComplianceText(c, afterXML).includes('전체 배정 공수: 10 MD'));
  for (const { p, i } of fixedParagraphs) assert.equal(serialize(c.ProposalTemplate.nodes(after, 'p')[i]), serialize(p));
  assert.equal(withoutText(c, afterXML), withoutText(c, serialize(doc)));
  assert(!result.warnings.some(w => /누락 토큰|미치환/.test(w)));
  // 고정 문구의 보존은 자동 검증 성공을 의미하지 않는다. 기존 계산 보고는 유지한다.
  assert(result.warnings.some(w => w === '투입 공수: 미충족'));
});
test('COMPLIANCE and SUMMARY_TABLE dispatch registered template and preserve content after foreign merge', async () => {
  const c = complianceSandbox(complianceChoices);
  for (const code of ['COMPLIANCE', 'SUMMARY_TABLE']) {
    const result = await c.generateMenuPpt(menu(code, complianceB64), c.buildProjectViewModel(complianceFixture()));
    assert.equal(result.slideCount, 1);
    const first = { zip: await JSZip.loadAsync(await template(shape(para('첫 장'))), { base64: true }), mergeStrategy: 'FOREIGN_TEMPLATE' };
    const merged = await c.mergePresentationZips([first, result]);
    const paths = await c.ProposalTemplate.slidePaths(merged); assert.equal(paths.length, 2);
    assert(visibleComplianceText(c, await merged.file(paths[1]).async('string')).includes('전체 배정 공수: 10 MD'));
    assert(merged.file('ppt/slides/_rels/' + paths[1].split('/').pop() + '.rels'));
  }
});
test('3.6 retains long schedules, warns about overflow and never adds slides or shrinks text', async () => {
  const c = complianceSandbox(complianceChoices), d = complianceFixture();
  d.stages = Array.from({ length: 25 }, (_, i) => ({ ...d.stages[0], stage: '단계' + (i + 1) }));
  const r = await c.ProposalTemplate.build(menu('COMPLIANCE', complianceB64), d);
  const original = await JSZip.loadAsync(complianceB64, { base64: true });
  const after = await r.zip.file('ppt/slides/slide1.xml').async('string');
  assert(visibleComplianceText(c, after).includes('단계25')); assert.equal(r.slideCount, 1);
  assert(r.warnings.some(w => w.includes('높이 초과')));
  assert.equal(withoutText(c, after), withoutText(c, await original.file('ppt/slides/slide1.xml').async('string')));
});
const summaryFunctionSource = readFileSync(new URL('../public/static/proposal-detail.js', import.meta.url), 'utf8').split('async function downloadSummaryTablePptx')[1].split('// ── 전체 합본 PPT')[0];
test('standalone 3.6 reloads registry, returns same template result and downloads despite warnings', async () => {
  const c = complianceSandbox(complianceChoices); let clicked = 0, calls = 0;
  c.parsedData = complianceFixture(); c.setBtnState = () => {}; c.setTimeout = fn => fn();
  c.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
  c.fetch = async url => { assert.equal(url, '/api/ppt-menus?category=proposal'); calls++; return { json: async () => ({ ok: true, data: [menu('COMPLIANCE', complianceB64)] }) }; };
  c.document.createElement = () => ({ click() { clicked++; }, remove() {} }); c.document.body = { appendChild() {} };
  vm.runInContext('renderProposalReport = () => { reportCalls++; }', Object.assign(c, { reportCalls: 0 }));
  vm.runInContext('async function downloadSummaryTablePptx' + summaryFunctionSource, c);
  const result = await c.downloadSummaryTablePptx(null, { returnZip: true });
  assert.equal(result.slideCount, 1); assert(result.warnings.length > 0);
  await c.downloadSummaryTablePptx(null); assert.equal(clicked, 1); assert.equal(c.reportCalls, 1); assert.equal(calls, 2);
});

const tsModuleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const pageSource = readFileSync(new URL('../src/routes/pages.ts', import.meta.url), 'utf8');
const layoutModule = tsModuleUrl(readFileSync(new URL('../src/views/layout.ts', import.meta.url), 'utf8'));
async function renderRequirements(values, members = [], phases = []) {
  const project = { id: 1, project_name: '요구사항 시험 사업', ...values };
  const dbModule = tsModuleUrl(`export async function query(sql) {
    if (!/^\\s*SELECT\\b/i.test(sql)) throw new Error('Read-only test');
    if (sql.includes('FROM proposal_members')) return ${JSON.stringify(members)};
    if (sql.includes('FROM audit_phases')) return ${JSON.stringify(phases)};
    return [];
  } export async function queryOne() { return ${JSON.stringify(project)}; }`);
  const source = pageSource.replace("'hono'", JSON.stringify(import.meta.resolve('hono')))
    .replace("'../db/client.js'", JSON.stringify(dbModule))
    .replace("'../views/layout.js'", JSON.stringify(layoutModule));
  const { default: app } = await import(tsModuleUrl(source));
  const response = await app.request('/proposals/1');
  assert.equal(response.status, 200);
  const html = parseHtml(await response.text());
  const section = html.querySelector('#audit-requirements'); assert(section);
  assert.equal(section.getAttribute('aria-labelledby'), 'audit-requirements-heading');
  return { html, section, values: section.querySelectorAll('dd').map(el => el.text.trim()) };
}
test('3.6 SSR removes scope choices, retains PM selection and preserves unknown raw metadata without DB writes', async () => {
  const name = '가&나', result = await renderRequirements({}, [
    { person_name: name, member_group: '감리팀', is_fulltime: null },
    { person_name: '상근인력', member_group: '감리팀', is_fulltime: true },
    { person_name: '비상근인력', member_group: '감리팀', is_fulltime: false },
    { person_name: '정수상근', member_group: '감리팀', is_fulltime: 1 },
    { person_name: '정수비상근', member_group: '감리팀', is_fulltime: 0 },
  ], [{ phase_name: '설계', phase_days: 5, assignments: [
    { person_name: name, pre_survey_md: null, audit_md: 5, action_confirm_md: 0 },
    { person_name: '상근인력', pre_survey_md: 0, audit_md: 5, action_confirm_md: 0 },
  ] }]);
  const pmSelect = result.html.querySelector('#proposal-compliance-pm');
  assert.equal(pmSelect.querySelectorAll('option')[1].getAttribute('value'), name);
  assert.equal(pmSelect.querySelector('option').getAttribute('value'), '');
  assert.equal(result.html.querySelector('#proposal-day-scope'), null);
  assert.equal(result.html.querySelector('#proposal-md-scope'), null);
  const basis = result.html.querySelector('#proposal-comparison-basis');
  assert(basis.text.includes('감리원·전문가·테스터'));
  assert(basis.text.includes('각 기본 일반단계'));
  assert(basis.text.includes('미입력'));
  assert(result.html.querySelector('a[href="/static/compliance-template.pptx"]'));
  const script = result.html.querySelectorAll('script').find(s => s.text.includes('var parsedData ='));
  const c = vm.createContext({}); vm.runInContext(script.text, c);
  assert.equal(c.parsedData.personGradeMap[name].fulltimeKnown, false);
  assert.equal(c.parsedData.personGradeMap['상근인력'].fulltimeKnown, true);
  assert.equal(c.parsedData.personGradeMap['비상근인력'].fulltimeKnown, true);
  assert.equal(c.parsedData.personGradeMap['정수상근'].fulltimeKnown, true);
  assert.equal(c.parsedData.personGradeMap['정수상근'].residency, '상근');
  assert.equal(c.parsedData.personGradeMap['정수비상근'].fulltimeKnown, true);
  assert.equal(c.parsedData.personGradeMap['정수비상근'].residency, '비상근');
  assert.equal(c.parsedData.stages[0].감리원.people[0].pre, 0);
  assert.equal(c.parsedData.stages[0].감리원.people[0].mdComplete, false);
  assert.equal(c.parsedData.stages[0].감리원.people[1].mdComplete, true);
});
test('proposal detail renders stored demand stages, days and MD together', async () => {
  const result = await renderRequirements({ required_phases: 3, required_audit_days: 5, required_md: 151, proposed_md: 126 });
  assert.deepEqual(result.section.querySelectorAll('dt').map(el => el.text.trim()), ['요구 단계', '요구 감리 일수', '요구 투입 공수']);
  assert.deepEqual(result.values, ['3 단계', '5 일', '151 MD']);
  assert(result.html.text.includes('제안투입공수')); assert(!result.section.text.includes('126'));
  const basis = result.html.querySelector('#proposal-comparison-basis');
  assert(basis.text.includes('151 MD')); assert(basis.text.includes('5 일'));
  const other = await renderRequirements({ required_phases: 2, required_audit_days: 7, required_md: 200 });
  const otherBasis = other.html.querySelector('#proposal-comparison-basis');
  assert(otherBasis.text.includes('200 MD')); assert(otherBasis.text.includes('7 일'));
  assert(!otherBasis.text.includes('151 MD'));
});
test('proposal demand display distinguishes missing values from zeros and numeric strings', async () => {
  assert.deepEqual((await renderRequirements({ required_phases: null, required_audit_days: null, required_md: null })).values, ['미입력', '미입력', '미입력']);
  assert.deepEqual((await renderRequirements({ required_phases: 0, required_audit_days: '0', required_md: '151.5' })).values, ['0 단계', '0 일', '151.5 MD']);
  assert.deepEqual((await renderRequirements({ required_phases: '', required_audit_days: -1, required_md: '<img src=x>' })).values, ['미입력', '미입력', '미입력']);
});

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
  assert.equal(checks[2].status, '미충족');
});
test('unknown requirements and empty staffing cannot be fulfilled', () => {
  const c = sandbox(), d = data(); d.requestMD = null; d.requestStageCount = null; d.requestAuditDays = null; d.stages = []; d.portalOrder = [];
  assert(c.ProposalTemplate.checks(c.ProposalTemplate.context(d, { mdScope: 'all' })).every(x => x.status === '검토 필요'));
});
test('all roles and additional stages count toward 151 MD without choices; stored thresholds are not hardcoded', async () => {
  const c = complianceSandbox({ 'proposal-md-scope': 'baseline-auditors', 'proposal-day-scope': 'total' });
  const d = complianceFixture(); d.requestMD = 151; d.requestAuditDays = 5; d.stages[0].days = 5;
  d.stages[0].감리원.people = [{ name: '가', pre: 0, audit: 100, post: 0 }];
  d.portalOrder.push({ name: '전', group: '전문가' }, { name: '테', group: '테스터' });
  d.personGradeMap.전 = { group: '전문가' }; d.personGradeMap.테 = { group: '테스터' };
  d.stages[0].전문가.people = [{ name: '전', pre: 0, audit: 20, post: 0 }, { name: '테', pre: 0, audit: 11, post: 0 }];
  d.stages.push({ ...d.stages[0], stage: '추가', days: 1, 감리원: { people: [{ name: '가', pre: 0, audit: 20, post: 0 }] }, 전문가: { people: [] } });
  c.getExtraSet = () => new Set(['추가']);
  for (const legacy of ['', 'baseline-auditors', 'auditors', 'all']) {
    const ctx = c.ProposalTemplate.context(d, { extraStages: ['추가'], mdScope: legacy });
    assert.equal(ctx.total.all, 151);
    assert.equal(c.ProposalTemplate.checks(ctx)[2].status, '충족');
    const result = c.ProposalTemplate.complianceData(ctx, menu('COMPLIANCE'));
    assert.equal(result.map['[공수판정]'], '충족'); assert(result.map['[공수비교내역]'].includes('100%'));
    assert.equal(result.map['[방법일수판정]'], '충족');
  }
  const built = await c.ProposalTemplate.build(menu('COMPLIANCE', complianceB64), d);
  const shown = visibleComplianceText(c, await built.zip.file('ppt/slides/slide1.xml').async('string'));
  assert(shown.includes('비교: 전체 인력 151 MD / 요구 대비 100%'));
  assert(shown.includes('기본 일반단계별 최소 5일'));
  assert(!shown.includes('비교 범위 미확정'));
  d.requestMD = 152;
  assert.equal(c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d), menu('COMPLIANCE')).map['[공수판정]'], '미충족');
  d.requestMD = null;
  assert.equal(c.ProposalTemplate.complianceData(c.ProposalTemplate.context(d), menu('COMPLIANCE')).map['[공수판정]'], '검토 필요');
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
test('required audit days common and schedule maps use stored project values including numeric strings and zero', () => {
  const c = sandbox(), T = c.ProposalTemplate, d = data();
  for (const value of [5, 7, ' 8 ', 2.5, '3.5', 0, '0']) {
    d.requestAuditDays = value;
    const ctx = T.context(d), m = menu('DETAIL_SCHEDULE');
    assert.equal(T.common(ctx, m)['[요구감리일수]'], Number(value));
    assert.equal(T.scheduleMap(ctx, m).map['[요구감리일수]'], Number(value));
  }
});
test('required audit days replace spaced and split runs without duplicating units or changing fixed text and formatting', async () => {
  const c = sandbox(), d = data(); d.requestAuditDays = 5; // Actual stage days remain 2.
  const body = shape(para('요구 [요구감리일수]일 / [요구 감리 일수]일 / [요구감리', '일수]일 / 고정 9일'));
  const original = await JSZip.loadAsync(await template(body), { base64: true });
  for (const part of ['slideLayouts/slideLayout1.xml', 'slideMasters/slideMaster1.xml']) {
    original.file(`ppt/${part}`, slide(shape(para('[요구감리', '일수]일'))));
  }
  const b64 = await original.generateAsync({ type: 'base64' });
  for (const code of ['DETAIL_SCHEDULE', 'SCHEDULE_PLAN', 'AUDIT_PROCEDURE']) {
    const result = await c.ProposalTemplate.build(menu(code, b64), { _raw: d });
    const path = 'ppt/slides/slide1.xml', after = await result.zip.file(path).async('string');
    assert.equal(docText(c, after), '요구 5일 / 5일 / 5일 / 고정 9일');
    assert.equal(withoutText(c, after), withoutText(c, await original.file(path).async('string')));
    assert(!result.warnings.some(w => w.includes('미치환')));
    for (const part of ['slideLayouts/slideLayout1.xml', 'slideMasters/slideMaster1.xml']) {
      assert.equal(docText(c, await result.zip.file(`ppt/${part}`).async('string')), '5일');
    }
  }
});
test('missing or invalid required audit days stay unresolved instead of becoming zero or actual stage days', async () => {
  const c = sandbox(), d = data(), b64 = await template(shape(para('[요구감리일수]일 / [미지원토큰] / 고정 5일')));
  for (const value of [null, undefined, '', '   ', -1, '-2', 'bad', '5일', Infinity, NaN]) {
    d.requestAuditDays = value;
    const result = await c.ProposalTemplate.build(menu('DETAIL_SCHEDULE', b64), { _raw: d });
    assert.equal(docText(c, await result.zip.file('ppt/slides/slide1.xml').async('string')), '[요구감리일수]일 / [미지원토큰] / 고정 5일');
    assert(result.warnings.some(w => w.includes('미치환') && w.includes('[요구감리일수]')));
    assert(result.warnings.some(w => w.includes('미치환') && w.includes('[미지원토큰]')));
  }
});
test('registered schedule template fills year rollover, fields and dates', async () => {
  const c = sandbox(), b64 = await template(shape(para('[단계1] [단계1시작일] [단계1종료일] [단계2] [대상사업]')) + table([row(['기간', '2026년', '년', '년', '년', '년']), row(['대상', '[n]월', '[n+1]월', '[n+2]월', '[n+3]월', '[n+4]월'])]));
  const r = await c.ProposalTemplate.build(menu('SCHEDULE_PLAN', b64), { _raw: data() });
  const txt = docText(c, await r.zip.file('ppt/slides/slide1.xml').async('string'));
  assert.match(txt, /2026\.12\.10/); assert.match(txt, /2027년/); assert.match(txt, /11월12월1월2월3월/);
  assert(!txt.includes('[단계'));
});
const sizedTable = (rows, widths, x = 500000, y = 1900000, h = 4000000) => `<p:graphicFrame><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${widths.reduce((a,b)=>a+b,0)}" cy="${h}"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tblPr/><a:tblGrid>${widths.map(w=>`<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows.map(r=>r.replace('<a:tr>', '<a:tr h="240000">')).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
function manyStages(count = 12) {
  const d = data(); d.targetStartDate = '2026-01-01'; d.targetEndDate = '2027-03-31';
  d.stages = Array.from({ length: count }, (_, i) => ({ ...d.stages[0], stage: `검증단계-${i+1}`,
    startDate: `2026-${String(i%12+1).padStart(2,'0')}-10`, endDate: `2026-${String(i%12+1).padStart(2,'0')}-11` }));
  return d;
}
test('all stages and extra expert fields remain on one plan slide without reducing original fonts', async () => {
  const c = sandbox(), d = manyStages();
  for (let i=0;i<7;i++) { const name=`전문가${i}`; d.portalOrder.push({name, group:'전문가',expertSubGroup:'핵심기술'}); d.personFieldMap[name]=`분야-${i+1}`; }
  const b64 = await template(sizedTable([row(['단계감리팀','[단계1]','']), row(['','[단계2]','']), row(['핵심기술','[분야1]',''])], [800000,1600000,6400000],500000,2900000)
    + sizedTable([row(['추진일정','2026년','년']), row(['','[n]월','[n+1]월']), row(['[대상사업]','',''])], [2400000,3200000,3200000],500000,1700000));
  const r = await c.ProposalTemplate.build(menu('SCHEDULE_PLAN', b64), { _raw: d });
  assert.equal(r.slideCount, 1); assert.equal((await c.ProposalTemplate.slidePaths(r.zip)).length,1);
  const doc = c.ProposalTemplate.parse(await r.zip.file('ppt/slides/slide1.xml').async('string')), txt=c.ProposalTemplate.text(doc);
  for(const s of d.stages) assert(txt.includes(s.stage));
  for(let i=1;i<=7;i++) assert(txt.includes(`분야-${i}`));
  assert(!/\[단계|\[분야|\[n/.test(txt));
  const tables=c.ProposalTemplate.nodes(doc,'tbl'), stageRows=c.ProposalTemplate.nodes(tables[0],'tr');
  assert.equal(stageRows.length,19);
  assert(stageRows.reduce((s,r)=>s+Number(r.getAttribute('h')),0)>720000);
  for (const run of c.ProposalTemplate.nodes(tables[0], 'r').filter(r=>c.ProposalTemplate.text(r).trim())) {
    assert.equal(c.ProposalTemplate.nodes(run,'rPr')[0].getAttribute('sz'),'1200');
  }
  assert.equal(c.ProposalTemplate.nodes(tables[1],'gridCol').length,16);
  const shapes=c.ProposalTemplate.nodes(doc,'cNvPr',P).map(n=>n.getAttribute('id'));
  assert.equal(new Set(shapes).size,shapes.length);
  assert(txt.includes('2027년'));
});
test('detail duplicates complete merged blocks for regular, multiple resident and acceptance stages in one slide', async () => {
  const c=sandbox(), d=manyStages(8);
  d.stages.push(...['상주감리-A','상시감리-B','검수지원-A','검수지원-B'].map(stage=>({...d.stages[0],stage})));
  const first=row(['[단계1]','감리시행','현장감리','[단계1시작일] ~ [단계1종료일]','(0)일 / (0)MD']).replace('<a:tc>','<a:tc rowSpan="2">');
  const sub=row(['','소계','','','(0)일 / (0)MD']).replace('<a:tc>','<a:tc vMerge="1">');
  const b64=await template(sizedTable([row(['단계','활동','절차','일정','MD']),first,sub,row(['상주감리','감리시행','상주감리','[단계5시작일]','(0)일 / (0)MD']),row(['검수지원','감리시행','검수지원','종료','(0)일 / (0)MD']),row(['단계 감리팀 투입 공수 합계','','','','총 0MD'])],[800000,800000,1500000,1500000,1400000]));
  const r=await c.ProposalTemplate.build(menu('DETAIL_SCHEDULE',b64),{_raw:d});
  const doc=c.ProposalTemplate.parse(await r.zip.file('ppt/slides/slide1.xml').async('string')), txt=c.ProposalTemplate.text(doc);
  assert.equal(r.slideCount,1);assert.equal((await c.ProposalTemplate.slidePaths(r.zip)).length,1);
  for(const s of d.stages) assert(txt.includes(s.stage));
  assert(txt.includes('총 120MD'));
  assert(!txt.includes('[단계'));
  const rows=c.ProposalTemplate.nodes(doc,'tr');assert.equal(rows.length,22);
  assert(rows.reduce((s,r)=>s+Number(r.getAttribute('h')),0)>1440000);
  for (const run of c.ProposalTemplate.nodes(doc, 'r').filter(r=>c.ProposalTemplate.text(r).trim())) {
    assert.equal(c.ProposalTemplate.nodes(run,'rPr')[0].getAttribute('sz'),'1200');
  }
  const cells=c.ProposalTemplate.nodes(doc,'tc');
  assert.equal(cells.filter(c=>c.getAttribute('rowSpan')==='2').length,8);
  assert.equal(cells.filter(c=>c.getAttribute('vMerge')==='1').length,8);
});
test('title/client-only procedure templates never inherit unrelated MD or personnel warnings', async () => {
  const c=sandbox(), d=data();d.proposedMD=999;d.stages[0].감리원.people[0].pre=-1;d.portalOrder=[];
  const b64=await template(shape(para('[제','목] [주관','기관]')));
  for(const code of ['AUDIT_PROCEDURE','ACTION_CONFIRM_PROCEDURE']) {
    const r=await c.ProposalTemplate.build(menu(code,b64),{_raw:d});
    assert.equal(r.warnings.length,0);
    assert(docText(c,await r.zip.file('ppt/slides/slide1.xml').async('string')).includes('A&B <기관>'));
  }
});
test('MD warnings remain on templates actually using MD data', async () => {
  const c=sandbox(),d=data();d.proposedMD=999;
  const b64=await template(table([row(['[단계1]','감리시행','현장감리','[단계1시작일]','(0)일 / (0)MD'])]));
  const r=await c.ProposalTemplate.build(menu('DETAIL_SCHEDULE',b64),{_raw:d});
  assert(r.warnings.some(w=>w.includes('사업 제안공수')));
});
test('missing client remains unresolved independently of unrelated MD mismatch', async () => {
  const c=sandbox(),d=data();d.proposedMD=999;d.clientOrg='';
  const r=await c.ProposalTemplate.build(menu('AUDIT_PROCEDURE',await template(shape(para('[제목] [주관기관]')))),{_raw:d});
  assert(r.warnings.some(w=>w.includes('[주관기관]')));
  assert(!r.warnings.some(w=>w.includes('공수')));
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
test('five-person 1:5:1 / 0:5:1 example produces 1/1, 5/25, 1/5 and 7/31', async () => {
  const c=sandbox(),d=data();
  d.portalOrder=Array.from({length:5},(_,i)=>({name:`인력${i}`,group:'감리원팀'}));
  d.stages[0].감리원.people=d.portalOrder.map((p,i)=>({name:p.name,pre:i===0?1:0,audit:5,post:1}));
  const metrics=c.ProposalTemplate.activityTotals(c.ProposalTemplate.context(d).stages[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(metrics)),{pre:{days:1,md:1},audit:{days:5,md:25},post:{days:1,md:5},total:{days:7,md:31}});
  const b64=await template(table([
    row(['[단계1]','예비조사','예비조사','[단계1시작일-7]','(0)일 / (0)MD']),
    row(['','감리시행','현장감리','[단계1시작일]','(0)일 / (0)MD']),
    row(['','사후관리','시정조치 결과 확인','요청 후','(0)일 / (0)MD']),
    row(['','소계','','','(0)일 / (0)MD']),
  ]));
  const r=await c.ProposalTemplate.build(menu('DETAIL_SCHEDULE',b64),{_raw:d});
  const txt=docText(c,await r.zip.file('ppt/slides/slide1.xml').async('string'));
  for(const value of ['(1)일 / (1)MD','(5)일 / (25)MD','(1)일 / (5)MD','(7)일 / (31)MD'])assert(txt.includes(value));
  assert(!r.warnings.some(w=>w.includes('역산')));
});
test('parallel activity days use longest assignment, with zeros and invalid values handled', () => {
  const c=sandbox(),d=data();
  d.stages[0].감리원.people=[{name:'가',pre:0,audit:5,post:1},{name:'나',pre:0,audit:3,post:2}];
  let out=c.ProposalTemplate.activityTotals(c.ProposalTemplate.context(d).stages[0]);
  assert.equal(out.pre.days,0);assert.equal(out.audit.days,5);assert.equal(out.post.days,2);
  assert.equal(out.total.days,7);assert.equal(out.total.md,11);
  d.stages[0].감리원.people[1].pre=null;
  out=c.ProposalTemplate.activityTotals(c.ProposalTemplate.context(d).stages[0]);
  assert.equal(out.pre.days,null);assert.equal(out.total.days,null);
});
test('month-precision target periods stay month-precision instead of unresolved placeholders', async () => {
  const c=sandbox(),d=data();d.targetStartDate='2026.09';d.targetEndDate='2026.12';
  const r=await c.ProposalTemplate.build(menu('DETAIL_SCHEDULE',await template(shape(para('[대상사업시작일] ~ [대상사업종료일]')))),{_raw:d});
  const txt=docText(c,await r.zip.file('ppt/slides/slide1.xml').async('string'));
  assert.equal(txt,'2026.09 ~ 2026.12');assert(!r.warnings.some(w=>w.includes('미치환')));
  assert.equal(c.ProposalTemplate.fmtPeriod('2026.13'),'');
});
async function actionFixture() {
  const body=Array.from({length:15},(_,i)=>row([i===0?'수행인력':'',`[그룹${i+1}]`,`[세부${i+1}]`,`[이름${i+1}]`,`[이름${i+1}]`,`[이름${i+1}]`,i===0?'원본 수행 방안':'']));
  return template(sizedTable([row(['감리 단계','','','[단계1]','[단계2]','[단계3]','수행 방안']),...body,
    row(['투입 공수','','','[단계1MD] MD','[단계2MD] MD','[단계3MD] MD','']),
    row(['주요 활동','','','고정 활동','','',''])], [800000,500000,900000,700000,700000,700000,1000000]));
}
test('action confirmation sums only positive post assignments per stage without inheriting whole-project MD mismatch', async () => {
  const c = sandbox(), T = c.ProposalTemplate, d = data(); d.proposedMD = 999;
  d.stages = ['설계', '구현', '종료'].map((stage, i) => ({ ...d.stages[0], stage,
    감리원: { people: [
      { name: '가', pre: 2, audit: 10, post: i === 1 ? 0 : 4 },
      { name: '나', pre: 3, audit: 20, post: i === 1 ? 4 : 0 },
    ] }, 전문가: { people: [{ name: '전문참여자', pre: 1, audit: 5, post: '2' }] },
  }));
  d.portalOrder.push({ name: '전문참여자', group: '전문가' });
  d.personGradeMap.전문참여자 = { group: '전문가' }; d.personFieldMap.전문참여자 = '보안';
  d.stages.push({ ...d.stages[0], stage: '조치확인없음', 감리원: { people: [{ name: '가', pre: 1, audit: 99, post: 0 }] }, 전문가: { people: [] } });
  assert(T.context(d).warnings.some(w => w.includes('사업 제안공수')));
  const r = await T.build(menu('ACTION_CONFIRM_STAFF', await actionFixture()), { _raw: d });
  const doc = T.parse(await r.zip.file('ppt/slides/slide1.xml').async('string'));
  const rows = T.nodes(doc, 'tr'), values = row => Array.from(T.nodes(row, 'tc').slice(3, 6).map(T.text));
  assert.deepEqual(values(rows[1]), ['가', '', '가']);
  assert.deepEqual(values(rows[2]), ['', '나', '']);
  assert.deepEqual(values(rows[3]), ['전문참여자', '전문참여자', '전문참여자']);
  assert.deepEqual(values(rows.find(row => T.text(row).startsWith('투입 공수'))), ['6 MD', '6 MD', '6 MD']);
  assert(!T.text(doc).includes('조치확인없음'));
  assert(!r.warnings.some(w => w.includes('사업 제안공수')));
  assert(r.warnings.some(w => w.includes('수행방안·횟수')));
});
test('action confirmation still reports invalid assignments, unlinked participants and unresolved tokens', async () => {
  const c = sandbox(), T = c.ProposalTemplate, d = data(); d.proposedMD = 999;
  d.stages[0].감리원.people[1].post = -1;
  d.portalOrder = [];
  const z = await JSZip.loadAsync(await actionFixture(), { base64: true });
  const path = 'ppt/slides/slide1.xml';
  z.file(path, (await z.file(path).async('string')).replace('</p:spTree>', shape(para('[미지원토큰]')) + '</p:spTree>'));
  const r = await T.build(menu('ACTION_CONFIRM_STAFF', await z.generateAsync({ type: 'base64' })), { _raw: d });
  assert(!r.warnings.some(w => w.includes('사업 제안공수')));
  assert(r.warnings.some(w => w.includes('누락·음수·비숫자')));
  assert(r.warnings.some(w => w.includes('제안 인력 목록')));
  assert(r.warnings.some(w => w.includes('미치환') && w.includes('[미지원토큰]')));
});
test('action method cell preserves rich paragraphs and cell styling while resizing its merge', async () => {
  const c = sandbox(), T = c.ProposalTemplate, d = data();
  d.stages.push({ ...d.stages[0], stage: '종료', 감리원: { people: [{ name: '나', pre: 0, audit: 5, post: 2 }] } });
  const z = await JSZip.loadAsync(await actionFixture(), { base64: true });
  const doc = T.parse(await z.file('ppt/slides/slide1.xml').async('string'));
  const rows = T.nodes(doc, 'tr'), source = T.nodes(rows[1], 'tc')[6];
  const rich = T.parse(`<a:tc xmlns:a="${A}" rowSpan="17"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr marL="162000" indent="-95250"><a:lnSpc><a:spcPts val="1500"/></a:lnSpc><a:spcBef><a:spcPts val="200"/></a:spcBef><a:buChar char="•"/></a:pPr><a:r><a:rPr sz="1200"/><a:t>단계 감리와 </a:t></a:r><a:r><a:rPr sz="1200" b="1"><a:solidFill><a:srgbClr val="1655A2"/></a:solidFill></a:rPr><a:t>동일한 인력</a:t></a:r><a:br/><a:r><a:rPr sz="1200" b="1"/><a:t>구성</a:t></a:r></a:p><a:p><a:endParaRPr sz="1200"/></a:p><a:p><a:pPr marL="162000" indent="-95250"><a:buChar char="•"/></a:pPr><a:r><a:rPr sz="1200"><a:solidFill><a:srgbClr val="1655A2"/></a:solidFill></a:rPr><a:t>1차 시정조치 미흡시 2차 시정조치 수행</a:t></a:r></a:p></a:txBody><a:tcPr marL="36000" marR="90000" marT="36000" marB="36000" anchor="ctr"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:tcPr></a:tc>`).documentElement;
  source.parentNode.replaceChild(doc.importNode(rich, true), source);
  z.file('ppt/slides/slide1.xml', new XMLSerializer().serializeToString(doc));
  const result = await T.build(menu('ACTION_CONFIRM_STAFF', await z.generateAsync({ type: 'base64' })), { _raw: d });
  const out = T.parse(await result.zip.file('ppt/slides/slide1.xml').async('string'));
  const matches = T.nodes(out, 'tc').filter(c => T.text(c).includes('단계 감리와'));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].getAttribute('rowSpan'), '4'); // two people plus two footer rows
  const serialize = el => new XMLSerializer().serializeToString(el);
  for (const tag of ['txBody', 'tcPr']) assert.equal(serialize(T.nodes(matches[0], tag)[0]), serialize(T.nodes(rich, tag)[0]));
  assert.equal(T.nodes(out, 'br').length, 1);
  const cols = T.nodes(out, 'gridCol');
  assert(Number(cols.at(-1).getAttribute('w')) >= 1000000);
  assert.equal(result.slideCount, 1);
});
test('action left columns follow field hierarchy and preserve sorted name-to-stage mapping', async () => {
  const c = sandbox(), T = c.ProposalTemplate, d = data();
  const people = [
    ['보안담당', '시스템 구조 및 보안'], ['응용둘', '분야2'], ['관리담당', '사업관리/품질보증'],
    ['DB담당', '데이터베이스'], ['응용하나', '분야1'],
  ];
  d.portalOrder = people.map(([name]) => ({ name, group: '감리원팀' }));
  d.personGradeMap = {}; d.personFieldMap = Object.fromEntries(people);
  d.stages = ['설계', '종료', '검수지원'].map((stage, i) => ({ stage,
    감리원: { people: people.map(([name], j) => ({ name, pre: 0, audit: 5, post: i === 2 ? 0 : j % 2 === i ? 1 : 0 })) },
  }));
  const result = await T.build(menu('ACTION_CONFIRM_STAFF', await actionFixture()), { _raw: d });
  const out = T.parse(await result.zip.file('ppt/slides/slide1.xml').async('string'));
  const rows = T.nodes(out, 'tr'), cells = r => T.nodes(r, 'tc');
  assert.equal(rows.length, 8);
  assert.equal(T.text(cells(rows[1])[1]), '사업관리/품질보증');
  assert.equal(T.text(cells(rows[2])[1]), '응용시스템');
  assert.equal(cells(rows[2])[1].getAttribute('rowSpan'), '2');
  assert.equal(cells(rows[3])[1].getAttribute('vMerge'), '1');
  assert.equal(T.text(cells(rows[2])[2]), '분야2');
  assert.equal(T.text(cells(rows[3])[2]), '분야1');
  for (const [i, label] of [[1, '사업관리/품질보증'], [4, '데이터베이스'], [5, '시스템 구조 및 보안']]) {
    assert.equal(T.text(cells(rows[i])[1]), label);
    assert.equal(cells(rows[i])[1].getAttribute('gridSpan'), '2');
    assert.equal(cells(rows[i])[2].getAttribute('hMerge'), '1');
  }
  for (const [i, name, stageCol] of [[1, '관리담당', 3], [2, '응용둘', 4], [3, '응용하나', 3], [4, 'DB담당', 4], [5, '보안담당', 3]]) {
    assert.equal(T.text(cells(rows[i])[stageCol]), name);
    assert.equal(T.text(cells(rows[i])[stageCol === 3 ? 4 : 3]), '');
  }
  assert.equal(T.text(cells(rows[6])[3]), '3 MD'); assert.equal(T.text(cells(rows[6])[4]), '2 MD');
  assert(!T.text(out).includes('감리원팀')); assert(!T.text(out).includes('검수지원'));
  assert.equal(result.slideCount, 1);
});
test('action table grows to four positive-post columns and eighteen people without shrinking', async () => {
  const c=sandbox(),d=data();d.portalOrder=Array.from({length:18},(_,i)=>({name:`가${i}`,group:'감리원팀'}));
  const make=(stage,positive)=>({...d.stages[0],stage,감리원:{people:d.portalOrder.map(p=>({name:p.name,pre:0,audit:5,post:positive?1:0}))}});
  d.stages=[make('설계A',true),make('설계B',true),make('종료A',true),make('종료B',true),make('검수지원',false)];
  const r=await c.ProposalTemplate.build(menu('ACTION_CONFIRM_STAFF',await actionFixture()),{_raw:d});
  const doc=c.ProposalTemplate.parse(await r.zip.file('ppt/slides/slide1.xml').async('string')),T=c.ProposalTemplate;
  const rows=T.nodes(doc,'tr');assert.equal(rows.length,21);
  assert.equal(T.nodes(doc,'gridCol').length,8);assert(rows.every(r=>T.nodes(r,'tc').length===8));
  assert.equal(T.text(rows[0]),'감리 단계설계A설계B종료A종료B수행 방안');
  assert(!T.text(doc).includes('검수지원'));
  for(const p of d.portalOrder)assert(T.text(doc).includes(p.name));
  assert.equal(T.nodes(rows[19],'tc').slice(3,7).map(T.text).join('|'),'18 MD|18 MD|18 MD|18 MD');
  for(const run of T.nodes(doc,'r').filter(r=>T.text(r).trim())) assert.equal(T.nodes(run,'rPr')[0].getAttribute('sz'),'1200');
  assert.equal(r.slideCount,1);
});
test('action table with zero positive-post stages shows no-target state, not phantom columns', async () => {
  const c=sandbox(),d=data();d.stages[0].감리원.people.forEach(p=>p.post=0);
  const r=await c.ProposalTemplate.build(menu('ACTION_CONFIRM_STAFF',await actionFixture()),{_raw:d});
  const doc=c.ProposalTemplate.parse(await r.zip.file('ppt/slides/slide1.xml').async('string'));
  assert.equal(c.ProposalTemplate.nodes(doc,'gridCol').length,4);
  assert.match(c.ProposalTemplate.text(doc),/조치확인 공수가 있는 단계 없음/);
  assert(!/\[단계|\[이름|\[그룹/.test(c.ProposalTemplate.text(doc)));
});
const detailSource = readFileSync(new URL('../public/static/proposal-detail.js', import.meta.url), 'utf8');
const historySource = detailSource.slice(detailSource.indexOf('async function buildHistoryPptx('), detailSource.indexOf('// ── 사진장표 PPT (템플릿 기반)'));
async function historyFixture(perPage) {
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="8" name="우측 예시 그림"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="imageRef"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="10010694" y="200000"/><a:ext cx="600000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const body = shape(para('[제목]')) + Array.from({ length: perPage }, (_, i) => shape(para(`[P${i + 1}_이름]`, `[P${i + 1}_분야]`))).join('')
    + picture + shape(`<a:p><a:r><a:rPr><a:hlinkClick r:id="externalLink"/></a:rPr><a:t>작업 예시</a:t></a:r></a:p>`);
  const zip = await JSZip.loadAsync(await template(body), { base64: true });
  const rels = `<Relationships xmlns="${R}">
    <Relationship Target="../slideLayouts/slideLayout1.xml" Id="rId1" Type="${OR}/slideLayout"/>
    <Relationship Type="${OR}/image" Target="../media/reference.png" Id="imageRef"/>
    <Relationship TargetMode="External" Target="https://example.test/reference?a=1&amp;b=2" Type="${OR}/hyperlink" Id="externalLink"/>
  </Relationships>`;
  zip.file('ppt/slides/_rels/slide1.xml.rels', rels);
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree/></p:cSld></p:sldLayout>`);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  zip.file('ppt/media/reference.png', image);
  zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  // An unused source slide must not leave stale presentation relationships after cloning.
  zip.file('ppt/slides/slide9.xml', slide(shape(para('unused source slide'))));
  zip.file('ppt/slides/_rels/slide9.xml.rels', rels);
  zip.file('ppt/_rels/presentation.xml.rels', (await zip.file('ppt/_rels/presentation.xml.rels').async('string')).replace('</Relationships>', `<Relationship Target="slides/slide9.xml" Type="${OR}/slide" Id="rId9"/></Relationships>`));
  return { zip, rels, image, picture };
}
for (const [groupFilter, perPage] of [['AUDITOR', 2], ['EXPERT', 4]]) {
  test(`${groupFilter} history preserves original pictures and links on every cloned and merged slide`, async () => {
    const fixture = await historyFixture(perPage);
    const people = Array.from({ length: perPage * 2 + 1 }, (_, i) => ({ name: `인력${i}`, field: `분야${i}`, isAudit: groupFilter === 'AUDITOR' }));
    const c = sandbox({ Uint8Array, parsedData: { personnelIdMap: {} }, computeAssignRows: () => people,
      fetch: () => { throw new Error('No network expected'); } });
    vm.runInContext(historySource, c);
    const result = await c.buildHistoryPptx({ returnZip: true, groupFilter, perPage, menuTitle: '실적 시험', templateB64: await fixture.zip.generateAsync({ type: 'base64' }) });
    const paths = await c.ProposalTemplate.slidePaths(result.zip); assert.equal(paths.length, 3);
    for (let i = 0; i < paths.length; i++) {
      const xml = await result.zip.file(paths[i]).async('string');
      const relsPath = paths[i].replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
      assert.equal(await result.zip.file(relsPath).async('string'), fixture.rels);
      assert(xml.includes(fixture.picture)); assert(xml.includes('r:id="externalLink"'));
      assert(xml.includes(people[i * perPage].name.split('').join(' ')));
      assert(!/\[P\d+_/.test(xml)); assert(xml.includes('실적 시험'));
    }
    assert.deepEqual(await result.zip.file('ppt/media/reference.png').async('nodebuffer'), fixture.image);
    assert(!result.zip.file('ppt/slides/slide9.xml'));
    const presRels = c.ProposalTemplate.parse(await result.zip.file('ppt/_rels/presentation.xml.rels').async('string'));
    const relationships = c.ProposalTemplate.nodes(presRels, 'Relationship', R);
    assert.equal(relationships.length, 3); assert.equal(new Set(relationships.map(r => r.getAttribute('Id'))).size, 3);
    for (const rel of relationships) assert(result.zip.file('ppt/' + rel.getAttribute('Target')));
    const base = await JSZip.loadAsync(await template(shape(para('앞 장표'))), { base64: true });
    const merged = await c.mergePresentationZips([{ zip: base }, { zip: result.zip, mergeStrategy: 'FOREIGN_TEMPLATE' }]);
    const mergedPaths = await c.ProposalTemplate.slidePaths(merged); assert.equal(mergedPaths.length, 4);
    for (const path of mergedPaths.slice(1)) {
      const doc = c.ProposalTemplate.parse(await merged.file(path.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels').async('string'));
      const rels = c.ProposalTemplate.nodes(doc, 'Relationship', R);
      const imageRel = rels.find(r => r.getAttribute('Id') === 'imageRef'); assert(imageRel);
      const imagePath = new URL(imageRel.getAttribute('Target'), 'https://ppt.test/' + path).pathname.slice(1);
      assert.deepEqual(await merged.file(imagePath).async('nodebuffer'), fixture.image);
      const link = rels.find(r => r.getAttribute('Id') === 'externalLink'); assert(link);
      assert.equal(link.getAttribute('TargetMode'), 'External');
      assert.equal(link.getAttribute('Target'), 'https://example.test/reference?a=1&b=2');
      assert.match(await merged.file(path).async('string'), /r:embed="imageRef"/);
    }
  });
}
test('history rejects missing source relationships instead of inventing a layout', async () => {
  const { zip } = await historyFixture(2); zip.remove('ppt/slides/_rels/slide1.xml.rels');
  const c = sandbox({ Uint8Array, parsedData: {}, computeAssignRows: () => [{ name: '가', isAudit: true }] });
  vm.runInContext(historySource, c);
  await assert.rejects(c.buildHistoryPptx({ returnZip: true, templateB64: await zip.generateAsync({ type: 'base64' }) }), /슬라이드 연결 정보/);
});

const photoSource = detailSource.slice(detailSource.indexOf('const PHOTO_LAYOUT_META ='), detailSource.indexOf('// ── downloadPhotoAssignPptx'));
const photoMarker = label => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), Buffer.from(label)]);
const photoPicture = (id, x, y, rid) => `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="picture-${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="400000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
async function photoFixture(size) {
  const columns = size < 6 ? [600000, 5400000] : [600000, 3450000, 6300000];
  const rows = size === 2 ? [1500000] : size === 9 ? [1500000, 3300000, 5000000] : [1500000, 4000000];
  let body = '', slot = 0;
  for (const y of rows) for (const x of columns) {
    slot++;
    body += photoPicture(100 + slot, x + 100000, y + 50000, 'rId2');
    body += `<p:sp><p:nvSpPr><p:cNvPr id="${200 + slot}" name="name-${slot}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x + 650000}" y="${y}"/><a:ext cx="1600000" cy="240000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${para('[이름]')}</p:txBody></p:sp>`;
  }
  // Shared rId2 outside the slide must remain the original placeholder.
  // rId3/rId4 deliberately overlap renumbered IDs to catch a second remap pass.
  body += photoPicture(900, 11000000, 1800000, 'rId2') + photoPicture(901, 11000000, 2500000, 'rId3') + photoPicture(902, 1000000, 7600000, 'rId4');
  const zip = await JSZip.loadAsync(await template(body), { base64: true });
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="${OR}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${OR}/image" Target="../media/image1.png"/><Relationship Id="rId3" Type="${OR}/image" Target="../media/image2.png"/><Relationship Id="rId4" Type="${OR}/image" Target="../media/image3.png"/></Relationships>`);
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${P}"><p:cSld><p:spTree/></p:cSld></p:sldLayout>`);
  for (let i = 1; i <= 3; i++) zip.file(`ppt/media/image${i}.png`, photoMarker(`original-${size}-${i}`));
  zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  return zip;
}
const photoTemplates = async () => Object.fromEntries(await Promise.all([2, 4, 6, 9].map(async size => [size, await photoFixture(size)])));
function photoContext() {
  const c = sandbox({ Uint8Array, ArrayBuffer, console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(photoSource, c); return c;
}
async function photoBytes(c, zip, path, pictureId) {
  const T = c.ProposalTemplate, doc = T.parse(await zip.file(path).async('string'));
  const pic = T.nodes(doc, 'pic', P).find(p => T.nodes(p, 'cNvPr', P)[0]?.getAttribute('id') === String(pictureId));
  if (!pic) return null;
  const rid = T.nodes(pic, 'blip')[0].getAttributeNS(OR, 'embed');
  const rels = T.parse(await zip.file(path.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels').async('string'));
  const rel = T.nodes(rels, 'Relationship', R).find(r => r.getAttribute('Id') === rid);
  assert(rel, `missing relationship for picture ${pictureId}: ${rid}`);
  const target = new URL(rel.getAttribute('Target'), 'https://ppt.test/' + path).pathname.slice(1);
  assert(zip.file(target), `missing image ${target}`);
  return zip.file(target).async('nodebuffer');
}
for (const size of [2, 4, 6, 9]) {
  test(`${size}-person photos keep slot identity, placeholders and off-slide pictures before/after merge`, async () => {
    const c = photoContext(), T = c.ProposalTemplate;
    const pages = ['full', 'partial', 'missing'].map((kind, pageIndex) => {
      const count = kind === 'partial' ? size - 1 : size;
      return { sheetSize: size, slotPeople: Object.fromEntries(Array.from({ length: count }, (_, i) => [i + 1, {
        name: kind === 'missing' && i === 1 ? 'TBD1' : `시험${pageIndex}_${i + 1}`, field: '검증', profile: {},
        ...(kind === 'missing' && i < 2 ? {} : { photoArrayBuffer: new Uint8Array(photoMarker(`${size}-${pageIndex}-${i + 1}`)) }),
      }])) };
    });
    const zip = await c.buildPhotoPptxFromTemplate(pages, await photoTemplates());
    const check = async (zip, paths) => {
      assert.equal(paths.length, 3);
      for (let i = 0; i < paths.length; i++) {
        const doc = T.parse(await zip.file(paths[i]).async('string'));
        for (let slot = 1; slot <= size; slot++) {
          const person = pages[i].slotPeople[slot];
          const actual = await photoBytes(c, zip, paths[i], 100 + slot);
          const name = T.nodes(doc, 'sp', P).find(s => T.nodes(s, 'cNvPr', P)[0]?.getAttribute('id') === String(200 + slot));
          if (!person) { assert.equal(actual, null); assert.equal(name, undefined); continue; }
          assert.deepEqual(actual, person.photoArrayBuffer ? Buffer.from(person.photoArrayBuffer) : photoMarker('original-2-1'));
          assert.equal(T.text(name), person.name);
        }
        for (const [id, media] of [[900, 1], [901, 2], [902, 3]]) assert.deepEqual(await photoBytes(c, zip, paths[i], id), photoMarker(`original-${size}-${media}`));
      }
    };
    await check(zip, await T.slidePaths(zip));
    const base = await JSZip.loadAsync(await template(shape(para('앞 장표'))), { base64: true });
    const merged = await c.mergePresentationZips([{ zip: base }, { zip, mergeStrategy: 'FOREIGN_TEMPLATE' }]);
    await check(merged, (await T.slidePaths(merged)).slice(1));
  });
  test(`${size}-person photo selection never falls back to loose pictures when a portrait is missing or ambiguous`, async () => {
    for (const mode of ['reordered', 'missing', 'ambiguous']) {
      const c = photoContext(), T = c.ProposalTemplate, templates = await photoTemplates();
      const doc = T.parse(await templates[size].file('ppt/slides/slide1.xml').async('string'));
      const pics = T.nodes(doc, 'pic', P), get = id => pics.find(p => T.nodes(p, 'cNvPr', P)[0].getAttribute('id') === String(id));
      const first = get(101), tree = first.parentNode;
      if (mode === 'reordered') for (const id of [900, 901, 902]) tree.insertBefore(get(id), tree.firstChild);
      if (mode === 'missing') tree.removeChild(first);
      if (mode === 'ambiguous') { const duplicate = first.cloneNode(true); T.nodes(duplicate, 'cNvPr', P)[0].setAttribute('id', '999'); tree.appendChild(duplicate); }
      templates[size].file('ppt/slides/slide1.xml', new XMLSerializer().serializeToString(doc));
      const people = Object.fromEntries(Array.from({ length: size }, (_, i) => [i + 1, { name: `시험${i}`, profile: {}, photoArrayBuffer: new Uint8Array(photoMarker(`person-${i}`)) }]));
      const zip = await c.buildPhotoPptxFromTemplate([{ sheetSize: size, slotPeople: people }], templates);
      const path = (await T.slidePaths(zip))[0];
      if (mode === 'reordered') assert.deepEqual(await photoBytes(c, zip, path, 101), photoMarker('person-0'));
      if (mode === 'missing') assert.equal(await photoBytes(c, zip, path, 101), null);
      if (mode === 'ambiguous') for (const id of [101, 999]) assert.deepEqual(await photoBytes(c, zip, path, id), photoMarker(`original-${size}-1`));
      for (let s = 2; s <= size; s++) assert.deepEqual(await photoBytes(c, zip, path, 100 + s), photoMarker(`person-${s - 1}`));
      for (const [id, media] of [[900, 1], [901, 2], [902, 3]]) assert.deepEqual(await photoBytes(c, zip, path, id), photoMarker(`original-${size}-${media}`));
    }
  });
}

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
test('report locations follow registry ancestors, preserve numbers and remove duplicate title prefixes', () => {
  const c = sandbox();
  const section = { id: 10, menu_number: '마', menu_name: '마. 감리 품질 및 지원' };
  const subsection = { id: 11, parent_id: 10, menu_number: '3', menu_name: '지원' };
  const leaf = { id: 12, parent_id: 11, menu_number: '3.5', menu_name: '3.5 안전 및 보건 관리', menu_code: 'SAFETY_HEALTH' };
  const result = c.proposalReportLocation(leaf, [section, subsection, leaf]);
  assert.equal(result.number, '마.3.5'); assert.equal(result.name, '안전 및 보건 관리');
  assert.equal(result.sectionName, '감리 품질 및 지원'); assert.equal(result.sectionKey, 'menu:10');
  assert.equal(c.proposalReportLocation({ ...leaf, menu_number: '마.3.5', menu_name: '마.3.5 안전' }, [section, subsection]).number, '마.3.5');
  assert.equal(c.proposalReportLocation({ menu_number: '라.3.7', menu_name: '투입 비율' }).sectionNumber, '라');
  const orphan = c.proposalReportLocation({ id: 99, parent_id: 999, menu_name: '미분류' }, [section]);
  assert.equal(orphan.sectionKey, 'ungrouped'); assert.equal(orphan.number, '');
  const viaTree = { ...leaf, parent_id: null };
  assert.equal(c.proposalReportLocation(viaTree, [{ ...section, children: [viaTree] }, viaTree]).number, '마.3.5');
  assert.doesNotThrow(() => c.proposalReportLocation(leaf, [leaf, { ...subsection, parent_id: 12 }]));
});
function reportDOM() {
  const document = new DOMParser().parseFromString('<html><body><section id="proposal-generation-report"/></body></html>', 'text/html');
  const root = document.getElementById('proposal-generation-report');
  root.replaceChildren = () => { while (root.firstChild) root.removeChild(root.firstChild); };
  root.querySelectorAll = () => Array.from(root.getElementsByTagName('details')).filter(n => n.hasAttribute('data-section-key'));
  return { document, root, html: () => parseHtml(new XMLSerializer().serializeToString(root)) };
}
test('report displays chapter groups, full numbering, state badges, slide counts and separate safe warning lines', () => {
  const dom = reportDOM(), c = sandbox({ document: dom.document });
  const report = { status: '부분 생성', total: 4, warnings: ['공통 안내'], entries: ['다', '라', '마', '바'].map((sectionNumber, i) => ({
    id: i, sectionKey: sectionNumber, sectionNumber, sectionName: '목차' + i, number: sectionNumber + '.3.1', name: '검증 항목',
    status: ['생성됨', '검토 필요', '생성 실패', '생성 중'][i], slides: i === 0 ? 2 : i === 1 ? 1 : 0,
    warnings: i === 1 ? ['누락 토큰: [이름1], [이름2]', '<img src=x onerror=alert(1)>', '누락 토큰: [이름1], [이름2]'] : [],
  })) };
  c.renderProposalReport(report);
  const html = dom.html();
  assert.equal(dom.root.hidden, false);
  assert.deepEqual(html.querySelectorAll('.proposal-report-section-title').map(n => n.text), ['다. 목차0', '라. 목차1', '마. 목차2', '바. 목차3']);
  assert.deepEqual(html.querySelectorAll('.proposal-report-number').map(n => n.text), ['다.3.1', '라.3.1', '마.3.1', '바.3.1']);
  assert(html.querySelector('.proposal-report-progress').text.includes('3 / 4개 목차 처리 · 3장 생성'));
  assert.equal(html.querySelectorAll('.proposal-report-stats li').length, 4);
  assert.equal(html.querySelectorAll('.proposal-report-entry-review .proposal-report-warnings li').length, 2);
  assert.equal(html.querySelector('img'), null); assert(html.text.includes('<img src=x onerror=alert(1)>'));
  const sections = dom.root.querySelectorAll(); sections[1].open = false;
  report.entries[3].status = '생성됨'; c.renderProposalReport(report);
  assert.equal(dom.root.querySelectorAll()[1].open, false);
  c.renderProposalReport({ ...report }); assert.equal(dom.root.querySelectorAll()[1].open, true);
});
test('report handles standalone/common errors and missing numbering without fabricating chapter labels', () => {
  const dom = reportDOM(), c = sandbox({ document: dom.document });
  c.renderProposalReport({ status: '생성 실패', entries: [], warnings: ['메뉴 조회 실패'] });
  assert.equal(dom.html().querySelectorAll('.proposal-report-section').length, 0);
  assert(dom.html().querySelector('.proposal-report-notes').text.includes('메뉴 조회 실패'));
  c.renderProposalReport({ status: '검토 필요', entries: [{ name: '항목', status: '생성됨', slides: 1 }] });
  assert.equal(dom.html().querySelector('.proposal-report-section-title').text, '기타 목차');
  assert.equal(dom.html().querySelector('.proposal-report-number').text, '번호 미등록');
});
test('composer report retains chapter metadata for success/failure and selected menu generation', async () => {
  const b64 = await template(shape(para('[제목]')));
  const good = { ...menu('QA_SYSTEM', b64), id: 21, parent_id: 20, menu_number: '1.1', sort_order: 1 };
  const bad = { ...menu('ORGANIZATION'), id: 11, parent_id: 10, menu_number: '2.1', sort_order: 2 };
  const tree = [{ id: 10, menu_number: '라', menu_name: '감리 수행 인력', children: [bad] },
    { id: 20, menu_number: '마', menu_name: '품질 및 지원', children: [good] }];
  const c = sandbox({ fetch: async url => ({ ok: true, json: async () => url.includes('master-templates') ? { ok: true, data: null } : { ok: true, data: tree } }) });
  const zip = await c.generateProposalPpt(c.buildProjectViewModel(data()));
  assert.equal(zip.proposalReport.total, 2); assert.equal(zip.proposalReport.status, '부분 생성');
  assert.deepEqual(Array.from(zip.proposalReport.entries, e => e.number), ['마.1.1', '라.2.1']);
  assert.equal(zip.proposalReport.entries[1].sectionName, '감리 수행 인력');
  const selected = await c.generateProposalPpt(c.buildProjectViewModel(data()), ['QA_SYSTEM']);
  assert.equal(selected.proposalReport.total, 1); assert.equal(selected.proposalReport.entries[0].number, '마.1.1');
});
test('PPT modal is wide and responsive with scoped report styles and accessible dialog labeling', async () => {
  const { html } = await renderRequirements({});
  const modal = html.querySelector('#autoModal'), dialog = modal.querySelector('.proposal-modal-dialog');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'proposal-modal-heading');
  assert(html.querySelector('#proposal-modal-heading'));
  assert(pageSource.includes('max-width:1120px'));
  assert(pageSource.includes('@media (max-width:640px)'));
  assert.equal(modal.querySelector('#proposal-generation-report').getAttribute('aria-live'), undefined);
});

test('partial generation reports failed menus without fallback or false success', async () => {
  const b64 = await template(shape(para('[제목]'))), good = menu('QA_SYSTEM', b64), bad = { ...menu('ORGANIZATION'), id: 2 };
  const c = sandbox({ fetch: async url => ({ ok: true, json: async () => url.includes('master-templates') ? { ok: true, data: null } : { ok: true, data: [good, bad] } }) });
  const zip = await c.generateProposalPpt(c.buildProjectViewModel(data()));
  assert.equal(zip.proposalReport.status, '부분 생성');
  assert.equal(zip.proposalReport.entries[1].status, '생성 실패');
  assert.equal((await c.ProposalTemplate.slidePaths(zip)).length, 1);
});
