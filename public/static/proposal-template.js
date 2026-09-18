/** 본문 PPT 전용: 데이터 정규화, 분산 런 치환, 검증. 첨부/사진 슬롯 엔진과 독립. */
'use strict';
var ProposalTemplate = (() => {
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const nodes = (root, name, ns = A) => Array.from(root.getElementsByTagNameNS(ns, name));
  const text = root => nodes(root, 't').map(n => n.textContent || '').join('');
  const children = (root, name) => Array.from(root.childNodes).filter(n => n.nodeType === 1 && n.localName === name);
  const unique = values => [...new Set(values)];
  const number = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const md = p => ['pre', 'audit', 'post'].reduce((sum, k) => sum + (number(p[k]) ?? 0), 0);
  function date(value) {
    const m = String(value || '').match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:$|[T\s])/);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
  }
  const fmtDate = d => d ? d.toISOString().slice(0, 10).replace(/-/g, '.') : '';
  function fmtPeriod(value) {
    const exact = date(value); if (exact) return fmtDate(exact);
    const month = String(value || '').trim().match(/^(\d{4})[.\-/](\d{1,2})$/);
    return month && +month[2] >= 1 && +month[2] <= 12 ? `${month[1]}.${month[2].padStart(2, '0')}` : '';
  }
  function periodBoundary(value, end = false) {
    const exact = date(value); if (exact) return exact;
    const label = fmtPeriod(value), m = label.match(/^(\d{4})\.(\d{2})$/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - (end ? 0 : 1), end ? 0 : 1)) : null;
  }
  function activityTotals(stage) {
    const round = v => Math.round(v * 10000) / 10000;
    const result = {};
    for (const key of ['pre', 'audit', 'post']) {
      const values = stage.auditors.map(p => number(p[key]));
      const valid = values.every(v => v !== null && v >= 0);
      result[key] = valid ? { days: Math.max(0, ...values), md: round(values.reduce((s, v) => s + v, 0)) } : { days: null, md: null };
    }
    const phases = Object.values(result);
    result.total = phases.every(p => p.days !== null) ? { days: round(phases.reduce((s, p) => s + p.days, 0)), md: round(phases.reduce((s, p) => s + p.md, 0)) } : { days: null, md: null };
    return result;
  }
  function parse(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('PPT XML을 읽을 수 없습니다.');
    return doc;
  }
  function options() {
    return {
      extraStages: typeof getExtraSet === 'function' ? [...getExtraSet()] : [],
      compliancePM: typeof document !== 'undefined' ? document.getElementById('proposal-compliance-pm')?.value || '' : '',
    };
  }
  function context(pd, opt = {}) {
    const warnings = [];
    const members = (pd.portalOrder || []).map(p => {
      const info = pd.personGradeMap?.[p.name] || {};
      return { ...p, ...info, name: p.name, group: info.group || p.group || '',
        expertSubGroup: info.expertSubGroup || p.expertSubGroup || '', field: pd.personFieldMap?.[p.name] || '' };
    });
    const stages = (pd.stages || []).map(s => {
      const dates = String(s.date || '').match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g) || [];
      const auditors = s['감리원']?.people || [], experts = s['전문가']?.people || [];
      for (const p of [...auditors, ...experts]) {
        if (['pre', 'audit', 'post'].some(k => number(p[k]) === null || Number(p[k]) < 0)) warnings.push('배정 공수에 누락·음수·비숫자 값이 있습니다.');
      }
      return { ...s, start: date(s.startDate || dates[0]), end: date(s.endDate || dates[1]), auditors, experts,
        auditorMD: auditors.reduce((v, p) => v + md(p), 0), expertMD: experts.reduce((v, p) => v + md(p), 0) };
    });
    const extra = new Set(opt.extraStages || []);
    const base = stages.filter(s => !extra.has(s.stage));
    const total = { baseline: 0, additional: 0, experts: 0, testers: 0, all: 0 };
    for (const s of stages) {
      total[extra.has(s.stage) ? 'additional' : 'baseline'] += s.auditorMD;
      for (const p of s.experts) total[pd.personGradeMap?.[p.name]?.group === '테스터' ? 'testers' : 'experts'] += md(p);
    }
    total.all = total.baseline + total.additional + total.experts + total.testers;
    for (const k of Object.keys(total)) total[k] = Math.round(total[k] * 10000) / 10000;
    if (number(pd.proposedMD) !== null && Math.abs(Number(pd.proposedMD) - total.all) > 0.0001) warnings.push('사업 제안공수와 인력별 배정 공수 합계가 다릅니다.');
    const linked = new Set(members.map(m => m.name));
    if (stages.some(s => [...s.auditors, ...s.experts].some(p => !linked.has(p.name)))) warnings.push('단계 배정 인력 중 제안 인력 목록에 없는 사람이 있습니다.');
    return { pd, members, stages, base, total, warnings, opt };
  }
  function checks(ctx) {
    const pd = ctx.pd;
    const compare = (required, actual) => number(required) === null || Number(required) <= 0 || actual === null ? '검토 필요' : actual >= Number(required) ? '충족' : '미충족';
    const { regular, days, dayStatus, actualMD, mdReliable } = requirementValues(ctx);
    const stageCount = regular.length || null;
    const mdStatus = mdReliable ? compare(pd.requestMD, actualMD) : '검토 필요';
    return [
      { label: '감리 단계', required: number(pd.requestStageCount) > 0 ? `${pd.requestStageCount}단계 이상` : 'RFP 단계 수 미입력', actual: `${stageCount ?? '미확인'}단계 (추가 선택·보조 단계 제외)`, status: compare(pd.requestStageCount, stageCount) },
      { label: '현장감리 일수', required: number(pd.requestAuditDays) > 0 ? `${pd.requestAuditDays}일 이상` : 'RFP 최소 일수 미입력', actual: `${days ?? '미확인'}일 (기본 일반단계별 최소)`, status: dayStatus },
      { label: '투입 공수', required: number(pd.requestMD) > 0 ? `${pd.requestMD} MD 이상` : 'RFP 요구공수 미입력', actual: `${actualMD} MD / 전체 인력 (감리원·전문가·테스터)`, status: mdStatus },
      { label: '인력 자격·구성', required: 'RFP 자격·경력·상근 요건 확인', actual: `${ctx.members.length}명 / 항목별 증빙을 담당자가 확인해야 합니다.`, status: '검토 필요' },
    ];
  }
  const validAssignment = p => p.mdComplete !== false && ['pre', 'audit', 'post'].every(k => number(p[k]) !== null && Number(p[k]) >= 0);
  // 사용자 확정 기준: 전체 인력 MD 합계, 기본 일반단계 각각의 최소 일수.
  // 사업별 요구값을 그대로 사용하고 구형 선택값/DOM으로 비교 범위를 바꾸지 않는다.
  function requirementValues(ctx) {
    const regular = ctx.base.filter(s => !/상시|상주|검수지원/.test(s.stage));
    const validDays = regular.length > 0 && regular.every(s => number(s.days) !== null && Number(s.days) >= 0);
    const days = validDays ? Math.min(...regular.map(s => Number(s.days))) : null;
    const required = number(ctx.pd.requestAuditDays);
    const below = regular.some(s => number(s.days) !== null && Number(s.days) >= 0 && Number(s.days) < required);
    const dayStatus = required === null || required <= 0 ? '검토 필요'
      : below ? '미충족' : days === null ? '검토 필요' : '충족';
    const assigned = ctx.stages.flatMap(s => [...s.auditors, ...s.experts]);
    const mdReliable = assigned.length > 0 && assigned.every(validAssignment) && !ctx.warnings.length;
    return { regular, days, dayStatus, assigned, mdReliable, actualMD: ctx.total.all };
  }
  // 3.6은 RFP 원문을 추론하지 않는다. 숫자 비교와 증빙 확인을 분리한다.
  function complianceData(ctx, menu) {
    const pd = ctx.pd, warnings = [...ctx.warnings];
    const { regular, days: dayValue, dayStatus, assigned, mdReliable, actualMD } = requirementValues(ctx);
    if (!mdReliable) warnings.push('공수: 배정 없음·원본 누락·배정 오류를 확인하세요. 표시 합계는 잠정값입니다.');
    const compare = (required, actual) => number(required) === null || Number(required) <= 0 || actual === null
      ? '검토 필요' : actual >= Number(required) ? '충족' : '미충족';
    const aggregate = statuses => statuses.includes('미충족') ? '미충족' : statuses.every(s => s === '충족') ? '충족' : '검토 필요';
    const display = v => number(v) !== null && Number(v) >= 0 ? Number(v) : '미입력';
    const round = v => Math.round(v * 100) / 100;
    const stageStatus = compare(pd.requestStageCount, regular.length || null);
    const datesValid = ctx.stages.length > 0 && ctx.stages.every(s => s.start && s.end && s.start <= s.end);
    if (!datesValid) warnings.push('일정: 시작/종료일 누락 또는 역전이 있습니다.');
    const mdStatus = mdReliable ? compare(pd.requestMD, actualMD) : '검토 필요';
    const activeNames = new Set(assigned.filter(p => validAssignment(p) && md(p) > 0).map(p => p.name));
    const auditorNames = unique(ctx.stages.flatMap(s => s.auditors.filter(p => validAssignment(p) && md(p) > 0).map(p => p.name)));
    const auditors = auditorNames.map(name => ctx.members.find(m => m.name === name) || { name });
    const residency = m => m.fulltimeKnown === false ? '미확인' : ['상근', '비상근'].includes(m.residency) ? m.residency : '미확인';
    const fulltime = auditors.filter(m => residency(m) === '상근').length;
    const unknownResidency = auditors.filter(m => residency(m) === '미확인').length;
    const senior = auditors.filter(m => /수석/.test(m.grade || '')).length;
    const ratio = auditors.length && !unknownResidency && mdReliable ? `${round(fulltime / auditors.length * 100)}%` : '미확인';
    // director는 제안 총괄일 수 있다. 명시적으로 선택된 배정 감리원만 PM으로 표시한다.
    const pm = auditors.find(m => m.name === ctx.opt.compliancePM && !/TBD|미정/i.test(m.name));
    const experts = ctx.members.filter(m => activeNames.has(m.name) && ['전문가', '테스터'].includes(m.group));
    const groups = [
      ['핵심 기술', experts.filter(m => m.group === '전문가' && /핵심/.test(m.expertSubGroup))],
      ['필수 기술', experts.filter(m => m.group === '전문가' && /필수/.test(m.expertSubGroup))],
      ['보안 진단', experts.filter(m => m.group === '전문가' && /보안/.test(m.expertSubGroup))],
      ['기타/미분류', experts.filter(m => m.group === '전문가' && !/핵심|필수|보안/.test(m.expertSubGroup))],
      ['테스트', experts.filter(m => m.group === '테스터')],
    ];
    const fieldList = members => unique(members.map(m => m.field || '분야 미입력')).join(', ');
    const statuses = [aggregate([stageStatus, dayStatus, datesValid ? '충족' : '검토 필요']), mdStatus, '검토 필요', '검토 필요', '검토 필요'];
    const labels = ['감리 방법·일수', '투입 공수', '총괄 감리원 전문성', '감리원 자격·상근', '전문가 경험·교육'];
    statuses.forEach((s, i) => { if (s !== '충족') warnings.push(`${labels[i]}: ${s}`); });
    warnings.push('3.6의 자격·상근·경험·교육 요구 문구는 양식 기준입니다. 해당 사업 RFP와 증빙을 대조하세요.');
    warnings.push('총괄 수행 건수·실제 감리 투입 기간·교육계획은 확인 자료가 없어 자동 확정하지 않습니다.');
    warnings.push('단계·일수 충족은 기본 일반단계별 최소 일수의 숫자 검토이며, RFP 단계 명칭·감리 방법의 최종 확인이 필요합니다.');
    const map = { ...common(ctx, menu),
      '[요구단계]': display(pd.requestStageCount), '[요구감리일수]': display(pd.requestAuditDays), '[요구투입공수]': display(pd.requestMD),
      '[준수요약]': statuses.includes('미충족') ? '미충족 항목 확인 필요' : '요청사항 검토 필요',
      '[추가제안요약]': '실제 배정 기준 제안 내역',
      '[단계구분]': `기본 ${regular.length}단계 / 추가 선택 ${ctx.stages.filter(s => (ctx.opt.extraStages || []).includes(s.stage)).length}단계`,
      '[단계별감리일정]': ctx.stages.map(s => `- ${s.stage || '단계 미입력'}: ${fmtDate(s.start) || '미확인'} ~ ${fmtDate(s.end) || '미확인'} (${display(s.days)}일)`).join('\n') || '감리 일정 미입력',
      '[일수비교기준]': `일수 기준: 기본 일반단계별 최소${dayValue === null ? ' / 일수 미확인' : ` ${round(dayValue)}일`}`,
      '[공수합계]': ctx.total.all, '[기본감리공수]': ctx.total.baseline, '[추가공수]': ctx.total.additional,
      '[전문가공수]': ctx.total.experts, '[테스트공수]': ctx.total.testers,
      '[공수비교내역]': `비교: 전체 인력 ${actualMD} MD${mdReliable && number(pd.requestMD) > 0 ? ` / 요구 대비 ${round(actualMD / Number(pd.requestMD) * 100)}%` : ' / 검토 필요'}`,
      '[총괄감리원]': pm?.name || '미지정 — 담당자 확인',
      '[총괄자격]': pm ? `${pm.grade || '등급 미확인'} / ${residency(pm)} / 자격번호 ${pm.certNo || '미입력'}` : '생성 화면에서 수행 PM을 선택하세요.',
      '[총괄경력]': '총괄 수행 건수·실제 감리 투입 기간: 증빙 확인 필요',
      '[총괄검토사항]': '소속 법인·상근·수석 및 경력 요건 대조 필요',
      '[감리원구성]': `배정 감리원 ${auditors.length}명 / 수석 표기 ${senior}명\n상근 ${fulltime}명 (${ratio})${unknownResidency ? ` / 미확인 ${unknownResidency}명` : ''}`,
      '[감리원분야]': `배정 분야: ${fieldList(auditors) || '미입력'}`,
      '[감리원검토사항]': '등록·등급·상근 및 유사사업 경력 증빙 확인 필요',
      '[전문가구성]': groups.filter(([, members]) => members.length).map(([label, members]) => `${label} ${members.length}명 (${fieldList(members)})`).join('\n') || '전문가·테스터 배정 없음',
      '[교육계획]': '미입력 — 담당자 확인 필요',
    };
    ['방법일수판정', '공수판정', '총괄판정', '감리원판정', '공통판정'].forEach((key, i) => { map[`[${key}]`] = statuses[i]; });
    return { map, warnings: unique(warnings), statuses };
  }
  // 문단의 모든 a:t를 합쳐 찾되, 역순으로 치환하여 런 서식·주변 문구·XML escaping을 보존.
  function replace(root, resolve) {
    const unresolved = [];
    for (const para of nodes(root, 'p')) {
      const ts = nodes(para, 't');
      const raw = ts.map(t => t.textContent || '').join('');
      const matches = [...raw.matchAll(/\[[^\[\]\r\n]+\]/g)];
      for (const match of matches.reverse()) {
        const label = match[0].replace(/\s+/g, '');
        const value = resolve(label, para);
        if (value === undefined || value === null) {
          if (!/^\[(?:붙임|주요경력및자격|주요자격)/.test(label)) unresolved.push(label);
          continue;
        }
        let offset = 0;
        const ranges = ts.map(t => { const start = offset; offset += (t.textContent || '').length; return { t, start, end: offset }; });
        const start = match.index, end = start + match[0].length;
        const hit = ranges.filter(r => r.start < end && r.end > start);
        hit.forEach((r, i) => {
          const content = r.t.textContent || '';
          const before = i === 0 ? content.slice(0, start - r.start) : '';
          const after = i === hit.length - 1 ? content.slice(end - r.start) : '';
          r.t.textContent = before + (i === 0 ? String(value) : '') + after;
          r.t.setAttribute('xml:space', 'preserve');
        });
      }
    }
    return unique(unresolved);
  }
  function setText(root, value) {
    let ts = nodes(root, 't');
    if (!ts.length && root.localName === 'tc' && String(value)) {
      let body = children(root, 'txBody')[0];
      if (!body) { body = root.ownerDocument.createElementNS(A, 'a:txBody'); root.insertBefore(body, children(root, 'tcPr')[0] || null); }
      while (body.firstChild) body.removeChild(body.firstChild);
      for (const name of ['bodyPr', 'lstStyle', 'p']) body.appendChild(root.ownerDocument.createElementNS(A, 'a:' + name));
      const r = root.ownerDocument.createElementNS(A, 'a:r'), t = root.ownerDocument.createElementNS(A, 'a:t');
      children(body, 'p')[0].appendChild(r); r.appendChild(t); ts = [t];
    }
    if (!ts.length) return;
    ts[0].textContent = String(value);
    ts.slice(1).forEach(t => { t.textContent = ''; });
    // 전체 셀/도형을 교체할 때 원본의 빈 문단·줄바꿈이 행 높이를 늘리지 않게 한다.
    const keep = ancestor(ts[0], 'p');
    for (const para of nodes(root, 'p')) if (para !== keep) para.parentNode.removeChild(para);
    for (const br of nodes(root, 'br')) br.parentNode.removeChild(br);
  }
  function ancestor(el, name) {
    while (el && el.localName !== name) el = el.parentNode;
    return el;
  }
  function common(ctx, menu) {
    const requiredDays = number(ctx.pd.requestAuditDays);
    return {
      '[제목]': [menu.menu_number, menu.menu_name].filter(Boolean).join(' '),
      '[감리사업명]': ctx.pd.projectTitle || undefined,
      '[주관기관]': ctx.pd.clientOrg || undefined,
      '[대상사업]': ctx.pd.targetProjectName || undefined,
      '[대상사업명]': ctx.pd.targetProjectName || undefined,
      '[대상사업시작일]': fmtPeriod(ctx.pd.targetStartDate) || undefined,
      '[대상사업종료일]': fmtPeriod(ctx.pd.targetEndDate) || undefined,
      // 저장된 요구값만 숫자로 치환한다. 단위는 양식에 두고 실제 단계 일수로 대체하지 않는다.
      '[요구감리일수]': requiredDays !== null && requiredDays >= 0 ? requiredDays : undefined,
    };
  }
  // 회사 양식의 단계5 날짜는 상주감리 칸에 위치한다. 검수지원은 별도 고정 행이다.
  function scheduleStages(ctx) {
    const regular = ctx.stages.filter(s => !/상주|상시|검수지원/.test(s.stage));
    const resident = ctx.stages.filter(s => /상주|상시/.test(s.stage));
    // 기존 양식의 부가 문구용 슬롯만 유지한다. 실제 표는 ctx.stages 전체로 재구성한다.
    return [...Array.from({ length: 4 }, (_, i) => regular[i] || null), resident[0] || null];
  }
  function scheduleMap(ctx, menu) {
    const map = common(ctx, menu), stages = scheduleStages(ctx);
    stages.forEach((s, i) => {
      map[`[단계${i + 1}]`] = s?.stage || '';
      map[`[단계${i + 1}시작일]`] = s ? fmtDate(s.start) || undefined : '';
      map[`[단계${i + 1}종료일]`] = s ? fmtDate(s.end) || undefined : '';
      if (s?.start) { const d = new Date(s.start); d.setUTCDate(d.getUTCDate() - 7); map[`[단계${i + 1}시작일-7]`] = fmtDate(d); }
      else map[`[단계${i + 1}시작일-7]`] = s ? undefined : '';
    });
    const validStarts = ctx.stages.map(s => s.start).filter(Boolean), validEnds = ctx.stages.map(s => s.end).filter(Boolean);
    map['[감리기간]'] = validStarts.length === ctx.stages.length && validEnds.length === ctx.stages.length && ctx.stages.length
      ? `${fmtDate(new Date(Math.min(...validStarts)))} ~ ${fmtDate(new Date(Math.max(...validEnds)))}` : undefined;
    Object.assign(map, { '[단계구분]': `기본 ${ctx.base.length}단계`, '[기본감리공수]': ctx.total.baseline,
      '[추가공수]': ctx.total.additional, '[전문가공수]': ctx.total.experts, '[테스트공수]': ctx.total.testers, '[공수합계]': ctx.total.all });
    const groups = [ctx.members.filter(m => m.group === '전문가' && !/필수|보안/.test(m.expertSubGroup)),
      ctx.members.filter(m => /필수/.test(m.expertSubGroup)), ctx.members.filter(m => /보안/.test(m.expertSubGroup))];
    let offset = 1;
    groups.forEach((group, index) => {
      const fields = unique(group.map(m => m.field).filter(Boolean));
      const capacity = [4, 2, 3][index];
      // 표 본문은 updatePlanTable에서 분야 수만큼 확장한다.
      for (let i = 0; i < capacity; i++) map[`[분야${offset++}]`] = fields[i] || '';
    });
    const start = date(ctx.pd.targetStartDate);
    for (let i = 0; i < 5; i++) map[i ? `[n+${i}]` : '[n]'] = start ? (start.getUTCMonth() + i) % 12 + 1 : undefined;
    return { map, stages };
  }
  function stripOutside(doc, width, height) {
    const tree = nodes(doc, 'spTree', P)[0];
    if (!tree) return;
    for (const shape of Array.from(tree.childNodes)) {
      if (shape.nodeType !== 1) continue;
      const xf = nodes(shape, 'xfrm')[0] || nodes(shape, 'xfrm', P)[0];
      if (!xf) continue;
      const off = children(xf, 'off')[0], ext = children(xf, 'ext')[0];
      if (!off || !ext) continue;
      const x = +off.getAttribute('x'), y = +off.getAttribute('y');
      if (x >= width || y >= height || x + +ext.getAttribute('cx') <= 0 || y + +ext.getAttribute('cy') <= 0) tree.removeChild(shape);
    }
  }
  function geometry(root) {
    const xf = nodes(root, 'xfrm', P)[0] || nodes(root, 'xfrm')[0];
    const off = xf && children(xf, 'off')[0], ext = xf && children(xf, 'ext')[0];
    return off && ext ? { x: +off.getAttribute('x'), y: +off.getAttribute('y'),
      w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy'), ext } : null;
  }
  function tableHeight(table) {
    return children(table, 'tr').reduce((sum, row) => sum + (+row.getAttribute('h') || 1), 0);
  }
  function fontSize(root, fallback = 900) {
    const runs = nodes(root, 'r').filter(r => text(r).trim());
    const sizes = runs.map(r => +children(r, 'rPr')[0]?.getAttribute('sz') || 0).filter(Boolean);
    return sizes.length ? Math.max(...sizes) : fallback;
  }
  // 글자 크기는 절대 변경하지 않는다. 여백·문단 간격만 정리하고 필요한 행 높이를 계산한다.
  function fitTable(table, height, warnings, { preserveCells = new Set(), lineHeight = 1.35, compactLines = false } = {}) {
    const rows = children(table, 'tr'), widths = nodes(table, 'gridCol').map(c => +c.getAttribute('w'));
    const minimums = rows.map(() => 1), merged = [];
    rows.forEach((row, ri) => children(row, 'tc').forEach((cell, ci) => {
      const preserve = preserveCells.has(cell);
      if (!preserve) {
        // 빈 셀의 기본 12pt 문단이 행 높이를 강제하지 않도록 비표시 문단만 정리한다.
        // 텍스트가 있는 셀의 rPr/defRPr/endParaRPr 크기는 변경하지 않는다.
        if (!text(cell).trim()) {
          for (const body of children(cell, 'txBody')) cell.removeChild(body);
          const empty = parse(`<a:txBody xmlns:a="${A}"><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="100"/></a:pPr><a:endParaRPr sz="100"/></a:p></a:txBody>`).documentElement;
          cell.insertBefore(cell.ownerDocument.importNode(empty, true), children(cell, 'tcPr')[0] || null);
        }
        let props = children(cell, 'tcPr')[0];
        if (!props) { props = cell.ownerDocument.createElementNS(A, 'a:tcPr'); cell.appendChild(props); }
        for (const attr of ['marT', 'marB']) props.setAttribute(attr, '0');
        for (const attr of ['marL', 'marR']) props.setAttribute(attr, '6350');
        for (const para of nodes(cell, 'pPr')) {
          for (const attr of ['marL', 'marR', 'indent']) para.setAttribute(attr, '0');
          para.setAttribute('latinLnBrk', '1');
        }
        for (const space of [...nodes(cell, 'spcPts'), ...nodes(cell, 'spcPct')]) {
          if (space.parentNode.localName !== 'lnSpc') space.setAttribute('val', '0');
          else if (space.localName === 'spcPct') space.setAttribute('val', '100000');
          else if (compactLines) space.setAttribute('val', Math.min(+space.getAttribute('val'), fontSize(cell)));
        }
        for (const body of nodes(cell, 'bodyPr')) {
          for (const attr of ['tIns', 'bIns', 'lIns', 'rIns']) body.setAttribute(attr, '0');
          for (const auto of [...children(body, 'spAutoFit'), ...children(body, 'normAutofit')]) body.removeChild(auto);
          if (!children(body, 'noAutofit').length) body.appendChild(cell.ownerDocument.createElementNS(A, 'a:noAutofit'));
        }
      }
      if (!text(cell).trim() || cell.getAttribute('vMerge') === '1' || cell.getAttribute('hMerge') === '1') return;
      const span = Math.max(1, +cell.getAttribute('rowSpan') || 1);
      const colSpan = Math.max(1, +cell.getAttribute('gridSpan') || 1);
      const width = widths.slice(ci, ci + colSpan).reduce((s, w) => s + w, 0) || Infinity;
      const size = fontSize(cell);
      const lines = nodes(cell, 'p').reduce((sum, p) => sum + text(p).split('\n').reduce((n, line) => {
        const chars = [...line].reduce((s, ch) => s + (/[\x00-\x7f]/.test(ch) ? 0.53 : 1), 0);
        return n + Math.max(1, Math.ceil(chars * size * 127 / Math.max(1, width - 12700)));
      }, 0), 0);
      // 보호된 고정 문구는 원본 들여쓰기·문단 간격·줄바꿈을 측정만 하고 수정하지 않는다.
      const props = children(cell, 'tcPr')[0];
      const inset = preserve ? (+props?.getAttribute('marL') || 0) + (+props?.getAttribute('marR') || 0) : 12700;
      const preservedHeight = preserve ? nodes(cell, 'p').reduce((sum, p) => {
        const pr = children(p, 'pPr')[0], indent = Math.max(0, +pr?.getAttribute('marL') || 0);
        const available = Math.max(1, width - inset - indent);
        let lineCount = 1, used = 0;
        for (const part of Array.from(p.childNodes)) {
          if (part.localName === 'br') { lineCount++; used = 0; continue; }
          if (!['r', 'fld'].includes(part.localName)) continue;
          const runSize = +children(part, 'rPr')[0]?.getAttribute('sz') || size;
          for (const ch of text(part)) {
            const advance = runSize * 127 * (/[\x00-\x7f]/.test(ch) ? 0.53 : 1);
            if (used && used + advance > available) { lineCount++; used = 0; }
            used += advance;
          }
        }
        const spacing = name => {
          const e = pr && children(pr, name)[0];
          return e ? (+children(e, 'spcPts')[0]?.getAttribute('val') || 0) * 127 : 0;
        };
        const line = pr && children(pr, 'lnSpc')[0];
        const pts = line && children(line, 'spcPts')[0], pct = line && children(line, 'spcPct')[0];
        const leading = pts ? +pts.getAttribute('val') * 127 : size * 127 * (pct ? +pct.getAttribute('val') / 100000 : 1.2);
        return sum + lineCount * leading + spacing('spcBef') + spacing('spcAft');
      }, (+props?.getAttribute('marT') || 0) + (+props?.getAttribute('marB') || 0)) : 0;
      const min = Math.ceil(preserve ? preservedHeight : size * 127 * lineHeight * Math.max(1, lines));
      if (span === 1) minimums[ri] = Math.max(minimums[ri], min);
      else merged.push({ ri, span, min });
    }));
    for (const { ri, span, min } of merged) {
      const count = Math.min(span, rows.length - ri), sum = minimums.slice(ri, ri + count).reduce((s, v) => s + v, 0);
      if (sum < min) for (let i = ri; i < ri + count; i++) minimums[i] += Math.ceil((min - sum) / count);
    }
    const totalMin = minimums.reduce((s, h) => s + h, 0);
    // 빈 공간만 줄인다. 공간이 부족하더라도 글꼴을 축소하거나 행을 누락하지 않는다.
    const natural = rows.map((r, i) => Math.max(minimums[i], +r.getAttribute('h') || 1));
    const slack = natural.reduce((s, h, i) => s + h - minimums[i], 0);
    const useSlack = slack ? Math.min(1, Math.max(0, height - totalMin) / slack) : 0;
    rows.forEach((row, i) => row.setAttribute('h', Math.ceil(minimums[i] + (natural[i] - minimums[i]) * useSlack)));
    const frame = ancestor(table, 'graphicFrame'), box = frame && geometry(frame);
    if (box) box.ext.setAttribute('cy', tableHeight(table));
    let id = 1;
    for (const el of Array.from(table.getElementsByTagName('*'))) if (['rowId', 'colId', 'cellId'].includes(el.localName)) el.setAttribute('val', id++);
    // 배치 검증은 표 이동까지 끝낸 뒤 build에서 수행한다.
  }
  function removeOverlays(doc, area, keep) {
    const tree = nodes(doc, 'spTree', P)[0];
    if (!tree) return;
    for (const shape of Array.from(tree.childNodes)) {
      if (shape === keep || !['sp', 'cxnSp', 'pic', 'grpSp'].includes(shape.localName)) continue;
      const b = geometry(shape);
      if (b && b.x + b.w / 2 >= area.x && b.x + b.w / 2 <= area.x + area.w
        && b.y + b.h / 2 >= area.y && b.y + b.h / 2 <= area.y + area.h
        && b.w <= area.w * 1.05 && b.h <= area.h * 1.05) tree.removeChild(shape);
    }
  }
  function unmerge(cell) {
    for (const attr of ['rowSpan', 'gridSpan', 'hMerge', 'vMerge']) cell.removeAttribute(attr);
  }
  function stageRange(stages) {
    const valid = stages.filter(s => s.start && s.end && s.end >= s.start);
    return valid.length ? { start: new Date(Math.min(...valid.map(s => s.start))), end: new Date(Math.max(...valid.map(s => s.end))) } : null;
  }
  function planCalendar(ctx) {
    const dates = [periodBoundary(ctx.pd.targetStartDate), periodBoundary(ctx.pd.targetEndDate, true), ...ctx.stages.flatMap(s => [s.start, s.end])].filter(Boolean);
    if (!dates.length) return null;
    const first = new Date(Math.min(...dates)), last = new Date(Math.max(...dates));
    const count = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + count, 1));
    return { start, end, count };
  }
  // 날짜는 원본 날짜 도형의 글자 크기를 유지하고 막대/텍스트 위치만 조정한다.
  function drawPlanRange(doc, box, range, calendar, label, color = '2A6DA0', font = 900) {
    const tree = nodes(doc, 'spTree', P)[0];
    if (!tree || !calendar) return;
    let id = Math.max(0, ...nodes(doc, 'cNvPr', P).map(n => +n.getAttribute('id') || 0));
    function shape(name, x, y, w, h, value, fill, font) {
      const escaped = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const xml = `<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${++id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.max(1, Math.round(w))}" cy="${Math.max(1, Math.round(h))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ko-KR" sz="${font}"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${escaped}</a:t></a:r></a:p></p:txBody></p:sp>`;
      tree.appendChild(doc.importNode(parse(xml).documentElement, true));
    }
    let mid = box.x + box.w / 2;
    if (range) {
      const span = calendar.end - calendar.start;
      const x = box.x + box.w * Math.max(0, (range.start - calendar.start) / span);
      const right = box.x + box.w * Math.min(1, (range.end.getTime() + 86400000 - calendar.start) / span);
      const w = Math.max(1, right - x); mid = x + w / 2;
      shape('일정 막대', x, box.y + box.h - Math.min(25400, box.h * 0.12), w, Math.min(25400, box.h * 0.12), '', color, font);
    }
    const labelWidth = Math.min(box.w, Math.max(1, [...label].length * font * 127 * 0.63));
    const labelHeight = font * 127 * 1.35;
    shape('일정 날짜', Math.max(box.x, Math.min(mid - labelWidth / 2, box.x + box.w - labelWidth)), box.y + (box.h - labelHeight) / 2, labelWidth, labelHeight, label, null, font);
  }
  function updatePlanTable(doc, ctx, warnings) {
    const table = nodes(doc, 'tbl').find(t => children(t, 'tr').some(r => children(r, 'tc').length === 3 && /\[단계1\]/.test(text(r))));
    if (!table) return; // 간단한 토큰-only 양식은 기존 공통 치환을 사용한다.
    const original = children(table, 'tr'), originalHeight = tableHeight(table), frame = ancestor(table, 'graphicFrame');
    const box = frame && geometry(frame), prototype = original.find(r => text(r).includes('[단계1]'));
    const calendar = planCalendar(ctx), records = [];
    const originalDate = nodes(doc, 'sp', P).find(s => text(s).includes('[단계1시작일]'));
    const dateFont = originalDate ? fontSize(originalDate) : 900;
    const group = (items, source, label, describe, rangeOf) => {
      items.forEach((item, i) => {
        const row = source.cloneNode(true), cells = children(row, 'tc');
        cells.forEach(unmerge);
        setText(cells[0], i === 0 ? label : '');
        if (i === 0 && items.length > 1) cells[0].setAttribute('rowSpan', items.length);
        else if (i) cells[0].setAttribute('vMerge', '1');
        setText(cells[1], describe(item)); setText(cells[2], '');
        row.setAttribute('h', Math.max(+row.getAttribute('h') || 1, Math.ceil(dateFont * 127 * 1.45)));
        records.push({ row, range: rangeOf(item), isStage: label === '단계 감리팀' });
      });
    };
    group(ctx.stages, prototype, '단계 감리팀', s => s.stage, s => s.start && s.end && s.end >= s.start ? s : null);
    const expertGroups = [ctx.members.filter(m => m.group === '전문가' && !/필수|보안/.test(m.expertSubGroup)),
      ctx.members.filter(m => /필수/.test(m.expertSubGroup)), ctx.members.filter(m => /보안/.test(m.expertSubGroup))];
    expertGroups.forEach((members, i) => {
      const fields = unique(members.map(m => m.field || '분야 확인 필요'));
      const source = original.find(r => text(r).includes(`[분야${[1, 5, 7][i]}]`)) || prototype;
      group(fields, source, ['핵심기술 점검팀', '필수기술 점검팀', '보안 진단팀'][i], f => f, field => {
        const names = new Set(members.filter(m => (m.field || '분야 확인 필요') === field).map(m => m.name));
        return stageRange(ctx.stages.filter(s => s.experts.some(p => names.has(p.name) && md(p) > 0)));
      });
    });
    const testers = new Set(ctx.members.filter(m => m.group === '테스터').map(m => m.name));
    if (testers.size) group(['기능 테스트'], prototype, '테스트팀', x => x,
      () => stageRange(ctx.stages.filter(s => s.experts.some(p => testers.has(p.name) && md(p) > 0))));
    for (const row of original) table.removeChild(row);
    records.forEach(r => table.appendChild(r.row));
    fitTable(table, originalHeight, warnings);
    if (box) {
      removeOverlays(doc, box, frame);
      const widths = nodes(table, 'gridCol').map(c => +c.getAttribute('w'));
      let y = box.y;
      for (const rec of records) {
        const h = +rec.row.getAttribute('h'), label = rec.range ? `${fmtDate(rec.range.start)} ~ ${fmtDate(rec.range.end)}` : '일정 확인 필요';
        if (calendar) drawPlanRange(doc, { x: box.x + widths[0] + widths[1], y, w: widths[2], h }, rec.range, calendar, label, '2A6DA0', dateFont);
        else setText(children(rec.row, 'tc')[2], label);
        if (rec.isStage && !rec.range) warnings.push('일정 계획에 날짜가 없거나 시작일·종료일 순서가 잘못된 단계가 있습니다. 해당 행에 확인 필요로 표시했습니다.');
        y += h;
      }
    }
    // 전체 기간의 월 열을 복제하되 표 너비는 고정하여 한 장 안에 유지한다.
    if (calendar) for (const header of nodes(doc, 'tbl')) {
      if (!text(header).includes('[n]')) continue;
      const rows = children(header, 'tr'), grid = nodes(header, 'tblGrid')[0];
      if (rows.length < 2 || !grid) continue;
      const cols = children(grid, 'gridCol'); if (cols.length < 2) continue;
      const width = cols.slice(1).reduce((s, c) => s + +c.getAttribute('w'), 0), first = cols[0], col = cols[1];
      cols.slice(1).forEach(c => grid.removeChild(c));
      let remaining = width;
      for (let i = 0; i < calendar.count; i++) { const c = col.cloneNode(true), w = i === calendar.count - 1 ? remaining : Math.floor(width / calendar.count); c.setAttribute('w', w); remaining -= w; grid.appendChild(c); }
      rows.forEach((row, ri) => {
        const cells = children(row, 'tc'), sample = cells[1];
        if (!sample) return;
        cells.slice(1).forEach(c => row.removeChild(c));
        for (let i = 0; i < calendar.count; i++) {
          const c = sample.cloneNode(true); unmerge(c);
          const d = new Date(Date.UTC(calendar.start.getUTCFullYear(), calendar.start.getUTCMonth() + i, 1));
          setText(c, ri === 0 ? `${d.getUTCFullYear()}년` : ri === 1 ? `${d.getUTCMonth() + 1}월` : '');
          row.appendChild(c);
        }
      });
      // 같은 연도끼리 병합하고, 연도가 바뀌는 곳에서만 끊는다.
      const yearCells = children(rows[0], 'tc');
      for (let i = 1; i < yearCells.length;) {
        let end = i + 1; while (end < yearCells.length && text(yearCells[end]) === text(yearCells[i])) end++;
        if (end - i > 1) yearCells[i].setAttribute('gridSpan', end - i);
        for (let j = i + 1; j < end; j++) { setText(yearCells[j], ''); yearCells[j].setAttribute('hMerge', '1'); }
        i = end;
      }
      fitTable(header, 0, warnings);
      const hFrame = ancestor(header, 'graphicFrame'), hBox = hFrame && geometry(hFrame);
      if (hBox && rows[2]) {
        const area = { x: hBox.x + +first.getAttribute('w'), y: hBox.y + +rows[0].getAttribute('h') + +rows[1].getAttribute('h'), w: width, h: +rows[2].getAttribute('h') };
        removeOverlays(doc, area, hFrame);
        const start = periodBoundary(ctx.pd.targetStartDate), end = periodBoundary(ctx.pd.targetEndDate, true);
        drawPlanRange(doc, area, start && end && end >= start ? { start, end } : null, calendar,
          start && end && end >= start ? `${fmtPeriod(ctx.pd.targetStartDate)} ~ ${fmtPeriod(ctx.pd.targetEndDate)}` : '대상사업 기간 확인 필요', '7190AC', dateFont);
      }
    }
    // 원본 폰트로 필요한 월 헤더 높이를 확보한 뒤, 남는 상단 간격을 회수한다.
    const monthHeader = nodes(doc, 'tbl').find(t => t !== table && /대상사업 추진 일정/.test(text(t)));
    const headFrame = monthHeader && ancestor(monthHeader, 'graphicFrame'), headBox = headFrame && geometry(headFrame);
    if (box && headBox) {
      const newY = headBox.y + headBox.h + 60000, dy = Math.min(0, newY - box.y);
      if (dy) {
        const off = nodes(frame, 'off')[0]; if (off) off.setAttribute('y', box.y + dy);
        for (const shape of nodes(doc, 'sp', P)) {
          const name = nodes(shape, 'cNvPr', P)[0]?.getAttribute('name'), b = geometry(shape);
          if (b && b.y >= box.y && ['일정 막대', '일정 날짜'].includes(name)) {
            const o = nodes(shape, 'off')[0]; o.setAttribute('y', b.y + dy);
          }
        }
      }
    }
  }
  function stageValue(stage, token) {
    if (/^\[단계\d+\]$/.test(token)) return stage.stage;
    if (/^\[단계\d+시작일-7\]$/.test(token)) { const d = stage.start && new Date(stage.start); if (d) d.setUTCDate(d.getUTCDate() - 7); return fmtDate(d) || '확인 필요'; }
    if (/^\[단계\d+시작일\]$/.test(token)) return fmtDate(stage.start) || '확인 필요';
    if (/^\[단계\d+종료일\]$/.test(token)) return fmtDate(stage.end) || '확인 필요';
    return undefined;
  }
  function updateDetailTables(doc, ctx, warnings) {
    for (const table of nodes(doc, 'tbl')) {
      if (!/\[단계1\]/.test(text(table))) continue;
      const originalHeight = tableHeight(table), groups = [], headers = [], footers = [];
      let current = null;
      for (const row of children(table, 'tr')) {
        const cells = children(row, 'tc'), first = cells[0] && text(cells[0]);
        if (first?.includes('투입 공수 합계')) { footers.push(row); current = null; continue; }
        if (/\[단계\d+\]|상주감리|상시감리|검수지원/.test(first || '')) {
          current = { kind: /검수지원/.test(first) ? 'acceptance' : /상주|상시/.test(first) ? 'resident' : 'regular', rows: [] };
          groups.push(current);
        }
        if (current) current.rows.push(row); else headers.push(row);
      }
      if (!groups.length) continue;
      const replacements = [];
      for (const stage of ctx.stages) {
        const kind = /검수지원/.test(stage.stage) ? 'acceptance' : /상주|상시/.test(stage.stage) ? 'resident' : 'regular';
        const source = groups.find(g => g.kind === kind) || groups.find(g => g.kind === 'regular') || groups[0];
        const totals = activityTotals(stage);
        source.rows.forEach((original, i) => {
          const row = original.cloneNode(true), cells = children(row, 'tc'), contents = text(row);
          replace(row, token => stageValue(stage, token));
          if (i === 0) setText(cells[0], stage.stage);
          if (kind !== 'regular' && i === 0 && cells[3]) setText(cells[3], `${fmtDate(stage.start) || '확인 필요'} ~ ${fmtDate(stage.end) || '확인 필요'}`);
          if (cells[4] && /\(0\)/.test(contents)) {
            const key = contents.includes('예비조사') ? 'pre' : /시정조치|사후관리/.test(contents) ? 'post' : contents.includes('소계') ? 'total' : 'audit';
            const value = totals[key];
            setText(cells[4], `(${value.days ?? '확인 필요'})일 / (${value.md ?? '확인 필요'})MD`);
            if (value.days === null) warnings.push('활동별 공수 입력에 누락·음수·비숫자 값이 있어 일수/공수를 확정할 수 없습니다.');
          }
          replacements.push(row);
        });
      }
      for (const row of footers) { const cells = children(row, 'tc'); if (cells[4]) setText(cells[4], `총 ${ctx.total.baseline + ctx.total.additional}MD`); }
      for (const row of children(table, 'tr')) table.removeChild(row);
      for (const row of [...headers, ...replacements, ...footers]) table.appendChild(row);
      fitTable(table, originalHeight, warnings);
      // 표 위에 얹혀 있던 샘플 주석/화살표는 확장된 행과 어긋나므로 제거한다.
      const frame = ancestor(table, 'graphicFrame'), box = frame && geometry(frame);
      if (box) {
        removeOverlays(doc, box, frame);
        // 원본 상단 설명 아래의 여유 간격만 회수한다. 폰트나 장표 크기는 바꾸지 않는다.
        if (box.y > 1660000 && box.y < 1750000) nodes(frame, 'off')[0]?.setAttribute('y', '1660000');
      }
    }
    for (const shape of nodes(doc, 'sp', P)) {
      if (/\[단계1\].*\[단계2\]/.test(text(shape))) {
        const groups = new Map();
        for (const s of ctx.stages) { const label = s.stage.replace(/\([^)]*\)/g, '').trim(); groups.set(label, (groups.get(label) || 0) + 1); }
        // 상세 단계명/날짜는 왼쪽 표에 전부 표시하고, 좁은 요약 도식에는 종류별 건수를 표시한다.
        setText(shape, [...groups].map(([label, count]) => count > 1 ? `${label}(${count})` : label).join(' → '));
        const xf = nodes(shape, 'xfrm')[0], off = xf && children(xf, 'off')[0], ext = xf && children(xf, 'ext')[0];
        if (off && ext) { off.setAttribute('x', '6861654'); ext.setAttribute('cx', '2418912'); }
      }
      // '기본 3단계' 같은 고정 단계 수는 실제 선택된 기본 단계 수로 갱신한다.
      for (const p of nodes(shape, 'p')) {
        const raw = text(p), updated = raw.replace(/기본\s*\d+단계/g, `기본 ${ctx.base.length}단계`);
        if (raw !== updated) setText(p, updated);
      }
    }
  }
  // 감리원/전문가 같은 인력 구분이 아니라 실제 담당 분야로 왼쪽 계층을 구성한다.
  function actionField(person) {
    const field = String(person.field || '').trim();
    const key = field.replace(/\([^)]*\)/g, '').replace(/\s+/g, '');
    if (/사업관리|품질보증/.test(key)) return { group: '사업관리/품질보증', detail: field, rank: 0, split: false };
    if (/^(데이터베이스|DB)(설계|구축|감리)?$/i.test(key)) return { group: '데이터베이스', detail: field, rank: 2, split: false };
    if (/시스템구조|시스템아키텍처/.test(key)) return { group: '시스템 구조 및 보안', detail: field, rank: 3, split: false };
    if (!field) return { group: '분야 확인 필요', detail: '분야 확인 필요', rank: 4, split: false };
    if (/응용|애플리케이션|application/i.test(key) || /감리원/.test(person.group))
      return { group: '응용시스템', detail: field, rank: 1, split: true };
    return { group: field, detail: field, rank: 4, split: false };
  }
  function actionResolver(doc, ctx, map, warnings) {
    const participants = stage => [...stage.auditors, ...stage.experts].filter(p => number(p.post) > 0);
    const stages = ctx.stages.filter(s => participants(s).length);
    const assigned = unique(stages.flatMap(s => participants(s).map(p => p.name)));
    const byName = new Map(ctx.members.map(m => [m.name, m]));
    const names = unique([...ctx.members.filter(m => assigned.includes(m.name)).map(m => m.name), ...assigned]);
    const people = names.map(name => byName.get(name) || { name, group: '', expertSubGroup: '', field: ctx.pd.personFieldMap?.[name] || '' });
    const fields = new Map(people.map(person => [person.name, actionField(person)]));
    // 분야 분류 순서만 정렬하고 같은 분류 내의 포털 순서는 유지한다.
    people.sort((a, b) => fields.get(a.name).rank - fields.get(b.name).rank);
    for (const table of nodes(doc, 'tbl')) {
      const rows = children(table, 'tr'), head = rows.find(r => /\[단계\d+\]/.test(text(r)));
      if (!head) continue;
      const headCells = children(head, 'tc');
      const first = headCells.findIndex(c => /\[단계\d+\]/.test(text(c)));
      let last = first; while (last + 1 < headCells.length && /\[단계\d+\]/.test(text(headCells[last + 1]))) last++;
      const bodyRows = rows.filter(r => /\[이름\d+\]/.test(text(r)));
      if (!bodyRows.length) continue;
      const firstBody = rows.indexOf(bodyRows[0]), lastBody = rows.indexOf(bodyRows[bodyRows.length - 1]);
      const bodySource = bodyRows[0], rowSpecs = [
        ...rows.slice(0, firstBody).map(row => ({ row })),
        ...people.map((person, i) => ({ row: bodyRows[i] || bodySource, person, i })),
        ...rows.slice(lastBody + 1).map(row => ({ row })),
      ];
      const preserveCells = new Set();
      const oldHeight = tableHeight(table), frame = ancestor(table, 'graphicFrame'), box = frame && geometry(frame);
      const grid = nodes(table, 'tblGrid')[0], cols = grid && children(grid, 'gridCol');
      if (cols?.length) {
        const width = cols.reduce((sum, col) => sum + +col.getAttribute('w'), 0);
        const fixed = cols.slice(0, first).reduce((sum, col) => sum + +col.getAttribute('w'), 0)
          + cols.slice(last + 1).reduce((sum, col) => sum + +col.getAttribute('w'), 0);
        const originalStageWidth = +cols[first].getAttribute('w');
        // 빈 우측 간격까지 활용하되 옆 수행 절차 영역은 침범하지 않는다.
        const desired = fixed + originalStageWidth * stages.length;
        const right = box ? Math.min(6470000, box.x + desired) : width;
        const targetWidth = box ? Math.max(width, right - box.x) : width;
        const stageWidth = stages.length ? Math.max(1, Math.floor((targetWidth - fixed) / stages.length)) : 0;
        const expanded = [...cols.slice(0, first).map(c => c.cloneNode(true)),
          ...stages.map(() => { const c = cols[first].cloneNode(true); c.setAttribute('w', stageWidth); return c; }),
          ...cols.slice(last + 1).map(c => c.cloneNode(true))];
        if (first === 3 && cols.length === last + 2 && stages.length) {
          // 왼쪽 계층과 원본 수행방안에 읽을 수 있는 폭을 먼저 확보한다.
          const fractions = [0.10, 0.085, 0.30];
          expanded.slice(0, 3).forEach((c, i) => c.setAttribute('w', Math.floor(targetWidth * fractions[i])));
          const methodWidth = Math.max(+cols[last + 1].getAttribute('w'), Math.floor(targetWidth * 0.18));
          expanded[expanded.length - 1].setAttribute('w', methodWidth);
          const available = targetWidth - methodWidth - expanded.slice(0, 3).reduce((s, c) => s + +c.getAttribute('w'), 0);
          expanded.slice(3, 3 + stages.length).forEach(c => c.setAttribute('w', Math.floor(available / stages.length)));
        }
        cols.forEach(c => grid.removeChild(c)); expanded.forEach(c => grid.appendChild(c));
        if (box) box.ext.setAttribute('cx', expanded.reduce((sum, col) => sum + +col.getAttribute('w'), 0));
      }
      const rebuilt = rowSpecs.map(spec => {
        const row = spec.row.cloneNode(true), cells = children(row, 'tc'), source = cells[first];
        const mergedStageArea = +source.getAttribute('gridSpan') > 1;
        const before = cells.slice(0, first), after = cells.slice(last + 1);
        const stageCells = stages.map((stage, i) => {
          const cell = source.cloneNode(true); unmerge(cell);
          if (mergedStageArea) {
            if (i === 0 && stages.length > 1) cell.setAttribute('gridSpan', stages.length);
            else if (i) { setText(cell, ''); cell.setAttribute('hMerge', '1'); }
          } else {
            replace(cell, token => {
              if (/^\[단계\d+\]$/.test(token)) return stage.stage;
              if (/^\[단계\d+MD\]$/.test(token)) return Math.round(participants(stage).reduce((s, p) => s + Number(p.post), 0) * 10000) / 10000;
              if (/^\[이름\d+\]$/.test(token)) return spec.person && participants(stage).some(p => p.name === spec.person.name) ? spec.person.name : '';
              return map[token];
            });
          }
          return cell;
        });
        cells.forEach(c => row.removeChild(c)); [...before, ...stageCells, ...after].forEach(c => row.insertBefore(c, children(row, 'extLst')[0] || null));
        if (spec.person) {
          const field = fields.get(spec.person.name);
          replace(row, token => /^\[그룹\d+\]$/.test(token) ? field.group
            : /^\[세부\d+\]$/.test(token) ? field.detail : map[token]);
          if (first === 3) {
            unmerge(before[1]); unmerge(before[2]);
            if (!field.split) {
              // 세부 분야가 없는 행은 두 분류 칸을 가로 병합한다. 괄호 등 실제 분야 정보는 보존한다.
              setText(before[1], field.detail); before[1].setAttribute('gridSpan', '2');
              setText(before[2], ''); before[2].setAttribute('hMerge', '1');
            }
          }
          // 15행짜리 세로 병합을 실제 인원 수로 다시 만든다.
          if (before[0]) {
            unmerge(before[0]);
            if (spec.i === 0) { if (people.length > 1) before[0].setAttribute('rowSpan', people.length); }
            else { setText(before[0], ''); before[0].setAttribute('vMerge', '1'); }
          }
        }
        return row;
      });
      // 수행방안 열은 인력행부터 마지막 설명행까지 병합되어 있다.
      const suffix = children(bodySource, 'tc').slice(last + 1);
      suffix.forEach((cell, j) => {
        if (+cell.getAttribute('rowSpan') <= 1) return;
        const firstRow = firstBody, span = rebuilt.length - firstRow;
        for (let i = firstRow; i < rebuilt.length; i++) {
          const target = children(rebuilt[i], 'tc')[first + stages.length + j]; if (!target) continue;
          unmerge(target);
          if (i === firstRow) {
            // 텍스트를 평탄화하지 않고 원본 셀 전체를 복제: 런 색상, 굵기, 글머리표, 줄바꿈 유지.
            const copy = cell.cloneNode(true); unmerge(copy);
            if (span > 1) copy.setAttribute('rowSpan', span);
            target.parentNode.replaceChild(copy, target); preserveCells.add(copy);
          }
          else { setText(target, ''); target.setAttribute('vMerge', '1'); }
        }
      });
      if (!stages.length) {
        const label = children(rebuilt[0], 'tc')[0]; if (label) setText(label, '조치확인 공수가 있는 단계 없음');
      }
      rows.forEach(r => table.removeChild(r)); rebuilt.forEach(r => table.appendChild(r));
      // 응용시스템만 하위 분야 행을 두고 상위 분류를 세로 병합한다.
      for (let start = firstBody; first === 3 && start < firstBody + people.length;) {
        if (!fields.get(people[start - firstBody].name).split) { start++; continue; }
        const firstCell = children(rebuilt[start], 'tc')[1]; if (!firstCell) break;
        const label = text(firstCell); let end = start + 1;
        while (end < firstBody + people.length && fields.get(people[end - firstBody].name).split && text(children(rebuilt[end], 'tc')[1]) === label) end++;
        if (label && end - start > 1) {
          firstCell.setAttribute('rowSpan', end - start);
          for (let i = start + 1; i < end; i++) { const cell = children(rebuilt[i], 'tc')[1]; setText(cell, ''); cell.setAttribute('vMerge', '1'); }
        }
        start = end;
      }
      if (box && box.y > 2000000 && box.y < 2150000) nodes(frame, 'off')[0]?.setAttribute('y', '2000000');
      // 병합 없는 별도 수행방안 셀도 서식을 보존한다.
      for (const row of rebuilt) children(row, 'tc').slice(first + stages.length).forEach(cell => {
        if (text(cell).trim()) preserveCells.add(cell);
      });
      fitTable(table, box ? Math.min(oldHeight, 6700000 - box.y) : oldHeight, warnings, { preserveCells, lineHeight: 1.15, compactLines: true });
    }
    return token => map[token];
  }
  async function slidePaths(zip) {
    const pres = parse(await zip.file('ppt/presentation.xml').async('string'));
    const rels = parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
    const targets = Object.fromEntries(nodes(rels, 'Relationship', R).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
    return nodes(pres, 'sldId', P).map(s => {
      const target = targets[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
      if (!target) throw new Error('슬라이드 참조가 없습니다.');
      const parts = (target.startsWith('/') ? target.slice(1) : 'ppt/' + target).split('/'), result = [];
      for (const part of parts) { if (part === '..') result.pop(); else if (part && part !== '.') result.push(part); }
      const path = result.join('/');
      if (!zip.file(path)) throw new Error('슬라이드 파일이 없습니다: ' + path);
      return path;
    });
  }
  function templateWarnings(doc, ctx, menu) {
    // 사업 전체 경고를 모든 장표에 전파하지 않는다. 실제 소비하는 데이터만 검증한다.
    const content = text(doc).replace(/\s+/g, '');
    const usesMD = /\[[^\[\]]*(?:공수|MD)[^\[\]]*\]/i.test(content)
      || (menu.menu_code === 'DETAIL_SCHEDULE' && nodes(doc, 'tbl').some(t => /\[단계\d+\]/.test(text(t)) && /\(0\).*MD/.test(text(t))));
    const usesPersonnel = /\[이름\d*\]/.test(content) || menu.menu_code === 'ACTION_CONFIRM_STAFF';
    return ctx.warnings.filter(w => w.includes('제안 인력 목록') ? usesPersonnel : usesMD);
  }
  // 원본 표의 행 높이·글꼴·문단을 변경하지 않고, 실제 셀 폭/행간에 따른 초과 가능성을 보고한다.
  function complianceOverflow(doc, warnings) {
    for (const table of nodes(doc, 'tbl')) {
      const widths = nodes(table, 'gridCol').map(c => +c.getAttribute('w'));
      children(table, 'tr').forEach((row, ri) => children(row, 'tc').forEach((cell, ci) => {
        if (cell.getAttribute('vMerge') === '1' || cell.getAttribute('hMerge') === '1') return;
        const prop = children(cell, 'tcPr')[0];
        const width = widths.slice(ci, ci + Math.max(1, +cell.getAttribute('gridSpan') || 1)).reduce((a, b) => a + b, 0);
        if (!width) return;
        const inset = (+prop?.getAttribute('marL') || 91440) + (+prop?.getAttribute('marR') || 91440);
        let needed = (+prop?.getAttribute('marT') || 45720) + (+prop?.getAttribute('marB') || 45720);
        for (const para of nodes(cell, 'p')) {
          const pr = children(para, 'pPr')[0], size = fontSize(para, fontSize(cell));
          const available = Math.max(1, width - inset - Math.max(0, +pr?.getAttribute('marL') || 0));
          let lines = 1, used = 0;
          for (const part of Array.from(para.childNodes)) {
            if (part.localName === 'br') { lines++; used = 0; }
            if (!['r', 'fld'].includes(part.localName)) continue;
            const runSize = +children(part, 'rPr')[0]?.getAttribute('sz') || size;
            for (const ch of text(part)) {
              if (ch === '\n') { lines++; used = 0; continue; }
              const advance = runSize * 127 * (/[\x00-\x7f]/.test(ch) ? 0.53 : 1);
              if (used && used + advance > available) { lines++; used = 0; }
              used += advance;
            }
          }
          const line = pr && children(pr, 'lnSpc')[0];
          const pts = line && children(line, 'spcPts')[0], pct = line && children(line, 'spcPct')[0];
          const leading = pts ? +pts.getAttribute('val') * 127 : size * 127 * (pct ? +pct.getAttribute('val') / 100000 : 1.2);
          needed += lines * leading;
          for (const key of ['spcBef', 'spcAft']) {
            const sp = pr && children(pr, key)[0];
            if (sp) needed += (+children(sp, 'spcPts')[0]?.getAttribute('val') || 0) * 127;
          }
        }
        if (needed > +row.getAttribute('h')) warnings.push(`3.6 표 ${ri + 1}행 ${ci + 1}열: 원본 글꼴에서 셀 높이 초과 가능성이 있습니다. 전체 내용을 보존했으므로 배치를 확인하세요.`);
      }));
    }
  }
  async function buildCompliance(menu, vm) {
    const template = (menu.templates || []).find(t => t.pptx_b64_key && t.variant_code === 'DEFAULT') || (menu.templates || []).find(t => t.pptx_b64_key);
    if (!template) throw new Error('3.6 목차에 PPT 양식을 DEFAULT 템플릿으로 등록하세요. 별도 표로 대체하지 않습니다.');
    const zip = await JSZip.loadAsync(template.pptx_b64_key, { base64: true });
    const slides = await slidePaths(zip);
    if (slides.length !== 1) throw new Error('3.6은 원본 한 장 양식을 사용해야 합니다.');
    const pres = parse(await zip.file('ppt/presentation.xml').async('string'));
    const size = nodes(pres, 'sldSz', P)[0];
    if (!size) throw new Error('3.6 슬라이드 크기가 없습니다.');
    const doc = parse(await zip.file(slides[0]).async('string'));
    const tree = nodes(doc, 'spTree', P)[0];
    if (!tree) throw new Error('3.6 슬라이드 도형 목록이 없습니다.');
    // 장표 밖 작업용 예시는 파일과 생성 결과 모두 보존하며 데이터 치환 대상에서는 제외한다.
    const visible = Array.from(tree.childNodes).filter(el => {
      if (el.nodeType !== 1) return false;
      const b = geometry(el);
      return b && b.x < +size.getAttribute('cx') && b.y < +size.getAttribute('cy') && b.x + b.w > 0 && b.y + b.h > 0;
    });
    // 등록 양식의 토큰은 모두 선택 사항이다. 존재하는 토큰만 치환한다.
    // 토큰 없는 고정 문구·판정 셀·도형은 사용자의 의도이므로 추정하여 변경하지 않는다.
    // 실제로 존재하지만 지원하지 않는 토큰만 아래 replace()에서 미치환 경고로 남긴다.
    const { map, warnings } = complianceData(context(vm._raw || vm, options()), menu);
    for (const shape of visible) {
      const unresolved = replace(shape, token => map[token]);
      if (unresolved.length) warnings.push(`3.6 미치환: ${unresolved.join(', ')}`);
      complianceOverflow(shape, warnings);
    }
    zip.file(slides[0], new XMLSerializer().serializeToString(doc));
    for (const path of Object.keys(zip.files).filter(p => /^ppt\/(slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p))) {
      const layout = parse(await zip.file(path).async('string'));
      const unresolved = replace(layout, token => map[token]);
      if (unresolved.length) warnings.push(`${path.split('/').pop()} 미치환: ${unresolved.join(', ')}`);
      zip.file(path, new XMLSerializer().serializeToString(layout));
    }
    warnings.push('장표 밖 참고 표·작업용 객체는 원본대로 보존하며 자동 치환하지 않습니다. 제출 전 편집 화면에서 확인하세요.');
    return { zip, warnings: unique(warnings), slideCount: 1, mergeStrategy: 'FOREIGN_TEMPLATE' };
  }
  async function build(menu, vm) {
    if (['COMPLIANCE', 'SUMMARY_TABLE'].includes(menu.menu_code)) return buildCompliance(menu, vm);
    const template = (menu.templates || []).find(t => t.pptx_b64_key && t.variant_code === 'DEFAULT') || (menu.templates || []).find(t => t.pptx_b64_key);
    if (!template) throw new Error('업로드된 본문 템플릿이 없습니다.');
    const zip = await JSZip.loadAsync(template.pptx_b64_key, { base64: true });
    const ctx = context(vm._raw || vm, options());
    const warnings = [], map = common(ctx, menu);
    const schedule = ['SCHEDULE_PLAN', 'DETAIL_SCHEDULE'].includes(menu.menu_code);
    if (schedule) {
      if (!ctx.stages.length) throw new Error('감리 단계 데이터가 없습니다.');
      const data = scheduleMap(ctx, menu); Object.assign(map, data.map);
      if (menu.menu_code === 'DETAIL_SCHEDULE') warnings.push('세부 일정의 고정 수행기한·수행방안 문구는 담당자 확인이 필요합니다.');
      if (menu.menu_code === 'DETAIL_SCHEDULE') warnings.push('예비조사 날짜는 템플릿의 시작일 -7일(달력일) 표기를 적용했습니다.');
    }
    const pres = parse(await zip.file('ppt/presentation.xml').async('string'));
    const size = nodes(pres, 'sldSz', P)[0];
    const slides = await slidePaths(zip);
    if (!slides.length) throw new Error('템플릿에 표시할 슬라이드가 없습니다.');
    for (const path of slides) {
      const doc = parse(await zip.file(path).async('string'));
      if (size) stripOutside(doc, +size.getAttribute('cx'), +size.getAttribute('cy'));
      warnings.push(...templateWarnings(doc, ctx, menu));
      if (menu.menu_code === 'DETAIL_SCHEDULE') updateDetailTables(doc, ctx, warnings);
      if (menu.menu_code === 'SCHEDULE_PLAN') {
        updatePlanTable(doc, ctx, warnings);
        // [n]월이 있는 표에서만 연도 헤더 갱신. 나머지 고정 문구는 추정해서 변경하지 않음.
        for (const table of nodes(doc, 'tbl')) {
          if (!text(table).includes('[n]')) continue;
          const row = children(table, 'tr')[0], start = date(ctx.pd.targetStartDate);
          if (row && start) children(row, 'tc').slice(1).forEach((cell, i) => setText(cell, `${start.getUTCFullYear() + Math.floor((start.getUTCMonth() + i) / 12)}년`));
        }

      }
      const resolve = menu.menu_code === 'ACTION_CONFIRM_STAFF' ? actionResolver(doc, ctx, map, warnings) : token => map[token];
      const unresolved = replace(doc, resolve);
      // 합계표 등의 토큰 치환 후 길어진 텍스트도 원래 표 영역 안에 맞춘다.
      if (schedule) for (const table of nodes(doc, 'tbl')) {
        const frame = ancestor(table, 'graphicFrame'), box = frame && geometry(frame);
        fitTable(table, box?.h || tableHeight(table), warnings);
      }
      if (size && (schedule || menu.menu_code === 'ACTION_CONFIRM_STAFF')) {
        for (const frame of nodes(doc, 'graphicFrame', P)) {
          const b = geometry(frame);
          if (b && (b.y + b.h > +size.getAttribute('cy') || b.x + b.w > +size.getAttribute('cx'))) warnings.push('원본 글자 크기를 유지한 표가 슬라이드 영역을 초과합니다. 글자 축소나 페이지 분할 없이 담으려면 배치 조정이 필요합니다.');
        }
      }
      if (unresolved.length) warnings.push(`${path.split('/').pop()} 미치환: ${unresolved.join(', ')}`);
      zip.file(path, new XMLSerializer().serializeToString(doc));
    }
    // 레이아웃/마스터에 공통 변수가 있는 양식도 처리하되 인력 슬롯 토큰은 건드리지 않음.
    for (const path of Object.keys(zip.files).filter(p => /^ppt\/(slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p))) {
      const doc = parse(await zip.file(path).async('string'));
      warnings.push(...templateWarnings(doc, ctx, menu));
      const unresolved = replace(doc, token => common(ctx, menu)[token]);
      if (unresolved.length) warnings.push(`${path.split('/').pop()} 미치환: ${unresolved.join(', ')}`);
      zip.file(path, new XMLSerializer().serializeToString(doc));
    }
    if (menu.menu_code === 'ACTION_CONFIRM_STAFF') warnings.push('조치확인 공수가 있는 인력만 단계별 표시했습니다. 템플릿의 수행방안·횟수 문구는 담당자 확인이 필요합니다.');
    return { zip, warnings: unique(warnings), mergeStrategy: 'FOREIGN_TEMPLATE', slideCount: slides.length };
  }
  return { context, checks, complianceData, options, date, fmtDate, fmtPeriod, activityTotals, replace, parse, common, scheduleMap, nodes, text, build, slidePaths };
})();
