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
  function parse(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('PPT XML을 읽을 수 없습니다.');
    return doc;
  }
  function options() {
    return {
      extraStages: typeof getExtraSet === 'function' ? [...getExtraSet()] : [],
      mdScope: typeof document !== 'undefined' ? document.getElementById('proposal-md-scope')?.value || '' : '',
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
    const stageCount = ctx.base.length || null;
    const days = ctx.base.length && ctx.base.every(s => number(s.days) !== null && Number(s.days) > 0)
      ? ctx.base.reduce((sum, s) => sum + Number(s.days), 0) : null;
    const scopes = { 'baseline-auditors': ctx.total.baseline, auditors: ctx.total.baseline + ctx.total.additional, all: ctx.total.all };
    const scopesText = { 'baseline-auditors': '기본 단계 감리원', auditors: '전체 감리원', all: '전체 인력' };
    const actualMD = Object.hasOwn(scopes, ctx.opt.mdScope) ? scopes[ctx.opt.mdScope] : null;
    let mdStatus = compare(pd.requestMD, actualMD);
    if (ctx.warnings.length) mdStatus = '검토 필요';
    return [
      { label: '감리 단계', required: number(pd.requestStageCount) > 0 ? `${pd.requestStageCount}단계 이상` : 'RFP 단계 수 미입력', actual: `${stageCount ?? '미확인'}단계 (추가 선택 단계 제외)`, status: compare(pd.requestStageCount, stageCount) },
      { label: '현장감리 일수', required: number(pd.requestAuditDays) > 0 ? `${pd.requestAuditDays}일 이상` : 'RFP 최소 일수 미입력', actual: `${days ?? '미확인'}일 (기본 단계 일수 합계)`, status: compare(pd.requestAuditDays, days) },
      { label: '투입 공수', required: number(pd.requestMD) > 0 ? `${pd.requestMD} MD 이상` : 'RFP 요구공수 미입력', actual: actualMD === null ? `전체 ${ctx.total.all} MD / 비교 범위 미확정` : `${actualMD} MD / ${scopesText[ctx.opt.mdScope]}`, status: mdStatus },
      { label: '인력 자격·구성', required: 'RFP 자격·경력·상근 요건 확인', actual: `${ctx.members.length}명 / 항목별 증빙을 담당자가 확인해야 합니다.`, status: '검토 필요' },
    ];
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
    const ts = nodes(root, 't');
    if (!ts.length) return;
    ts[0].textContent = String(value);
    ts.slice(1).forEach(t => { t.textContent = ''; });
  }
  function ancestor(el, name) {
    while (el && el.localName !== name) el = el.parentNode;
    return el;
  }
  function common(ctx, menu) {
    return {
      '[제목]': [menu.menu_number, menu.menu_name].filter(Boolean).join(' '),
      '[감리사업명]': ctx.pd.projectTitle || undefined,
      '[주관기관]': ctx.pd.clientOrg || undefined,
      '[대상사업]': ctx.pd.targetProjectName || undefined,
      '[대상사업명]': ctx.pd.targetProjectName || undefined,
      '[대상사업시작일]': fmtDate(date(ctx.pd.targetStartDate)) || undefined,
      '[대상사업종료일]': fmtDate(date(ctx.pd.targetEndDate)) || undefined,
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
    Object.assign(map, { '[단계구분]': ctx.base.map(s => s.stage).join(' / '), '[기본감리공수]': ctx.total.baseline,
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
  // 폰트/문단 간격/셀 여백도 같이 축소해야 PowerPoint가 행을 다시 늘리지 않는다.
  function fitTable(table, height, warnings) {
    const rows = children(table, 'tr'), natural = tableHeight(table);
    const ratio = Math.min(1, height / natural), widths = nodes(table, 'gridCol').map(c => +c.getAttribute('w'));
    let remaining = Math.round(Math.min(height, natural)), minFont = Infinity;
    rows.forEach((row, ri) => {
      const h = ri === rows.length - 1 ? remaining : Math.max(1, Math.round((+row.getAttribute('h') || 1) * ratio));
      row.setAttribute('h', h); remaining -= h;
      children(row, 'tc').forEach((cell, ci) => {
        const span = Math.max(1, +cell.getAttribute('rowSpan') || 1);
        const cellH = rows.slice(ri, ri + span).reduce((s, r, n) => s + (n ? (+r.getAttribute('h') || 1) * ratio : h), 0);
        const colSpan = Math.max(1, +cell.getAttribute('gridSpan') || 1);
        const cellW = widths.slice(ci, ci + colSpan).reduce((s, w) => s + w, 0);
        const margin = Math.min(12700, h * 0.04);
        let props = children(cell, 'tcPr')[0];
        if (!props) { props = cell.ownerDocument.createElementNS(A, 'a:tcPr'); cell.appendChild(props); }
        for (const attr of ['marT', 'marB', 'marL', 'marR']) props.setAttribute(attr, Math.round(margin));
        const paras = nodes(cell, 'p'), content = paras.map(p => text(p));
        const maxLine = Math.max(1, ...content.flatMap(t => t.split('\n')).map(t => [...t].reduce((n, ch) => n + (/[\x00-\x7f]/.test(ch) ? 0.55 : 1), 0)));
        const lineCount = Math.max(1, content.reduce((n, t) => n + t.split('\n').length, 0));
        // sz 단위는 1/100pt, EMU는 12700/pt. 단일 장을 위해 최소 글자 크기로 중단하지 않는다.
        const cap = Math.max(1, Math.floor(Math.min((cellH - margin * 2) / (127 * 1.15 * lineCount), cellW ? (cellW - margin * 2) / (127 * maxLine) : Infinity)));
        for (const run of nodes(cell, 'r')) {
          if (!children(run, 'rPr').length) run.insertBefore(cell.ownerDocument.createElementNS(A, 'a:rPr'), run.firstChild);
        }
        for (const prop of [...nodes(cell, 'rPr'), ...nodes(cell, 'defRPr'), ...nodes(cell, 'endParaRPr')]) {
          const sz = Math.max(1, Math.min(cap, Math.round((+prop.getAttribute('sz') || 900) * ratio)));
          prop.setAttribute('sz', sz); if (text(cell)) minFont = Math.min(minFont, sz);
        }
        for (const space of [...nodes(cell, 'spcPts'), ...nodes(cell, 'spcPct')]) {
          const line = space.parentNode.localName === 'lnSpc';
          space.setAttribute('val', line && space.localName === 'spcPct' ? 100000 : Math.round((+space.getAttribute('val') || 0) * ratio));
        }
        for (const body of nodes(cell, 'bodyPr')) {
          body.setAttribute('wrap', 'square');
          for (const auto of [...children(body, 'spAutoFit'), ...children(body, 'normAutofit')]) body.removeChild(auto);
          if (!children(body, 'noAutofit').length) body.appendChild(cell.ownerDocument.createElementNS(A, 'a:noAutofit'));
        }
      });
    });
    const frame = ancestor(table, 'graphicFrame'), box = frame && geometry(frame);
    if (box) box.ext.setAttribute('cy', tableHeight(table));
    // 複製した Office 拡張 ID は再採番する（行/列の編集時の重複防止）。
    let id = 1;
    for (const el of Array.from(table.getElementsByTagName('*'))) if (['rowId', 'colId', 'cellId'].includes(el.localName)) el.setAttribute('val', id++);
    if (minFont < 700) warnings.push('전체 단계를 한 장에 맞추기 위해 표 글자 크기를 7pt 미만으로 조정했습니다. 확대하여 확인하세요.');
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
        const sum = key => stage.auditors.reduce((v, p) => v + (number(p[key]) ?? 0), 0);
        source.rows.forEach((original, i) => {
          const row = original.cloneNode(true), cells = children(row, 'tc'), contents = text(row);
          replace(row, token => stageValue(stage, token));
          if (i === 0) setText(cells[0], stage.stage);
          if (kind !== 'regular' && i === 0 && cells[3]) setText(cells[3], `${fmtDate(stage.start) || '확인 필요'} ~ ${fmtDate(stage.end) || '확인 필요'}`);
          if (cells[4] && /\(0\)/.test(contents)) {
            let value = sum('audit'), days = number(stage.days);
            if (contents.includes('예비조사')) { value = sum('pre'); days = value ? null : 0; }
            else if (contents.includes('시정조치')) { value = sum('post'); days = value ? null : 0; }
            else if (contents.includes('소계')) { value = stage.auditorMD; days = sum('pre') || sum('post') ? null : days; }
            setText(cells[4], `(${days ?? '확인 필요'})일 / (${value})MD`);
            if (days === null) warnings.push('예비조사·조치확인 일수는 MD로 역산하지 않습니다. 확인 필요로 표시된 일수를 검토하세요.');
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
      if (box) removeOverlays(doc, box, frame);
    }
    for (const shape of nodes(doc, 'sp', P)) {
      if (/\[단계1\].*\[단계2\]/.test(text(shape))) {
        setText(shape, ctx.stages.map(s => `${s.stage} (${s.start ? s.start.getUTCMonth() + 1 + '월' : '일정 확인'})`).join(' → '));
        for (const prop of nodes(shape, 'rPr')) prop.setAttribute('sz', Math.max(1, Math.round((+prop.getAttribute('sz') || 900) * Math.min(1, 4 / ctx.stages.length))));
      }
      // '기본 3단계' 같은 고정 단계 수는 실제 선택된 기본 단계 수로 갱신한다.
      for (const t of nodes(shape, 't')) t.textContent = t.textContent.replace(/기본\s*\d+단계/g, `기본 ${ctx.base.length}단계`);
    }
  }
  function actionResolver(doc, ctx, map) {
    const stages = ctx.stages.filter(s => [...s.auditors, ...s.experts].some(p => Number(p.post) > 0));
    if (stages.length > 3) throw new Error('조치확인 템플릿은 3단계까지 지원합니다. 양식 확장이 필요합니다.');
    const people = ctx.members.filter(m => stages.some(s => [...s.auditors, ...s.experts].some(p => p.name === m.name && Number(p.post) > 0)));
    if (people.length > 15) throw new Error('조치확인 템플릿은 15명까지 지원합니다. 양식 확장이 필요합니다.');
    if (ctx.warnings.some(w => w.includes('제안 인력 목록'))) throw new Error('단계 배정 인력을 제안 인력 목록에 연결한 후 생성하세요.');
    for (let i = 0; i < 3; i++) {
      map[`[단계${i + 1}]`] = stages[i]?.stage || '';
      map[`[단계${i + 1}MD]`] = stages[i] ? [...stages[i].auditors, ...stages[i].experts].reduce((v, p) => v + (number(p.post) ?? 0), 0) : '';
    }
    for (let i = 0; i < 15; i++) {
      const p = people[i];
      map[`[그룹${i + 1}]`] = p ? [p.group, p.expertSubGroup].filter(Boolean).join(' / ') : '';
      map[`[세부${i + 1}]`] = p?.field || '';
    }
    return (token, para) => {
      const m = token.match(/^\[이름(\d+)\]$/);
      if (!m) return map[token];
      const person = people[Number(m[1]) - 1];
      if (!person) return '';
      const cell = ancestor(para, 'tc'), row = ancestor(para, 'tr');
      if (!cell || !row) return undefined;
      const col = children(row, 'tc').indexOf(cell) - 3;
      const stage = stages[col];
      if (col < 0 || col > 2) return undefined;
      return stage && [...stage.auditors, ...stage.experts].some(p => p.name === person.name && Number(p.post) > 0) ? person.name : '';
    };
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
  async function build(menu, vm) {
    const template = (menu.templates || []).find(t => t.pptx_b64_key && t.variant_code === 'DEFAULT') || (menu.templates || []).find(t => t.pptx_b64_key);
    if (!template) throw new Error('업로드된 본문 템플릿이 없습니다.');
    const zip = await JSZip.loadAsync(template.pptx_b64_key, { base64: true });
    const ctx = context(vm._raw || vm, options());
    const warnings = [...ctx.warnings], map = common(ctx, menu);
    let stageSlots;
    const schedule = ['SCHEDULE_PLAN', 'DETAIL_SCHEDULE'].includes(menu.menu_code);
    if (schedule) {
      if (!ctx.stages.length) throw new Error('감리 단계 데이터가 없습니다.');
      const data = scheduleMap(ctx, menu); Object.assign(map, data.map); stageSlots = data.stages;
      warnings.push('일정 템플릿의 고정 도식·화살표·수행기한 문구는 유지됩니다. 실제 일정과의 일치 여부를 검토하세요.');
      if (menu.menu_code === 'DETAIL_SCHEDULE') warnings.push('예비조사 날짜는 템플릿의 시작일 -7일(달력일) 표기를 적용했습니다.');
    }
    const pres = parse(await zip.file('ppt/presentation.xml').async('string'));
    const size = nodes(pres, 'sldSz', P)[0];
    const slides = await slidePaths(zip);
    if (!slides.length) throw new Error('템플릿에 표시할 슬라이드가 없습니다.');
    for (const path of slides) {
      const doc = parse(await zip.file(path).async('string'));
      if (size) stripOutside(doc, +size.getAttribute('cx'), +size.getAttribute('cy'));
      if (menu.menu_code === 'DETAIL_SCHEDULE') updateDetailTables(doc, ctx, stageSlots, warnings);
      if (menu.menu_code === 'SCHEDULE_PLAN') {
        // [n]월이 있는 표에서만 연도 헤더 갱신. 나머지 고정 문구는 추정해서 변경하지 않음.
        for (const table of nodes(doc, 'tbl')) {
          if (!text(table).includes('[n]')) continue;
          const row = children(table, 'tr')[0], start = date(ctx.pd.targetStartDate);
          if (row && start) children(row, 'tc').slice(1).forEach((cell, i) => setText(cell, `${start.getUTCFullYear() + Math.floor((start.getUTCMonth() + i) / 12)}년`));
        }
        const start = date(ctx.pd.targetStartDate), end = date(ctx.pd.targetEndDate);
        if (start && end && (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() >= 5) warnings.push('대상사업 기간이 현재 일정 도식의 5개월 범위를 초과합니다. 도식 확장이 필요합니다.');
      }
      const resolve = menu.menu_code === 'ACTION_CONFIRM_STAFF' ? actionResolver(doc, ctx, map) : token => map[token];
      const unresolved = replace(doc, resolve);
      if (unresolved.length) warnings.push(`${path.split('/').pop()} 미치환: ${unresolved.join(', ')}`);
      zip.file(path, new XMLSerializer().serializeToString(doc));
    }
    // 레이아웃/마스터에 공통 변수가 있는 양식도 처리하되 인력 슬롯 토큰은 건드리지 않음.
    for (const path of Object.keys(zip.files).filter(p => /^ppt\/(slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p))) {
      const doc = parse(await zip.file(path).async('string'));
      const unresolved = replace(doc, token => common(ctx, menu)[token]);
      if (unresolved.length) warnings.push(`${path.split('/').pop()} 미치환: ${unresolved.join(', ')}`);
      zip.file(path, new XMLSerializer().serializeToString(doc));
    }
    if (menu.menu_code === 'ACTION_CONFIRM_STAFF') warnings.push('조치확인 공수가 있는 인력만 단계별 표시했습니다. 템플릿의 수행방안·횟수 문구는 담당자 확인이 필요합니다.');
    return { zip, warnings: unique(warnings), mergeStrategy: 'FOREIGN_TEMPLATE', slideCount: slides.length };
  }
  return { context, checks, options, date, fmtDate, replace, parse, common, scheduleMap, nodes, text, build, slidePaths };
})();
