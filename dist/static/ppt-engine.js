/**
 * ppt-engine.js
 * ──────────────────────────────────────────────────────────────
 * PPT 자동화 고도화 엔진
 *
 * 구조:
 *   ProjectViewModel  — 데이터 표준화 (HTML Parser / DB Loader 양쪽 추상화)
 *   PptMenuRegistry   — DB에서 로드한 메뉴/규칙 캐시
 *   generateMenuPpt() — 단일 메뉴 PPT 생성 (메뉴 코드 → {zip, slideCount})
 *   generateProposalPpt() — 전체 메뉴 순서대로 생성 후 합본
 *   mergePresentationZips() — 범용 PPTX 합본 (STANDARD + FOREIGN_TEMPLATE)
 *
 * 기존 Generator 함수들은 그대로 유지하면서
 * 이 모듈이 메뉴 디스패처 역할을 담당한다.
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 1. ProjectViewModel — 표준 데이터 구조
//    parsedData (HTML 파서 산출물)를 ViewModel로 변환
// ═══════════════════════════════════════════════════════════════

/**
 * parsedData → ProjectViewModel 변환
 * 기존 parsedData 구조를 그대로 활용하면서 표준 인터페이스를 제공
 *
 * @param {object} pd - parsedData (기존 HTML 파서 결과)
 * @returns {object} ProjectViewModel
 */
function buildProjectViewModel(pd) {
  if (!pd) return null;

  // 인력을 역할별로 분류
  const allMembers = (pd.portalOrder || []).map(({ name, expertSubGroup }) => {
    const info = pd.personGradeMap?.[name] || {};
    const field = pd.personFieldMap?.[name] || '';
    const group = info.group || '';
    return { name, field, grade: info.grade || '', group, expertSubGroup: info.expertSubGroup || expertSubGroup || '', residency: info.residency || '', certNo: info.certNo || '' };
  });

  const auditMembers   = allMembers.filter(m => !m.group || m.group === '감리원' || m.group === '감리원팀');
  const coreExperts    = allMembers.filter(m => m.group === '핵심기술' || (m.group === '전문가' && !/필수|보안/.test(m.expertSubGroup)));
  const requiredExperts = allMembers.filter(m => m.group === '필수기술' || /필수/.test(m.expertSubGroup));
  const securityExperts = allMembers.filter(m => m.group === '보안' || /보안/.test(m.expertSubGroup));
  const testers        = allMembers.filter(m => m.group === '테스터');

  return {
    // ── 프로젝트 기본 정보
    project: {
      title: pd.projectTitle || '',
      client: pd.clientOrg || '',
      period: pd.projectPeriod || '',
      budget: pd.budget || '',
    },
    // ── 감리 단계 (stages) — 기존 구조 그대로
    stages: pd.stages || [],
    // ── 전체 인력 (순서 포함)
    members: allMembers,
    portalOrder: pd.portalOrder || [],
    // ── 역할별 분류
    auditMembers,
    coreExperts,
    requiredExperts,
    securityExperts,
    testers,
    // ── 원시 맵 (기존 함수 호환용)
    personGradeMap: pd.personGradeMap || {},
    personFieldMap: pd.personFieldMap || {},
    // ── 요구사항 / 리스크 (향후 확장)
    requirements: pd.requirements || [],
    risks: pd.risks || [],
    keywords: pd.keywords || [],
    // ── 요약 (computeSummaryTableData 등 결과 캐시용)
    summary: pd.summary || null,
    // ── 원본 parsedData 보관 (기존 함수가 직접 접근할 경우)
    _raw: pd,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. PptMenuRegistry — DB 메뉴 캐시
// ═══════════════════════════════════════════════════════════════

const PptMenuRegistry = (() => {
  let _cache = null;          // { byCode: {DETAIL_SCHEDULE: {...}}, list: [...] }
  let _fetchPromise = null;

  async function load(force = false) {
    if (_cache && !force) return _cache;
    if (_fetchPromise) return _fetchPromise;
    _fetchPromise = fetch('/api/ppt-menus?category=proposal')
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error('메뉴 로드 실패: ' + json.error);
        // 트리 → 플랫 리스트로 펼치기
        const list = [];
        function flatten(nodes) {
          (nodes || []).forEach(n => {
            list.push(n);
            if (n.children?.length) flatten(n.children);
          });
        }
        flatten(json.data);
        // rule이 있는 메뉴만 실행 가능
        const byCode = {};
        list.forEach(m => { if (m.rule) byCode[m.menu_code] = m; });
        _cache = { byCode, list, tree: json.data };
        return _cache;
      }).finally(() => { _fetchPromise = null; });
    return _fetchPromise;
  }

  function invalidate() { _cache = null; }

  return { load, invalidate };
})();

// ═══════════════════════════════════════════════════════════════
// 3. 범용 mergePresentationZips()
//    - STANDARD: slide XML + rels만 복사 (기존 방식)
//    - FOREIGN_TEMPLATE: master/theme/layout/media까지 복사
// ═══════════════════════════════════════════════════════════════

/**
 * 여러 {zip, mergeStrategy} 파트를 baseZip으로 합본
 *
 * @param {Array<{zip: JSZip, mergeStrategy?: string, slideCount?: number}>} parts
 * @returns {Promise<JSZip>} 합본된 JSZip 객체
 */
