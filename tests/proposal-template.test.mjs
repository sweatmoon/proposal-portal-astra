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