const MASTER_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const MASTER_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MASTER_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MASTER_OR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const masterNodes = (root, name, ns = MASTER_P) => Array.from(root.getElementsByTagNameNS(ns, name));
const masterXml = doc => new XMLSerializer().serializeToString(doc);
function masterResolvePath(owner, target) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) throw new Error('외부 PPT 관계를 내부 경로로 사용할 수 없습니다.');
  const path = target.startsWith('/') ? target.slice(1) : owner.slice(0, owner.lastIndexOf('/') + 1) + target;
  const out = [];
  for (const part of path.split('/')) {
    if (part === '..') { if (!out.length) throw new Error('잘못된 PPT 관계 경로입니다.'); out.pop(); }
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}
const masterRelsPath = path => path.replace(/([^/]+)$/, '_rels/$1.rels');
async function masterDoc(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error('PPT 관계 파일 누락: ' + path);
  return ProposalTemplate.parse(await file.async('string'));
}
function logoImageInfo(dataUri) {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri || '');
  if (!m || m[2].length > 12 * 1024 * 1024) throw new Error('로고 이미지 형식 또는 크기가 올바르지 않습니다.');
  const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  let width = 0, height = 0;
  if (m[1] === 'png' && bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) {
    const view = new DataView(bytes.buffer); width = view.getUint32(16); height = view.getUint32(20);
  } else if (m[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    for (let i = 2; i + 8 < bytes.length;) {
      if (bytes[i++] !== 255) break;
      const marker = bytes[i++], len = bytes[i] * 256 + bytes[i + 1];
      if (marker === 218 || marker === 217 || len < 2 || i + len > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = bytes[i + 3] * 256 + bytes[i + 4]; width = bytes[i + 5] * 256 + bytes[i + 6]; break;
      }
      i += len;
    }
  }
  if (!width || !height || width > 30000 || height > 30000) throw new Error('로고 이미지 크기를 확인할 수 없습니다.');
  return { bytes, width, height, extension: m[1] === 'png' ? 'png' : 'jpg' };
}
async function prepareActiveMaster(zip, vm) {
  const warnings = [], pd = vm._raw || vm;
  const pres = await masterDoc(zip, 'ppt/presentation.xml'), size = masterNodes(pres, 'sldSz')[0];
  if (!size) throw new Error('활성 마스터의 슬라이드 크기가 없습니다.');
  const rels = await masterDoc(zip, 'ppt/_rels/presentation.xml.rels');
  const masters = masterNodes(rels, 'Relationship', MASTER_R).filter(r => r.getAttribute('Type').endsWith('/slideMaster') && r.getAttribute('TargetMode') !== 'External')
    .map(r => masterResolvePath('ppt/presentation.xml', r.getAttribute('Target')));
  if (!masters.length) throw new Error('활성 파일에 슬라이드 마스터가 없습니다.');
  const parts = new Set(masters), layouts = [];
  for (const path of masters) {
    const mr = await masterDoc(zip, masterRelsPath(path));
    for (const rel of masterNodes(mr, 'Relationship', MASTER_R).filter(r => r.getAttribute('Type').endsWith('/slideLayout'))) {
      const target = masterResolvePath(path, rel.getAttribute('Target')), doc = await masterDoc(zip, target);
      const lr = await masterDoc(zip, masterRelsPath(target));
      const parent = masterNodes(lr, 'Relationship', MASTER_R).find(r => r.getAttribute('Type').endsWith('/slideMaster'));
      if (!parent || masterResolvePath(target, parent.getAttribute('Target')) !== path) throw new Error('활성 레이아웃의 마스터 연결이 올바르지 않습니다.');
      parts.add(target); layouts.push({ path: target, name: masterNodes(doc, 'cSld')[0]?.getAttribute('name') || '' });
    }
  }
  const docs = [], slots = [];
  const signatures = new Map();
  for (const path of parts) {
    const doc = await masterDoc(zip, path), rd = await masterDoc(zip, masterRelsPath(path));
    const unresolved = ProposalTemplate.replace(doc, token => token === '[감리사업명]' ? (pd.projectTitle || vm.project?.title || undefined) : undefined);
    if (unresolved.includes('[감리사업명]')) warnings.push('마스터 [감리사업명]: 저장된 감리사업명이 없어 미치환 상태로 남겼습니다.');
    for (const pic of masterNodes(doc, 'pic')) {
      const nv = masterNodes(pic, 'cNvPr')[0], blip = masterNodes(pic, 'blip', MASTER_A)[0];
      const rid = blip?.getAttributeNS(MASTER_OR, 'embed');
      const rel = masterNodes(rd, 'Relationship', MASTER_R).find(r => r.getAttribute('Id') === rid && r.getAttribute('Type').endsWith('/image') && r.getAttribute('TargetMode') !== 'External');
      if (!rel) continue;
      const target = masterResolvePath(path, rel.getAttribute('Target')), file = zip.file(target);
      if (!file) throw new Error('마스터 이미지 관계의 파일이 없습니다.');
      const named = [nv?.getAttribute('name'), nv?.getAttribute('descr')].some(s => /^(?:\[)?주관기관\s*로고(?:\])?$/.test((s || '').trim()));
      let placeholder = named;
      if (!placeholder) {
        if (!signatures.has(target)) {
          const bytes = await file.async('uint8array');
          // 사용자 제공 빨간 안내 그림의 정확한 SHA256. 임의 위치/색상/회사 로고는 추정하지 않는다.
          const hash = bytes.length === 735 ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('') : '';
          signatures.set(target, hash === 'bb954afa50472268925f0035fdbad85896e71397fb14a814d9c6d1237a9bea58');
        }
        placeholder = signatures.get(target);
      }
      if (placeholder) slots.push({ pic, blip, rd });
    }
    docs.push({ path, doc, rd });
  }
  if (slots.length) {
    try {
      const id = Number(pd.proposalId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('사업 ID가 없습니다.');
      const response = await fetch(`/api/projects/${id}/client-logo`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error([result.error || '조회 실패', result.stage, result.code].filter(v => v !== undefined).join(' / '));
      if (result.projectId !== id || result.clientOrg !== String(pd.clientOrg || vm.project?.client || '').trim()) throw new Error('로고 응답의 사업/주관기관이 일치하지 않습니다.');
      const image = logoImageInfo(result.dataUri);
      let filename = `active-client-logo.${image.extension}`, i = 1;
      while (zip.file('ppt/media/' + filename)) filename = `active-client-logo-${i++}.${image.extension}`;
      const ct = await masterDoc(zip, '[Content_Types].xml'), ns = ct.documentElement.namespaceURI;
      for (const { pic } of slots) {
        const xf = masterNodes(pic, 'xfrm', MASTER_A)[0], off = xf && masterNodes(xf, 'off', MASTER_A)[0], ext = xf && masterNodes(xf, 'ext', MASTER_A)[0];
        if (!off || !ext || ![+off.getAttribute('x'), +off.getAttribute('y'), +ext.getAttribute('cx'), +ext.getAttribute('cy')].every(Number.isFinite) || +ext.getAttribute('cx') <= 0 || +ext.getAttribute('cy') <= 0) throw new Error('주관기관 로고 도형의 위치·크기가 올바르지 않습니다.');
      }
      zip.file('ppt/media/' + filename, image.bytes);
      for (const { pic, blip, rd } of slots) {
        const xf = masterNodes(pic, 'xfrm', MASTER_A)[0], off = xf && masterNodes(xf, 'off', MASTER_A)[0], ext = xf && masterNodes(xf, 'ext', MASTER_A)[0];
        if (!off || !ext) throw new Error('주관기관 로고 도형의 위치·크기가 없습니다.');
        const w = +ext.getAttribute('cx'), h = +ext.getAttribute('cy'), scale = Math.min(w / image.width, h / image.height);
        const nw = Math.round(image.width * scale), nh = Math.round(image.height * scale);
        off.setAttribute('x', String(Math.round(+off.getAttribute('x') + (w - nw) / 2)));
        off.setAttribute('y', String(Math.round(+off.getAttribute('y') + (h - nh) / 2)));
        ext.setAttribute('cx', String(nw)); ext.setAttribute('cy', String(nh));
        masterNodes(pic, 'srcRect', MASTER_A).forEach(n => n.parentNode.removeChild(n));
        const ids = new Set(masterNodes(rd, 'Relationship', MASTER_R).map(r => r.getAttribute('Id')));
        let n = 1; while (ids.has(`rIdClientLogo${n}`)) n++;
        const rel = rd.createElementNS(MASTER_R, 'Relationship');
        rel.setAttribute('Id', `rIdClientLogo${n}`); rel.setAttribute('Type', MASTER_OR + '/image'); rel.setAttribute('Target', '../media/' + filename);
        rd.documentElement.appendChild(rel); blip.setAttributeNS(MASTER_OR, 'r:embed', `rIdClientLogo${n}`);
      }
      if (!Array.from(ct.getElementsByTagNameNS(ns, 'Default')).some(n => n.getAttribute('Extension') === image.extension)) {
        const d = ct.createElementNS(ns, 'Default'); d.setAttribute('Extension', image.extension); d.setAttribute('ContentType', image.extension === 'png' ? 'image/png' : 'image/jpeg'); ct.documentElement.appendChild(d);
        zip.file('[Content_Types].xml', masterXml(ct));
      }
    } catch (error) { warnings.push('주관기관 로고 미치환: ' + error.message + ' — 안내 그림을 유지했습니다.'); }
  }
  for (const { path, doc, rd } of docs) {
    zip.file(path, masterXml(doc)); zip.file(masterRelsPath(path), masterXml(rd));
  }
  return { zip, layouts, size: { w: +size.getAttribute('cx'), h: +size.getAttribute('cy') }, warnings: [...new Set(warnings)] };
}
const SECTION_MASTER_LAYOUTS = {
  SECTION_SCHEDULE: ['1. 감리 수행 일정', '2. 감리 수행 절차', '3. 시정조치확인 절차'],
  SECTION_MANPOWER: ['1. 감리 인력 구성', '2. 총괄 감리원', '3. 분야별 감리 인력'],
  SECTION_QUALITY: ['1. 감리 품질보증 방안', '2. 감리 자동화 도구 적용 계획', '3. 감리 지원 사항'],
  SECTION_COMPANY: ['1. 일반 현황', '2. 조직 및 인원 현황', '3. 보유 기술 및 사업 실적'],
};
async function planActiveLayouts(part, menu, menus, master) {
  const warnings = part.warnings || (part.warnings = []), planned = {};
  const pres = await masterDoc(part.zip, 'ppt/presentation.xml'), size = masterNodes(pres, 'sldSz')[0];
  if (!size || +size.getAttribute('cx') !== master.size.w || +size.getAttribute('cy') !== master.size.h) {
    warnings.push('활성 마스터와 본문 장표 크기가 달라 원본 레이아웃을 유지했습니다. 임의 확대·축소하지 않습니다.'); return;
  }
  let parent = menu, section, seen = new Set();
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id); if (SECTION_MASTER_LAYOUTS[parent.menu_code]) { section = parent.menu_code; break; }
    parent = menus.find(m => String(m.id) === String(parent.parent_id));
  }
  const number = String(menu.menu_number || '').replace(/^[가-힣][.\s]+/, '').match(/^(\d+)/)?.[1];
  const explicit = String(menu.rule?.target_layout_name || '').trim();
  const configured = explicit || (section && SECTION_MASTER_LAYOUTS[section][Number(number) - 1]);
  const key = name => String(name || '').replace(/\s+/g, '');
  for (const path of await ProposalTemplate.slidePaths(part.zip)) {
    const rd = await masterDoc(part.zip, masterRelsPath(path));
    const rel = masterNodes(rd, 'Relationship', MASTER_R).find(r => r.getAttribute('Type').endsWith('/slideLayout') && r.getAttribute('TargetMode') !== 'External');
    let name = configured;
    if (!name && rel) {
      const layout = await masterDoc(part.zip, masterResolvePath(path, rel.getAttribute('Target')));
      name = masterNodes(layout, 'cSld')[0]?.getAttribute('name');
    }
    const candidates = name ? master.layouts.filter(l => key(l.name) === key(name)) : [];
    if (candidates.length !== 1) {
      const msg = `활성 마스터 레이아웃 ${name || '(미지정)'}: ${candidates.length ? '동일 이름 중복' : '매칭 없음'}`;
      if (explicit) throw new Error(msg + '. 목차의 지정 레이아웃을 확인하세요.');
      warnings.push(msg + '. 원본 레이아웃을 유지했습니다.'); continue;
    }
    planned[path] = candidates[0].path;
  }
  part.activeLayouts = planned;
}
async function reconnectActiveLayout(zip, slidePath, layoutPath) {
  if (!zip.file(layoutPath)) throw new Error('활성 레이아웃 파일이 없습니다.');
  const relPath = masterRelsPath(slidePath), rd = await masterDoc(zip, relPath);
  const layouts = masterNodes(rd, 'Relationship', MASTER_R).filter(r => r.getAttribute('Type').endsWith('/slideLayout'));
  if (layouts.length !== 1) throw new Error('본문의 슬라이드 레이아웃 연결이 단일하지 않습니다.');
  layouts[0].setAttribute('Target', '../slideLayouts/' + layoutPath.split('/').pop());
  layouts[0].removeAttribute('TargetMode'); zip.file(relPath, masterXml(rd));
  const doc = await masterDoc(zip, slidePath);
  // 슬라이드 자체 배경/숨김 플래그가 새 마스터를 가리지 않게 하되 본문 도형/표는 그대로 둔다.
  doc.documentElement.setAttribute('showMasterSp', '1');
  const cs = masterNodes(doc, 'cSld')[0];
  if (cs) Array.from(cs.childNodes).filter(n => n.localName === 'bg').forEach(n => cs.removeChild(n));
  zip.file(slidePath, masterXml(doc));
}

async function mergePresentationZips(parts) {
  const usable = parts.filter(p => p && p.zip);
  if (!usable.length) throw new Error('병합할 슬라이드가 없습니다.');

  // ── MASTER_ONLY 전략 ──────────────────────────────────────────
  // 맨 앞 파트가 MASTER_ONLY면 해당 ZIP을 baseZip으로 사용하고
  // 기존 슬라이드(sldIdLst)를 비운 뒤 콘텐츠 파트 전체를
  // FOREIGN_TEMPLATE 방식으로 병합한다.
  // 활성 디자인은 보존하고 본문은 안전하게 복사한다.
  // 매칭된 본문 슬라이드의 layout 관계는 _mergeForeign()에서 활성 레이아웃으로 다시 연결한다.
  const isMasterFirst = usable[0].mergeStrategy === 'MASTER_ONLY';
  const baseZip = usable[0].zip;
  const contentParts = usable.slice(1);
  // contentParts[0] = baseZip의 원본 (마스터 없는 경우 index 0, 마스터 있는 경우 index 1)
  // 단, 마스터가 없으면 usable[0]이 그대로 baseZip이므로
  // 아래 루프는 항상 index 0 부터 (baseZip 슬라이드 포함 여부 다름)

  if (isMasterFirst && contentParts.length === 0) throw new Error('생성할 슬라이드가 없습니다.');

  let presXml     = await baseZip.file('ppt/presentation.xml').async('string');
  let presRelsXml = await baseZip.file('ppt/_rels/presentation.xml.rels').async('string');
  let ctXml       = await baseZip.file('[Content_Types].xml').async('string');

  // MASTER_ONLY: baseZip(마스터)의 기존 슬라이드 목록을 비운다
  // → slideMaster/Theme/Layout 체인은 유지, 슬라이드만 제거
  if (isMasterFirst) {
    presXml = presXml.replace(/<p:sldIdLst\b[^>]*(?:\/>|>[\s\S]*?<\/p:sldIdLst>)/, '<p:sldIdLst></p:sldIdLst>');
    presRelsXml = presRelsXml.replace(/<Relationship\b[^>]*\/>/g, tag => /Type="[^"]*\/slide"/.test(tag) ? '' : tag);
    console.log('[PptEngine] 마스터 baseZip 슬라이드 초기화 완료');
  }

  let maxRid   = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid   = Math.max(maxRid,   +n); return _; });
  let maxSldId = 255; presXml.replace(/<p:sldId id="(\d+)"/g, (_, n) => { maxSldId = Math.max(maxSldId, +n); return _; });

  // master/theme/layout 중복 방지용 경로 → 새 rId 맵
  const foreignPathMap = {};
  let   masterIdx = 100, themeIdx = 100, layoutIdx = 100;

  let newRels = '', newIds = '', newCt = '';
  let sc = 0;

  // ── 콘텐츠 파트 병합 ───────────────────────────────────────────
  // 마스터 있으면 contentParts(slice(1)) 전체 순회
  // 마스터 없으면 usable[0]은 baseZip이므로 index 1부터 순회
  // 단, 마스터 있는 경우 baseZip에 슬라이드가 없으므로
  // contentParts는 모두 FOREIGN_TEMPLATE으로 처리해야 layout 체인이 올바름
  const mergeParts = isMasterFirst ? contentParts : usable.slice(1);

  for (let i = 0; i < mergeParts.length; i++) {
    const part = mergeParts[i];
    const srcZip = part.zip;
    // 마스터가 있을 때: 모든 콘텐츠를 FOREIGN_TEMPLATE으로 처리
    // (마스터의 레이아웃과 원본의 레이아웃 이름이 달라도 _mergeForeign이 올바르게 처리)
    const isForeign = isMasterFirst || (part.mergeStrategy === 'FOREIGN_TEMPLATE');

    const srcPresRels = await srcZip.file('ppt/_rels/presentation.xml.rels').async('string');
    const srcPresXml  = await srcZip.file('ppt/presentation.xml').async('string').catch(() => null);

    if (isForeign) {
      // ── FOREIGN_TEMPLATE: master/theme/layout/media까지 복사 ──
      await _mergeForeign({
        baseZip, srcZip, srcPresXml, srcPresRels, activeLayouts: isMasterFirst ? part.activeLayouts : null,
        presXmlRef: { val: presXml },
        presRelsXmlRef: { val: presRelsXml },
        ctXmlRef: { val: ctXml },
        counters: { maxRid, maxSldId, masterIdx, themeIdx, layoutIdx, sc },
        foreignPathMap,
        newCt_ref: { val: newCt },
        newRels_ref: { val: newRels },
        newIds_ref: { val: newIds },
      });
      // 카운터 동기화
      maxRid      = _counters.maxRid;
      maxSldId    = _counters.maxSldId;
      masterIdx   = _counters.masterIdx;
      themeIdx    = _counters.themeIdx;
      layoutIdx   = _counters.layoutIdx;
      sc          = _counters.sc;
      newRels     = _counters.newRels;
      newIds      = _counters.newIds;
      newCt       = _counters.newCt;
      presXml     = _counters.presXml;
      presRelsXml = _counters.presRelsXml;
      ctXml       = _counters.ctXml;
    } else {
      // ── STANDARD: slide + rels만 복사 — sldIdLst 순서 보장 ──
      const relIdToTgt = {};
      srcPresRels.replace(/<Relationship\b[^>]*\/>/g, tag => {
        const id   = tag.match(/\bId="([^"]+)"/)?.[1];
        const tgt  = tag.match(/\bTarget="([^"]+)"/)?.[1];
        const type = tag.match(/\bType="([^"]+)"/)?.[1] || '';
        if (id && tgt && type.includes('slide') && !type.includes('slideLayout') && !type.includes('slideMaster')) relIdToTgt[id] = tgt;
        return tag;
      });

      // sldIdLst 순서로 정렬
      let orderedTgts = [];
      if (srcPresXml) {
        for (const m of [...srcPresXml.matchAll(/<p:sldId\b[^>]+>/g)]) {
          const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
          if (rid && relIdToTgt[rid]) orderedTgts.push(relIdToTgt[rid]);
        }
      }
      if (!orderedTgts.length) orderedTgts = Object.values(relIdToTgt);

      for (const tgt of orderedTgts) {
        const xml  = await srcZip.file('ppt/' + tgt).async('string').catch(() => null);
        if (!xml) continue;
        const relsPath = 'ppt/' + tgt.replace(/([^/]+)$/, '_rels/$1.rels');
        const rels = await srcZip.file(relsPath).async('string').catch(() => null);
        const newName = 'slideM' + (++sc) + '.xml';
        baseZip.file('ppt/slides/' + newName, xml);
        if (rels) baseZip.file('ppt/slides/_rels/' + newName + '.rels', rels);
        const rid  = 'rId' + (++maxRid); const sldId = ++maxSldId;
        newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${newName}"/>`;
        newIds  += `<p:sldId id="${sldId}" r:id="${rid}"/>`;
        newCt   += `<Override PartName="/ppt/slides/${newName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      }
    }
  }

  // 빈 목록도 확장하고 OOXML 순서(마스터/노트/유인물 → 슬라이드 목록 → 크기)를 지킨다.
  presXml = presXml.replace(/<p:sldIdLst\s*\/>/, '<p:sldIdLst></p:sldIdLst>');
  if (!presXml.includes('</p:sldIdLst>')) {
    const doc = ProposalTemplate.parse(presXml), list = doc.createElementNS(MASTER_P, 'p:sldIdLst');
    const anchor = Array.from(doc.documentElement.childNodes).find(n => ['sldSz', 'notesSz', 'smartTags', 'embeddedFontLst', 'custShowLst', 'photoAlbum', 'custDataLst', 'kinsoku', 'defaultTextStyle', 'modifyVerifier', 'extLst'].includes(n.localName));
    doc.documentElement.insertBefore(list, anchor || null);
    presXml = masterXml(doc).replace(/<p:sldIdLst\s*\/>/, '<p:sldIdLst></p:sldIdLst>');
  }

  presRelsXml = presRelsXml.replace('</Relationships>', newRels + '</Relationships>');
  presXml     = presXml.replace('</p:sldIdLst>', newIds + '</p:sldIdLst>');
  ctXml       = ctXml.replace('</Types>', newCt + '</Types>');
  baseZip.file('ppt/presentation.xml', presXml);
  baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml);
  baseZip.file('[Content_Types].xml', ctXml);

  return baseZip;
}

// foreign merge 전용 내부 카운터 공유 객체
const _counters = {};

/**
 * _injectMaster: 마스터 PPTX의 slideMaster/theme를 baseZip에 이식
 * baseZip 기존 slideMaster를 제거하고 masterZip의 것으로 교체
 */
async function _injectMaster({ baseZip, masterZip, presXmlRef, presRelsXmlRef, ctXmlRef }) {
  let presXml     = presXmlRef.val;
  let presRelsXml = presRelsXmlRef.val;
  let ctXml       = ctXmlRef.val;

  // 1. baseZip 기존 slideMaster rel 목록 수집 후 제거
  const oldMasterRids = [];
  presRelsXml.replace(/<Relationship\b[^>]*\/>/g, tag => {
    if (tag.includes('/slideMaster')) {
      const rid = tag.match(/\bId="([^"]+)"/)?.[1];
      if (rid) oldMasterRids.push(rid);
    }
    return tag;
  });
  // presentation.xml.rels에서 기존 master rel 제거
  presRelsXml = presRelsXml.replace(/<Relationship\b[^>]*\/slideMaster[^>]*\/>/g, '');
  // presentation.xml에서 기존 sldMasterIdLst 비우기
  presXml = presXml.replace(/<p:sldMasterIdLst>[\s\S]*?<\/p:sldMasterIdLst>/, '<p:sldMasterIdLst></p:sldMasterIdLst>');

  // 2. masterZip에서 slideMaster/theme/layout/media 복사
  let maxRid = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid = Math.max(maxRid, +n); return _; });
  let masterIdx = 100, themeIdx = 100, layoutIdx = 100;
  let newMasterCt = '';

  const masterPresRels = await masterZip.file('ppt/_rels/presentation.xml.rels')?.async('string') ?? '';
  const masterRels = [...masterPresRels.matchAll(/<Relationship\b[^>]*\/>/g)].map(m => m[0]);

  for (const relTag of masterRels) {
    if (!relTag.includes('/slideMaster')) continue;
    const origTarget = relTag.match(/Target="([^"]+)"/)?.[1];
    if (!origTarget) continue;
    const origMasterPath = origTarget.startsWith('ppt/') ? origTarget : 'ppt/' + origTarget.replace(/^slideMasters\//, 'slideMasters/');
    const absOrigPath    = origMasterPath.replace(/^ppt\/ppt\//, 'ppt/');

    // master XML 복사
    const masterXml = await masterZip.file(absOrigPath)?.async('string') ?? null;
    if (!masterXml) continue;
    const newMasterName = `slideMasterI${++masterIdx}.xml`;
    const newMasterPath = `ppt/slideMasters/${newMasterName}`;

    // master .rels 처리
    const origMasterRelsPath = absOrigPath.replace(/([^/]+)$/, '_rels/$1.rels');
    let masterRelsXml = await masterZip.file(origMasterRelsPath)?.async('string') ?? '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

    // theme 복사
    const themeMatches = [...masterRelsXml.matchAll(/<Relationship\b[^>]*Target="[^"]*theme[^"]*"[^>]*\/>/g)];
    for (const tm of themeMatches) {
      const themeRelTarget = tm[0].match(/Target="([^"]+)"/)?.[1];
      if (!themeRelTarget) continue;
      const origThemePath = ('ppt/slideMasters/' + themeRelTarget).replace(/\/[^/]+\/\.\.\//g, '/');
      const themeBytes = await masterZip.file(origThemePath)?.async('uint8array') ?? null;
      if (themeBytes) {
        const newThemeName = `themeI${++themeIdx}.xml`;
        const newThemePath = `ppt/theme/${newThemeName}`;
        baseZip.file(newThemePath, themeBytes);
        masterRelsXml = masterRelsXml.replace(themeRelTarget, '../../' + newThemePath);
        newMasterCt += `<Override PartName="/${newThemePath}" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`;
      }
    }

    // layout 복사
    const layoutMatches = [...masterRelsXml.matchAll(/<Relationship\b[^>]*Target="[^"]*slideLayout[^"]*"[^>]*\/>/g)];
    let newMasterRelsForLayouts = masterRelsXml;
    for (const lm of layoutMatches) {
      const layoutRelTarget = lm[0].match(/Target="([^"]+)"/)?.[1];
      if (!layoutRelTarget) continue;
      const origLayoutPath = ('ppt/slideMasters/' + layoutRelTarget).replace(/\/[^/]+\/\.\.\//g, '/');
      const layoutXml = await masterZip.file(origLayoutPath)?.async('string') ?? null;
      if (!layoutXml) continue;
      const newLayoutName = `slideLayoutI${++layoutIdx}.xml`;
      const newLayoutPath = `ppt/slideLayouts/${newLayoutName}`;

      // layout .rels
      const origLayoutRelsPath = origLayoutPath.replace(/([^/]+)$/, '_rels/$1.rels');
      let layoutRelsXml = await masterZip.file(origLayoutRelsPath)?.async('string') ?? '';
      if (layoutRelsXml) {
        layoutRelsXml = layoutRelsXml.replace(/Target="[^"]*slideMasters\/[^"]+"/g, `Target="../slideMasters/${newMasterName}"`);
        baseZip.file(`ppt/slideLayouts/_rels/${newLayoutName}.rels`, layoutRelsXml);
      }
      baseZip.file(newLayoutPath, layoutXml);
      newMasterCt += `<Override PartName="/${newLayoutPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`;
      newMasterRelsForLayouts = newMasterRelsForLayouts.replace(layoutRelTarget, `../slideLayouts/${newLayoutName}`);
    }

    // media 복사 (master .rels 기준)
    const mediaMatches = [...masterRelsXml.matchAll(/Target="([^"]*media\/[^"]+)"/g)];
    for (const mm of mediaMatches) {
      let mTarget = mm[1];
      if (!mTarget.startsWith('ppt/')) {
        mTarget = ('ppt/slideMasters/' + mTarget).replace(/\/[^/]+\/\.\.\//g, '/');
        if (!mTarget.startsWith('ppt/')) mTarget = 'ppt/' + mTarget;
      }
      const mBytes = await masterZip.file(mTarget)?.async('uint8array') ?? null;
      if (mBytes && !baseZip.file(mTarget)) baseZip.file(mTarget, mBytes);
    }

    baseZip.file(newMasterPath, masterXml);
    baseZip.file(newMasterPath.replace(/([^/]+)$/, '_rels/$1.rels'), newMasterRelsForLayouts);
    newMasterCt += `<Override PartName="/${newMasterPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`;

    // presentation.xml.rels + sldMasterIdLst 에 새 master 등록
    const masterRid = `rId${++maxRid}`;
    presRelsXml = presRelsXml.replace('</Relationships>',
      `<Relationship Id="${masterRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/${newMasterName}"/></Relationships>`);
    presXml = presXml.replace('</p:sldMasterIdLst>',
      `<p:sldMasterId id="${700 + masterIdx}" r:id="${masterRid}"/></p:sldMasterIdLst>`);
  }

  ctXml = ctXml.replace('</Types>', newMasterCt + '</Types>');
  Object.assign(_counters, { presXml, presRelsXml, ctXml, masterIdx, themeIdx, layoutIdx });
}


/**
 * FOREIGN_TEMPLATE 병합 내부 함수
 * master / theme / layout / media 참조 구조를 그대로 복사
 */
/**
 * FOREIGN_TEMPLATE 병합 — prefix 방식
 * 
 * src PPTX의 slides/layouts/masters/themes/media 파일 전체를
 * "p{partIdx}_" prefix 를 붙여 baseZip으로 복사한다.
 * 
 * prefix가 고정되므로:
 *   - 파일명 충돌이 구조적으로 불가능
 *   - rels XML 교체도 단순 문자열 치환 한 방법으로 완결
 */
async function _mergeForeign({ baseZip, srcZip, srcPresXml, srcPresRels, activeLayouts, counters,
                                foreignPathMap, presXmlRef, presRelsXmlRef, ctXmlRef,
                                newRels_ref, newIds_ref, newCt_ref }) {
  let { maxRid, maxSldId, sc } = counters;
  let newRels = newRels_ref.val, newIds = newIds_ref.val, newCt = newCt_ref.val;
  let presXml = presXmlRef.val, presRelsXml = presRelsXmlRef.val, ctXml = ctXmlRef.val;

  // ── 이 파트에 고유한 prefix ──────────────────────────────────────
  // foreignPathMap에 이미 처리된 파트 수를 기록해 prefix 결정
  if (!foreignPathMap._partCount) foreignPathMap._partCount = 0;
  const px = `p${++foreignPathMap._partCount}_`;  // e.g. "p1_", "p2_", ...

  // ── src ZIP 내 모든 ppt/ 파일 목록 ───────────────────────────────
  const srcFiles = {};  // { 'ppt/slides/slide1.xml': <ZipObject>, ... }
  srcZip.forEach((relPath, file) => {
    if (relPath.startsWith('ppt/') && !file.dir) srcFiles[relPath] = file;
  });

  // ── 파일명에 prefix 적용하는 헬퍼 ───────────────────────────────
  // ppt/slides/slide1.xml  → ppt/slides/p1_slide1.xml
  // ppt/media/image3.png   → ppt/media/p1_image3.png
  // ppt/theme/theme1.xml   → ppt/theme/p1_theme1.xml
  // ppt/slideLayouts/slideLayout1.xml → ppt/slideLayouts/p1_slideLayout1.xml
  // ppt/slideMasters/slideMaster1.xml → ppt/slideMasters/p1_slideMaster1.xml
  // ppt/slides/_rels/slide1.xml.rels  → ppt/slides/_rels/p1_slide1.xml.rels
  function prefixedPath(origPath) {
    // _rels 폴더 안은 파일명만 prefix
    const m = origPath.match(/^(ppt\/[^/]+\/_rels\/)(.+)$/);
    if (m) return m[1] + px + m[2];
    // 나머지는 마지막 세그먼트에 prefix
    const slash = origPath.lastIndexOf('/');
    return origPath.slice(0, slash + 1) + px + origPath.slice(slash + 1);
  }

  // ── XML 내 내부 참조를 prefix 적용 경로로 치환 ──────────────────
  // 대상: Target="..." 속성값 안의 파일명
  // 단, 외부 URL(http)이나 이미 처리된 경로는 스킵
  function applyPrefixToXml(xml) {
    // Target="...slideLayouts/slideLayout1.xml" 형태를 Target="...slideLayouts/p1_slideLayout1.xml" 로
    // Target="...slideMasters/slideMaster1.xml" → "...slideMasters/p1_slideMaster1.xml"
    // Target="...theme/theme1.xml"              → "...theme/p1_theme1.xml"
    // Target="...media/image3.png"              → "...media/p1_image3.png"
    // Target="...slides/slide1.xml"             → "...slides/p1_slide1.xml"
    // Target="../media/image3.png"              → "../media/p1_image3.png"
    // (relative path 패턴도 처리)
    return xml.replace(/<Relationship\b[^>]*\/>/g, tag => {
      if (/TargetMode="External"/.test(tag)) return tag;
      return tag.replace(/Target="([^"]+)"/, (match, target) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return match;
        const slash = target.lastIndexOf('/');
        return `Target="${target.slice(0, slash + 1)}${px}${target.slice(slash + 1)}"`;
      });
    });
  }

  // ── 1단계: ppt/ 파일 전체 복사 (slide, layout, master, theme, media) ──
  // _rels 파일 포함, 텍스트 파일은 내부 참조에 prefix 적용
  const textExts = new Set(['.xml', '.rels', '.vml', '.vmx']);

  for (const [origPath, zipObj] of Object.entries(srcFiles)) {
    const destPath = prefixedPath(origPath);

    const ext = origPath.slice(origPath.lastIndexOf('.')).toLowerCase();
    if (textExts.has(ext)) {
      let xml = await zipObj.async('string');
      xml = applyPrefixToXml(xml);
      baseZip.file(destPath, xml);
    } else {
      // 미디어 파일(png/jpg/gif/svg 등) — 바이너리 그대로
      const bytes = await zipObj.async('uint8array');
      baseZip.file(destPath, bytes);
    }
  }

  // 모든 본문이 활성 레이아웃으로 매핑되면 사용하지 않을 원본 마스터는 목록에 추가하지 않는다.
  const allMapped = activeLayouts && (await ProposalTemplate.slidePaths(srcZip)).every(path => activeLayouts[path]);
  // ── 2단계: presentation.xml 에 master/slide 등록 ────────────────
  // src의 presentation.xml.rels에서 slideMaster 참조 추출
  const masterRids = [];
  srcPresRels.replace(/<Relationship\b[^>]*\/>/g, tag => {
    const type = tag.match(/\bType="([^"]+)"/)?.[1] || '';
    const tgt  = tag.match(/\bTarget="([^"]+)"/)?.[1] || '';
    if (!allMapped && type.includes('/slideMaster') && tgt) {
      // tgt = "slideMasters/slideMaster1.xml" → prefix 적용
      const slash = tgt.lastIndexOf('/');
      const prefixedTgt = slash >= 0
        ? tgt.slice(0, slash + 1) + px + tgt.slice(slash + 1)
        : px + tgt;
      const newRid = `rId${++maxRid}`;
      masterRids.push({ rid: newRid, target: prefixedTgt });
      presRelsXml = presRelsXml.replace('</Relationships>',
        `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="${prefixedTgt}"/></Relationships>`);
      const masterIds = [...presXml.matchAll(/<p:sldMasterId\b[^>]*\bid="(\d+)"/g)].map(m => Number(m[1]));
      const masterId = Math.max(2147483647, ...masterIds) + 1;
      presXml = presXml.replace(/<p:sldMasterIdLst\s*\/>/, '<p:sldMasterIdLst></p:sldMasterIdLst>');
      if (!presXml.includes('</p:sldMasterIdLst>')) presXml = presXml.replace(/(<p:presentation\b[^>]*>)/, '$1<p:sldMasterIdLst></p:sldMasterIdLst>');
      presXml = presXml.replace('</p:sldMasterIdLst>',
        `<p:sldMasterId id="${masterId}" r:id="${newRid}"/></p:sldMasterIdLst>`);
    }
    return tag;
  });

  // ── 3단계: 슬라이드 순서대로 presentation.xml 에 등록 ──────────
  // rels에서 rId → Target 매핑
  const relIdToTarget = {};
  srcPresRels.replace(/<Relationship\b[^>]*\/>/g, tag => {
    const id   = tag.match(/\bId="([^"]+)"/)?.[1];
    const tgt  = tag.match(/\bTarget="([^"]+)"/)?.[1];
    const type = tag.match(/\bType="([^"]+)"/)?.[1] || '';
    if (id && tgt && type.includes('/slide') && !type.includes('Layout') && !type.includes('Master')) {
      relIdToTarget[id] = tgt;
    }
    return tag;
  });

  // sldIdLst 순서로 정렬
  let orderedTargets = [];
  if (srcPresXml) {
    for (const m of [...srcPresXml.matchAll(/<p:sldId\b[^>]+>/g)]) {
      const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
      if (rid && relIdToTarget[rid]) orderedTargets.push(relIdToTarget[rid]);
    }
  }
  if (!orderedTargets.length) orderedTargets = Object.values(relIdToTarget);

  for (const tgt of orderedTargets) {
    // tgt = "slides/slide1.xml"
    const slash = tgt.lastIndexOf('/');
    const prefixedTgt = slash >= 0
      ? tgt.slice(0, slash + 1) + px + tgt.slice(slash + 1)
      : px + tgt;

    const newName = `p${foreignPathMap._partCount}_s${++sc}.xml`;
    // 이미 prefixedPath로 복사됐으므로 rename이 필요하면 이동
    // (slide 파일은 prefixedPath = ppt/slides/p1_slide1.xml 이지만
    //  presentation.xml에는 slides/ 상대경로로 등록해야 함)
    // → 이미 복사된 파일을 그대로 사용, newName은 등록용만

    const activeLayout = activeLayouts?.[masterResolvePath('ppt/presentation.xml', tgt)];
    if (activeLayout) {
      const destSlide = masterResolvePath('ppt/presentation.xml', prefixedTgt);
      await reconnectActiveLayout(baseZip, destSlide, activeLayout);
    }
    // presentation.xml.rels에 slide 등록
    const rid   = `rId${++maxRid}`;
    const sldId = ++maxSldId;
    newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${prefixedTgt}"/>`;
    newIds  += `<p:sldId id="${sldId}" r:id="${rid}"/>`;
    newCt   += `<Override PartName="/ppt/${prefixedTgt}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }

  // master/theme/layout ContentType 등록
  for (const [origPath] of Object.entries(srcFiles)) {
    const destPath = prefixedPath(origPath);
    if (origPath.includes('_rels/') || origPath.includes('/media/')) continue;
    let ct = '';
    if (origPath.match(/slideMasters\/[^/]+\.xml$/))  ct = 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml';
    else if (origPath.match(/slideLayouts\/[^/]+\.xml$/)) ct = 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml';
    else if (origPath.match(/theme\/[^/]+\.xml$/))    ct = 'application/vnd.openxmlformats-officedocument.theme+xml';
    if (ct) newCt += `<Override PartName="/${destPath}" ContentType="${ct}"/>`;
  }

  // 이미지·차트·노트 등 원본 ContentType을 누락하지 않는다.
  const sourceTypes = await srcZip.file('[Content_Types].xml').async('string');
  for (const tag of sourceTypes.match(/<Default\b[^>]*\/>/g) || []) {
    const extension = tag.match(/Extension="([^"]+)"/)?.[1];
    if (extension && !ctXml.includes(`Extension="${extension}"`)) ctXml = ctXml.replace('</Types>', tag + '</Types>');
  }
  for (const tag of sourceTypes.match(/<Override\b[^>]*\/>/g) || []) {
    const path = tag.match(/PartName="\/?([^"]+)"/)?.[1];
    if (!path || !srcFiles[path]) continue;
    const dest = '/' + prefixedPath(path);
    if (!(ctXml + newCt).includes(`PartName="${dest}"`)) newCt += tag.replace(/PartName="[^"]+"/, `PartName="${dest}"`);
  }

  // 카운터 공유
  Object.assign(_counters, { maxRid, maxSldId,
    masterIdx: counters.masterIdx, themeIdx: counters.themeIdx,
    layoutIdx: counters.layoutIdx, sc,
    newRels, newIds, newCt, presXml, presRelsXml, ctXml });
}

// ═══════════════════════════════════════════════════════════════
// 4. generateMenuPpt() — 단일 메뉴 PPT 생성 디스패처
// ═══════════════════════════════════════════════════════════════

/**
 * 메뉴 하나에 해당하는 PPT를 생성하고 {zip, slideCount, mergeStrategy}를 반환
 *
 * @param {object} menu  - ppt_menus row (rule 포함)
 * @param {object} vm    - ProjectViewModel
 * @returns {Promise<{zip: JSZip, slideCount: number, mergeStrategy: string} | null>}
 */
// 실제 제목 토큰만 치환하고, 반복 목차의 번호를 별도 16pt 런으로 붙인다.
// 분산 런/공백 토큰과 XML 특수문자를 지원하며 단락·본문 서식은 유지한다.
function replaceRepeatedSlideTitle(doc, title, page, total, labels = ['[제목]']) {
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const clean = s => String(s).replace(/\s/g, '');
  for (const p of Array.from(doc.getElementsByTagNameNS(A, 'p'))) {
    const runs = Array.from(p.getElementsByTagNameNS(A, 'r'));
    const texts = runs.map(r => r.getElementsByTagNameNS(A, 't')[0]);
    const original = texts.map(t => t?.textContent || '').join('');
    const normalized = clean(original);
    const label = labels.map(clean).find(s => s && normalized.includes(s));
    if (!label) continue;
    const indices = [];
    for (let i = 0; i < original.length; i++) if (!/\s/.test(original[i])) indices.push(i);
    const at = normalized.indexOf(label), start = indices[at], end = indices[at + label.length - 1] + 1;
    let offset = 0, sourceRun = null;
    texts.forEach((t, i) => {
      const text = t?.textContent || '', from = offset, to = from + text.length; offset = to;
      if (!t || to <= start || from >= end) return;
      const first = from <= start;
      if (first) sourceRun = runs[i];
      t.textContent = text.slice(0, Math.max(0, start - from)) + (first ? title : '') + text.slice(Math.max(0, end - from));
    });
    if (total > 1 && sourceRun) {
      const r = doc.createElementNS(A, 'a:r');
      const sourcePr = sourceRun.getElementsByTagNameNS(A, 'rPr')[0];
      const pr = sourcePr ? sourcePr.cloneNode(true) : doc.createElementNS(A, 'a:rPr');
      pr.setAttribute('sz', '1600'); pr.setAttribute('i', '1');
      r.appendChild(pr);
      const t = doc.createElementNS(A, 'a:t'); t.textContent = ` (${page}/${total})`; r.appendChild(t);
      const endPr = Array.from(p.childNodes).find(n => n.localName === 'endParaRPr');
      p.insertBefore(r, endPr || null);
    }
    return true;
  }
  return false;
}

async function generateMenuPpt(menu, vm) {
  if (!menu || !menu.is_enabled) return null;

  const rule = menu.rule;
  if (!rule) {
    console.warn('[PptEngine] rule 없음:', menu.menu_code);
    return null;
  }

  const mergeStrategy = rule.merge_strategy || 'STANDARD';
  let result = null;

  // ── 메뉴 코드별 디스패처 ──
  switch (menu.menu_code) {

    // ── 세부 감리 일정 ─────────────────────────────────────────────
    case 'DETAIL_SCHEDULE':
    case 'SCHEDULE_PLAN':
    case 'ACTION_CONFIRM_STAFF':
    case 'MANPOWER_RATIO':
      result = await ProposalTemplate.build(menu, vm);
      break;

    // ── 사진장표 3종 ───────────────────────────────────────────────
    // 목차 기반: downloadPhotoAssignPptx 내부에서 PptMenuRegistry를 통해
    // 해당 메뉴 코드에 맞는 목차를 자동 구성하므로 별도 주입 불필요.

    // 3.1 단계 감리원의 전문 역량
    case 'AUDITOR_PROFILE':
    case 'PHOTO_ASSIGN':           // 구버전 alias
      result = await downloadPhotoAssignPptx(null, { returnZip: true, menuCode: 'AUDITOR_PROFILE' });
      break;

    // 3.2 핵심기술 점검팀의 전문 역량
    case 'CORE_EXPERT_PROFILE':
      result = await downloadPhotoAssignPptx(null, { returnZip: true, menuCode: 'CORE_EXPERT_PROFILE' });
      break;

    // 3.3 필수기술·보안·테스트팀 전문 역량
    case 'EXPERT_PROFILE':
      result = await downloadPhotoAssignPptx(null, { returnZip: true, menuCode: 'EXPERT_PROFILE' });
      break;

    // ── 감리원/전문가 실적·경력·자격 장표 (플레이스홀더 방식) ──────
    // 3.4 감리원별 유사 감리 실적 및 경력·자격 (1장=2명)
    case 'AUDITOR_HISTORY': {
      const _tpls = Array.isArray(menu.templates) ? menu.templates : [];
      const _tpl  = _tpls.find(t => t.pptx_b64_key) || null;
      console.log('[PptEngine] AUDITOR_HISTORY templates:', _tpls.length, '개, 템플릿 b64:', _tpl ? '있음(길이:'+_tpl.pptx_b64_key.length+')' : 'null');
      const _title_AH = [menu.menu_number, menu.menu_name].filter(Boolean).join(' ');
      result = await buildHistoryPptx({
        returnZip: true,
        groupFilter: 'AUDITOR',
        perPage: 2,
        templateB64: _tpl ? _tpl.pptx_b64_key : null,
        menuTitle: _title_AH,
      });
      break;
    }

    // 3.5 전문가별 유사 감리 실적 및 경력·자격 (1장=4명)
    case 'EXPERT_HISTORY': {
      const _tpls = Array.isArray(menu.templates) ? menu.templates : [];
      const _tpl  = _tpls.find(t => t.pptx_b64_key) || null;
      console.log('[PptEngine] EXPERT_HISTORY templates:', _tpls.length, '개, 템플릿 b64:', _tpl ? '있음(길이:'+_tpl.pptx_b64_key.length+')' : 'null');
      const _title_EH = [menu.menu_number, menu.menu_name].filter(Boolean).join(' ');
      result = await buildHistoryPptx({
        returnZip: true,
        groupFilter: 'EXPERT',
        perPage: 4,
        templateB64: _tpl ? _tpl.pptx_b64_key : null,
        menuTitle: _title_EH,
      });
      break;
    }

    // ── 기존 표장표 (감리원/전문가 통합 표) ───────────────────────
    case 'MANPOWER_MD':
      throw new Error('공수표 전용 생성기는 아직 연결되지 않았습니다. 인력 실적표로 대체하지 않습니다.');
    case 'ASSIGN_TABLE': { // 기존 인력 소개 표만 명시적으로 지원
      const _tpls = Array.isArray(menu.templates) ? menu.templates : [];
      const _tpl  = _tpls.find(t => t.pptx_b64_key) || null;
      console.log('[PptEngine] MANPOWER_MD templates:', _tpls.length, '개, 템플릿 b64:', _tpl ? '있음(길이:'+_tpl.pptx_b64_key.length+')' : 'null');
      const _title_MM = [menu.menu_number, menu.menu_name].filter(Boolean).join(' ');
      result = await downloadAssignPptx(null, { returnZip: true, templateB64: _tpl ? _tpl.pptx_b64_key : null, menuTitle: _title_MM });
      break;
    }

    // 단계감리원 전용: 인력 DB 교육정보 / 안전·보건 담당자 이름
    case 'CONTINUING_EDU':
    case 'SAFETY_HEALTH':
      result = await ProposalTemplate.build(menu, vm);
      break;

    // ── 주관기관 요청사항 준수 여부 (요약표) ──────────────────────
    case 'SUMMARY_TABLE':         // 구버전 alias
    case 'COMPLIANCE':
      result = await ProposalTemplate.build(menu, vm);
      break;

    default:
      result = await ProposalTemplate.build(menu, vm);
      break;

  }  // end switch

  if (!result || !result.zip) return null;

  // 슬라이드 수 계산
  let slideCount = 0;
  try {
    const presXml = await result.zip.file('ppt/presentation.xml').async('string');
    slideCount = (presXml.match(/<p:sldId\b/g) || []).length;
  } catch (_) { slideCount = 1; }

  return { ...result, slideCount, mergeStrategy: result.mergeStrategy || mergeStrategy };
}

// ═══════════════════════════════════════════════════════════════
// 5. generateProposalPpt() — 전체 메뉴 Composer
// ═══════════════════════════════════════════════════════════════

/**
 * 활성화된 메뉴를 sort_order 순으로 순회하며 각 PPT를 생성하고
 * mergePresentationZips()로 하나의 최종 PPTX를 합본한다.
 *
 * 마스터 템플릿이 활성화되어 있으면 해당 PPTX를 parts[0]에 삽입하여
 * 모든 슬라이드가 동일한 slideMaster/Theme/Layout을 참조하게 한다.
 *
 * @param {object} vm - ProjectViewModel
 * @returns {Promise<JSZip>} 최종 합본 JSZip 객체
 */
// 보고서에만 적용하는 목차 경로. 원본 메뉴 번호와 PPT 생성/합본 순서는 변경하지 않는다.
function proposalReportLocation(menu, menus = []) {
  const clean = value => String(value ?? '').trim().replace(/[.．]+$/, '');
  const number = clean(menu.menu_number);
  const ancestors = [], visited = new Set([String(menu.id)]);
  let current = menu;
  while (current) {
    const parent = menus.find(m => current.parent_id != null && String(m.id) === String(current.parent_id))
      || menus.find(m => (m.children || []).some(child => child === current || (child.id != null && String(child.id) === String(current.id))));
    if (!parent || visited.has(String(parent.id))) break;
    visited.add(String(parent.id)); ancestors.unshift(parent); current = parent;
  }
  const section = ancestors.find(m => /^[가-힣]$/.test(clean(m.menu_number))) || ancestors[0];
  const prefix = number.match(/^([가-힣])[.．\s]/)?.[1] || '';
  const sectionNumber = section ? clean(section.menu_number) : prefix;
  const fullNumber = sectionNumber && /^[가-힣]$/.test(sectionNumber) && number && !prefix
    ? `${sectionNumber}.${number}` : number;
  function unnumbered(name, prefixes) {
    let result = String(name || '').trim();
    for (const value of prefixes.filter(Boolean)) {
      if (result.startsWith(value) && /^[.．\s]/.test(result.slice(value.length))) {
        result = result.slice(value.length).replace(/^[.．\s]+/, ''); break;
      }
    }
    return result;
  }
  return {
    id: menu.id, code: menu.menu_code,
    number: fullNumber,
    name: unnumbered(menu.menu_name, [fullNumber, number]),
    sectionKey: section ? `menu:${section.id ?? section.menu_code}` : prefix ? `prefix:${prefix}` : 'ungrouped',
    sectionNumber,
    sectionName: section ? unnumbered(section.menu_name, [sectionNumber]) : prefix ? '' : '기타 목차',
  };
}

async function generateProposalPpt(vm, selectedCodes = null) {
  const report = { entries: [], warnings: [], status: '생성 중' };
  let registry;
  try { registry = await PptMenuRegistry.load(true); }
  catch (error) { report.status = '생성 실패'; report.warnings.push(error.message); renderProposalReport(report); throw error; }
  const enabledMenus = registry.list.filter(m => m.is_enabled && !(m.children || []).length && (!selectedCodes || selectedCodes.includes(m.menu_code)))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  report.total = enabledMenus.length;
  renderProposalReport(report);
  if (!enabledMenus.length) throw new Error('활성화된 본문 목차가 없습니다.');
  let masterPart = null;
  try {
    const response = await fetch('/api/ppt-menus/master-templates/active', { cache: 'no-store' });
    if (!response.ok) throw new Error('마스터 조회 실패');
    const json = await response.json();
    if (!json.ok) throw new Error(json.error || '마스터 조회 실패');
    if (json.data?.pptx_b64) {
      const prepared = await prepareActiveMaster(await JSZip.loadAsync(json.data.pptx_b64, { base64: true }), vm);
      masterPart = { ...prepared, mergeStrategy: 'MASTER_ONLY' };
      report.warnings.push(...prepared.warnings);
    }
    else report.warnings.push('활성 마스터가 없습니다. 각 템플릿의 디자인을 유지합니다.');
  } catch (error) { report.warnings.push('마스터 로드 실패: ' + error.message); }
  const parts = [];
  for (const menu of enabledMenus) {
    const entry = { ...proposalReportLocation(menu, registry.list), status: '생성 중', slides: 0, warnings: [] };
    report.entries.push(entry);
    renderProposalReport(report);
    try {
      if (!menu.rule) throw new Error('생성 규칙이 없습니다.');
      showAutoAlert(`본문 생성 중: ${report.entries.length}/${enabledMenus.length}`, false);
      const part = await generateMenuPpt(menu, vm);
      if (!part?.zip || !part.slideCount) throw new Error('생성된 슬라이드가 없습니다. 인력·데이터·템플릿을 확인하세요.');
      if (masterPart) await planActiveLayouts(part, menu, registry.list, masterPart);
      entry.warnings = part.warnings || [];
      entry.slides = part.slideCount;
      entry.status = entry.warnings.length ? '검토 필요' : '생성됨';
      parts.push(part);
    } catch (error) {
      entry.status = '생성 실패';
      entry.warnings.push(error.message);
    }
    renderProposalReport(report);
  }
  const failed = report.entries.some(e => e.status === '생성 실패');
  report.status = !parts.length ? '생성 실패' : failed ? '부분 생성' : '검토 필요';
  // 파일 생성은 제출 승인과 다르다. 시각 검수 전에는 완료/충족으로 단정하지 않는다.
  report.warnings.push('다운로드는 초안입니다. 고정 문구·사진·표 넘침·요건 근거를 최종 검수하세요.');
  renderProposalReport(report);
  if (!parts.length) throw new Error('모든 목차 생성에 실패했습니다. 결과 목록을 확인하세요.');
  if (masterPart) parts.unshift(masterPart);
  try {
    const zip = await mergePresentationZips(parts);
    zip.proposalReport = report;
    return zip;
  } catch (error) {
    report.status = '합본 실패'; report.warnings.push(error.message); renderProposalReport(report); throw error;
  }
}

function renderProposalReport(report) {
  const root = document.getElementById('proposal-generation-report');
  if (!root) return;
  root.hidden = false;
  const openStates = new Map();
  if (root._proposalReport === report) {
    for (const group of root.querySelectorAll('details[data-section-key]')) openStates.set(group.getAttribute('data-section-key'), group.open);
  }
  root._proposalReport = report;
  root.replaceChildren();
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.setAttribute('class', className);
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const entries = report.entries || [];
  const counts = { '생성됨': 0, '검토 필요': 0, '생성 실패': 0, '생성 중': 0 };
  entries.forEach(e => { if (Object.hasOwn(counts, e.status)) counts[e.status]++; });
  const stateClass = status => ({ '생성됨': 'success', '검토 필요': 'review', '생성 실패': 'failure', '생성 중': 'running' })[status] || 'running';
  const header = el('header', 'proposal-report-header');
  const title = el('h4', 'proposal-report-title', `본문 PPT: ${report.status}`);
  header.appendChild(title);
  const completed = entries.length - counts['생성 중'];
  const progress = el('p', 'proposal-report-progress', `${completed} / ${report.total ?? entries.length}개 목차 처리 · ${entries.reduce((sum, e) => sum + (Number(e.slides) || 0), 0)}장 생성`);
  progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
  header.appendChild(progress);
  const stats = el('ul', 'proposal-report-stats');
  for (const [status, count] of Object.entries(counts)) {
    stats.appendChild(el('li', `proposal-report-badge proposal-report-${stateClass(status)}`, `${status} ${count}`));
  }
  header.appendChild(stats); root.appendChild(header);
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.sectionKey || 'ungrouped';
    if (!groups.has(key)) groups.set(key, { number: entry.sectionNumber || '', name: entry.sectionName || (key === 'ungrouped' ? '기타 목차' : ''), entries: [] });
    groups.get(key).entries.push(entry);
  }
  let groupIndex = 0;
  for (const [key, group] of groups) {
    const section = el('details', 'proposal-report-section');
    section.setAttribute('data-section-key', key);
    section.open = openStates.has(key) ? openStates.get(key) : true;
    const summary = el('summary', 'proposal-report-section-heading');
    summary.appendChild(el('span', 'proposal-report-section-title', [group.number ? `${group.number}.` : '', group.name].filter(Boolean).join(' ')));
    const failures = group.entries.filter(e => e.status === '생성 실패').length;
    const reviews = group.entries.filter(e => e.status === '검토 필요').length;
    summary.appendChild(el('span', 'proposal-report-section-count', `${group.entries.length}개 목차 · ${group.entries.reduce((sum, e) => sum + (Number(e.slides) || 0), 0)}장${failures ? ` · 실패 ${failures}` : ''}${reviews ? ` · 검토 ${reviews}` : ''}`));
    section.appendChild(summary);
    const list = el('ol', 'proposal-report-entries');
    group.entries.forEach((entry, index) => {
      const item = el('li', `proposal-report-entry proposal-report-entry-${stateClass(entry.status)}`);
      const heading = el('header', 'proposal-report-entry-heading');
      const name = el('h5', 'proposal-report-entry-title');
      name.setAttribute('id', `proposal-report-entry-${groupIndex}-${index}`);
      name.appendChild(el('span', 'proposal-report-number', entry.number || '번호 미등록'));
      name.appendChild(el('span', 'proposal-report-name', entry.name || entry.code || '제목 미등록'));
      heading.appendChild(name);
      const meta = el('div', 'proposal-report-entry-meta');
      meta.appendChild(el('span', `proposal-report-badge proposal-report-${stateClass(entry.status)}`, entry.status));
      if (entry.slides) meta.appendChild(el('span', 'proposal-report-slides', `${entry.slides}장`));
      heading.appendChild(meta); item.appendChild(heading);
      const warnings = [...new Set(entry.warnings || [])];
      if (warnings.length) {
        const notes = el('ul', 'proposal-report-warnings');
        notes.setAttribute('aria-labelledby', name.getAttribute('id'));
        for (const warning of warnings) notes.appendChild(el('li', '', warning));
        item.appendChild(notes);
      }
      list.appendChild(item);
    });
    section.appendChild(list); root.appendChild(section); groupIndex++;
  }
  if ((report.warnings || []).length) {
    const notes = el('aside', 'proposal-report-notes');
    notes.appendChild(el('h5', '', '공통 안내'));
    const list = el('ul', 'proposal-report-warnings');
    for (const warning of [...new Set(report.warnings)]) list.appendChild(el('li', '', warning));
    notes.appendChild(list); root.appendChild(notes);
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. downloadProposalPpt() — 최종 다운로드 래퍼
//    (기존 downloadAllPptx 대체)
// ═══════════════════════════════════════════════════════════════

async function downloadProposalPpt(btn, selectedCodes = null) {
  if (typeof PptxGenJS === 'undefined' || typeof JSZip === 'undefined') {
    alert('PPT 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return;
  }
  setBtnState(btn, true);
  try {
    const vm = buildProjectViewModel(parsedData);
    const finalZip = await generateProposalPpt(vm, selectedCodes);

    // 경고는 결과 보고서에 남기되 생성된 장표의 다운로드를 막지 않는다.
    const blob = await finalZip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeName = value => String(value ?? '').replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '[자동화][본문] ' + safeName(parsedData.clientOrg) + '_' + safeName(parsedData.projectTitle) + '.pptx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showAutoAlert('검토용 PPT를 다운로드했습니다. 생성 결과의 누락·검토 항목을 확인하세요.', false);
  } catch (e) {
    showAutoAlert('❌ 생성 실패: ' + e.message, false);
    console.error(e);
  } finally {
    setBtnState(btn, false);
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. 메뉴 캐시 강제 재로드 유틸
// ═══════════════════════════════════════════════════════════════

function invalidatePptMenuCache() {
  PptMenuRegistry.invalidate();
}
