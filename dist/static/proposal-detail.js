/* ============================================================
   proposal-detail.js  — /proposals/:id 전용 클라이언트 스크립트
   parsedData, activeHL, correctionMode, gradeOverrides 는
   인라인 <script>에서 먼저 선언됨
   ============================================================ */

// ── 인력 모음 표 복사 ────────────────────────────────────────
function copyPersonnelTable() {
  const { portalOrder, personFieldMap } = parsedData
  const groups = [
    { role: '감리원',   names: portalOrder.filter(p => p.group === '감리원팀').map(p => p.name) },
    { role: '핵심기술', names: portalOrder.filter(p => p.group === '전문가' && !p.expertSubGroup.includes('필수') && !p.expertSubGroup.includes('보안')).map(p => p.name) },
    { role: '필수기술', names: portalOrder.filter(p => p.expertSubGroup.includes('필수')).map(p => p.name) },
    { role: '보안진단', names: portalOrder.filter(p => p.expertSubGroup.includes('보안')).map(p => p.name) },
    { role: '테스터',   names: portalOrder.filter(p => p.group === '테스터').map(p => p.name) },
  ]
  const wrap = document.getElementById('personnel-table-wrap')
  if (!wrap) return
  let rows = ''
  groups.forEach(g => {
    g.names.forEach(name => {
      const field = personFieldMap[name] || ''
      rows += '<tr><td style="border:1px solid #ccc;padding:5px 8px">' + g.role + '</td><td style="border:1px solid #ccc;padding:5px 8px">' + field + '</td><td style="border:1px solid #ccc;padding:5px 8px">' + spaceOutName(name) + '</td></tr>'
    })
  })
  wrap.innerHTML = '<table id="personnel-summary-table" style="border-collapse:collapse;width:100%;font-size:13px;font-family:\'Malgun Gothic\',sans-serif"><thead><tr><th style="border:1px solid #ccc;padding:5px 8px;background:#1a2e4a;color:#fff">역할</th><th style="border:1px solid #ccc;padding:5px 8px;background:#1a2e4a;color:#fff">분야</th><th style="border:1px solid #ccc;padding:5px 8px;background:#1a2e4a;color:#fff">이름</th></tr></thead><tbody>' + rows + '</tbody></table>'
  document.getElementById('personnelTableModal').style.display = 'flex'
}
function closePersonnelTableModal() {
  document.getElementById('personnelTableModal').style.display = 'none'
}
function spaceOutName(name) { return (name || '').split('').join(' ') }
async function copyPersonnelSummaryTable() {
  const table = document.getElementById('personnel-summary-table')
  if (!table) { alert('표를 먼저 열어주세요.'); return }
  const html = table.outerHTML
  const text = Array.from(table.rows).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()).join('\t')).join('\n')
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
      alert('✅ 표가 클립보드에 복사되었습니다.')
      return
    }
  } catch (e) {}
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); alert('✅ 복사되었습니다.'); return }
  } catch (e) {}
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px'
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  alert('✅ 복사되었습니다.')
}

// ── 하이라이트 / 강조 제어 ─────────────────────────────────
function highlightByName(name, field) {
  document.querySelectorAll('.person-chip').forEach(c => { c.style.background = ''; c.style.borderColor = 'transparent' })
  document.querySelectorAll('.pool-person').forEach(c => c.style.background = '')
  document.querySelectorAll('.person-chip[data-name="' + CSS.escape(name) + '"]').forEach(c => {
    c.style.background = '#fff9c4'; c.style.borderColor = '#f9a825'
  })
  document.querySelectorAll('.pool-person[data-name="' + CSS.escape(name) + '"]').forEach(c => {
    c.style.background = '#fff9c4'
  })
  if (field) {
    document.querySelectorAll('.person-chip[data-field="' + CSS.escape(field) + '"]').forEach(c => {
      if (c.dataset.name !== name) { c.style.background = '#e8f5e9'; c.style.borderColor = '#43a047' }
    })
  }
}

function clearHighlights() {
  document.querySelectorAll('.person-chip').forEach(c => { c.style.background = ''; c.style.borderColor = 'transparent' })
  document.querySelectorAll('.pool-person').forEach(c => c.style.background = '')
  document.querySelectorAll('.mds-num').forEach(n => { n.style.background = ''; n.style.color = ''; n.style.borderRadius = ''; n.style.padding = '' })
  activeHL = null; correctionMode = null
}

function highlightCorrections(type) {
  if (correctionMode === type) { clearHighlights(); return }
  clearHighlights(); correctionMode = type
  const colorMap = { pre: '#1565c0', audit: '#6a1b9a', post: '#c62828' }
  document.querySelectorAll('.mds-num[data-k="' + type + '"]').forEach(n => {
    if ((parseInt(n.textContent) || 0) > 0) {
      n.style.background = colorMap[type]; n.style.color = '#fff'
      n.style.borderRadius = '3px'; n.style.padding = '0 4px'
    }
  })
}

// chip 클릭 → 하이라이트
document.addEventListener('click', function (e) {
  const chip = e.target.closest('.person-chip')
  if (chip) {
    e.stopPropagation()
    const name = chip.dataset.name, field = chip.dataset.field
    if (activeHL && activeHL.name === name) { clearHighlights(); return }
    activeHL = { name, field }; highlightByName(name, field); return
  }
  const pool = e.target.closest('.pool-person')
  if (pool) {
    e.stopPropagation()
    const name = pool.dataset.name, field = pool.dataset.field
    if (activeHL && activeHL.name === name) { clearHighlights(); return }
    activeHL = { name, field }; highlightByName(name, field); return
  }
  if (!e.target.closest('#schedule-section') && !e.target.closest('[id$="Modal"]') && activeHL) { clearHighlights() }
})

// 전문가 셀 더블클릭 → breakdown 모달
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.people-cell[data-ci^="people-expert-"]').forEach(td => {
    td.style.cursor = 'zoom-in'
    td.addEventListener('dblclick', function (e) {
      if (e.target.closest('.person-chip')) return
      const si = parseInt(this.dataset.ci.split('-').pop())
      openExpertBreakdown(si)
    })
  })
})

function openExpertBreakdown(si) {
  const stage = parsedData.stages[si]
  if (!stage || !stage['전문가']) return
  const people = stage['전문가'].people
  document.getElementById('ebTitle').textContent = stage.stage + ' · 전문가 분류별 인력'
  document.getElementById('ebSub').textContent = '총 ' + people.length + '명'
  const classifyFn = nm => {
    const info = parsedData.personGradeMap[nm] || {}
    if (info.group === '테스터') return 'tester'
    const sub = info.expertSubGroup || ''
    if (sub.includes('보안')) return 'security'
    if (sub.includes('필수')) return 'required'
    return 'core'
  }
  const buckets = { core: [], required: [], security: [], tester: [] }
  people.forEach(p => buckets[classifyFn(p.name)].push(p))
  const groups = [{ key: 'core', label: '🟢 핵심기술' }, { key: 'required', label: '🟩 필수기술' }, { key: 'security', label: '🔴 보안진단' }, { key: 'tester', label: '🟣 테스터' }]
  document.getElementById('ebBody').innerHTML = groups.map(g => {
    const items = buckets[g.key].map(p => {
      return '<span class="person-chip" data-name="' + p.name + '" data-field="' + (p.field || '') + '" data-stage="' + si + '" data-pre="' + p.pre + '" data-audit="' + p.audit + '" data-post="' + p.post + '" style="display:inline-flex;flex-direction:column;gap:1px;border:1px solid #e0e0e0;border-radius:5px;padding:4px 9px;cursor:pointer;transition:all .15s"><span class="chip-name" style="font-weight:700;color:#1a2e4a;font-size:13px">' + p.name + '</span><span style="color:#2e7d32;font-size:11.5px">' + (p.field || (parsedData.personFieldMap[p.name] || '(분야 미상)')) + '</span><span style="color:#999;font-size:11px">' + p.pre + ':' + p.audit + ':' + p.post + '</span></span>'
    }).join('')
    return '<div style="margin-bottom:12px"><div style="font-size:13px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px">' + g.label + '<span style="font-weight:400;color:#888;font-size:12px">' + buckets[g.key].length + '명</span></div><div style="display:flex;flex-wrap:wrap;gap:6px">' + (buckets[g.key].length ? items : '<span style="color:#bbb;font-size:12px">없음</span>') + '</div></div>'
  }).join('')
  document.getElementById('expertBreakdownModal').style.display = 'flex'
}
function closeExpertBreakdown() { document.getElementById('expertBreakdownModal').style.display = 'none' }

// ── 자동화 PPT 모달 ─────────────────────────────────────────
function openAutoModal() {
  if (typeof PptxGenJS === 'undefined') {
    alert('PPT 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.')
    return
  }
  // 모달 열 때마다 목차 목록 초기화 → renderPhotoAssignRows에서 기본값 재구성
  _pawTocList = []
  document.getElementById('autoModal').style.display = 'flex'
  renderPhotoAssignRows()
}
function closeAutoModal() { document.getElementById('autoModal').style.display = 'none' }

// ── 사진장표 분류 체크리스트 ────────────────────────────────
const PHOTO_CATS = [
  { key: 'audit',    label: '👤 감리원',    grpFilter: p => p.group === '감리원팀' },
  { key: 'core',     label: '🟢 핵심기술',  grpFilter: p => p.group === '전문가' && !p.expertSubGroup.includes('필수') && !p.expertSubGroup.includes('보안') },
  { key: 'required', label: '🟩 필수기술',  grpFilter: p => p.expertSubGroup.includes('필수') },
  { key: 'security', label: '🔴 보안진단',  grpFilter: p => p.expertSubGroup.includes('보안') },
  { key: 'tester',   label: '🟣 테스터',    grpFilter: p => p.group === '테스터' },
]

// 인원수에 맞는 기본 장표 크기 추천 (인원 이상인 가장 작은 규격)
function suggestSheetSize(count) {
  for (const size of [2, 4, 6, 9]) if (count <= size) return size
  return 9
}

// 각 분류의 인원 목록을 parsedData.portalOrder에서 추출
function buildPhotoAssignCache() {
  const { portalOrder } = parsedData || {}
  if (!portalOrder) return null
  const cache = {}
  PHOTO_CATS.forEach(c => { cache[c.key] = portalOrder.filter(c.grpFilter) })
  return cache
}

// ── 목차 기반 사진장표 UI ───────────────────────────────────────
// DB에 등록된 *_PROFILE 메뉴 목록을 목차로 사용.
// 각 목차(행) = 제목(고정, DB menu_number+menu_name) | 템플릿 크기 | 포함할 팀 체크박스
// 각 목차는 완전히 독립적으로 동작.

// 메뉴 코드 → 기본 팀 키 매핑
const PAW_MENU_DEFAULT_CATS = {
  AUDITOR_PROFILE:      ['audit'],
  CORE_EXPERT_PROFILE:  ['core'],
  EXPERT_PROFILE:       ['required', 'security', 'tester'],
}

// 메뉴 코드 → 고정 템플릿 크기 (지정 시 인원 수 추천 무시)
const PAW_MENU_FIXED_SHEET = {
  AUDITOR_PROFILE: 2,
}

// 내부 목차 데이터 저장소
// [{ id, menuCode, title, sheetSize, cats: ['audit', ...] }, ...]
let _pawTocList = []

// 목차 행 HTML 한 줄 생성
function _pawTocRowHtml(toc, cache, activeCats) {
  const catBoxes = activeCats.map(c => {
    const count = (cache[c.key] || []).length
    const checked = toc.cats.includes(c.key) ? ' checked' : ''
    const shortLabel = c.label.replace(/^\S+\s/, '')
    return `<label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;white-space:nowrap">
      <input type="checkbox" class="paw-toc-cat" data-toc="${toc.id}" data-cat="${c.key}"${checked}
        onchange="onPawTocCatChange(${toc.id})">
      <span>${shortLabel}</span><span style="color:#aaa;font-size:11px">(${count})</span>
    </label>`
  }).join('')

  const sizeOpts = [2, 4, 6, 9].map(n =>
    `<option value="${n}"${n === toc.sheetSize ? ' selected' : ''}>${n}인</option>`
  ).join('')

  return `<div class="paw-toc-row" data-toc="${toc.id}"
    style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f9fafb;border-radius:6px;flex-wrap:wrap;border:1px solid #e8eaf0">
    <span style="font-size:13px;font-weight:700;color:#1a2e4a;min-width:0;flex-shrink:0;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      title="${toc.title.replace(/"/g, '&quot;')}">${toc.title || '(제목 없음)'}</span>
    <span style="font-size:12px;color:#555;white-space:nowrap">템플릿
      <select class="paw-toc-sheet" data-toc="${toc.id}"
        style="margin:0 4px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;font-size:12px"
        onchange="onPawTocSheetChange(${toc.id}, this.value)">
        ${sizeOpts}
      </select>
    </span>
    <span style="font-size:12px;color:#555;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">
      ${catBoxes}
    </span>
  </div>`
}

// 목차 UI 전체 렌더링 (비동기: PptMenuRegistry 로드 후 실행)
function renderPhotoAssignRows() {
  const wrap = document.getElementById('photo-assign-rows')
  if (!wrap) return
  if (!parsedData || !parsedData.portalOrder) {
    wrap.innerHTML = '<span style="color:#aaa;font-size:13px">인력 데이터가 없습니다.</span>'
    return
  }
  const cache = buildPhotoAssignCache()
  const activeCats = PHOTO_CATS.filter(c => (cache[c.key] || []).length > 0)
  if (!activeCats.length) {
    wrap.innerHTML = '<span style="color:#aaa;font-size:13px">인력 데이터가 없습니다.</span>'
    return
  }

  wrap.innerHTML = '<span style="color:#aaa;font-size:13px">목차 정보 불러오는 중...</span>'

  // PptMenuRegistry에서 *_PROFILE 메뉴 목록 로드 → 목차 구성
  PptMenuRegistry.load().then(registry => {
    const profileCodes = ['AUDITOR_PROFILE', 'CORE_EXPERT_PROFILE', 'EXPERT_PROFILE']
    const profileMenus = profileCodes
      .map(code => registry.byCode[code])
      .filter(Boolean)
      .filter(m => m.is_enabled !== false)  // 비활성 목차 제외

    _pawTocList = profileMenus.map((m, i) => {
      const defaultCats = (PAW_MENU_DEFAULT_CATS[m.menu_code] || [])
        .filter(k => activeCats.some(c => c.key === k))   // 실제 인원 있는 팀만
      const totalCount = defaultCats.reduce((s, k) => s + (cache[k] || []).length, 0)
      const title = [m.menu_number, m.menu_name].filter(Boolean).join(' ')
      const fixedSheet = PAW_MENU_FIXED_SHEET[m.menu_code]
      return {
        id: i + 1,
        menuCode: m.menu_code,
        title,
        sheetSize: fixedSheet !== undefined ? fixedSheet : suggestSheetSize(Math.max(totalCount, 1)),
        cats: defaultCats,
      }
    })

    // PROFILE 메뉴가 하나도 없으면 하드코딩 fallback
    if (!_pawTocList.length) {
      let seq = 0
      if (cache.audit && cache.audit.length)
        _pawTocList.push({ id: ++seq, menuCode: 'AUDITOR_PROFILE',     title: '3.1 감리원 전문역량',     sheetSize: 2, cats: ['audit'] })
      const expKeys = activeCats.filter(c => c.key !== 'audit').map(c => c.key)
      if (expKeys.length) {
        const tot = expKeys.reduce((s, k) => s + cache[k].length, 0)
        _pawTocList.push({ id: ++seq, menuCode: 'EXPERT_PROFILE', title: '전문역량', sheetSize: suggestSheetSize(tot), cats: expKeys })
      }
    }

    _renderPawTocDom(cache, activeCats)
  }).catch(() => {
    // Registry 로드 실패 시 빈 안내
    wrap.innerHTML = '<span style="color:#e53935;font-size:13px">목차 정보 로드 실패. 페이지를 새로고침해주세요.</span>'
  })
}

// DOM만 다시 그리기 (데이터 보존)
function _renderPawTocDom(cache, activeCats) {
  const wrap = document.getElementById('photo-assign-rows')
  if (!wrap) return
  const rowsHtml = _pawTocList.map(toc => _pawTocRowHtml(toc, cache, activeCats)).join('')
  wrap.innerHTML = rowsHtml || '<span style="color:#aaa;font-size:13px">등록된 사진장표 목차가 없습니다.</span>'
}

// 목차 템플릿 크기 변경 핸들러
function onPawTocSheetChange(id, val) {
  const toc = _pawTocList.find(t => t.id === id)
  if (toc) toc.sheetSize = parseInt(val, 10)
}

// 목차 팀 체크박스 변경 핸들러 — 인원 합계에 맞게 템플릿 크기 자동 추천
function onPawTocCatChange(id) {
  const toc = _pawTocList.find(t => t.id === id)
  if (!toc) return
  const row = document.querySelector(`.paw-toc-row[data-toc="${id}"]`)
  if (!row) return
  // 체크된 팀 목록 갱신
  toc.cats = Array.from(row.querySelectorAll('.paw-toc-cat:checked')).map(cb => cb.dataset.cat)
  // 인원 합계 계산 → 템플릿 크기 자동 추천
  const cache = buildPhotoAssignCache()
  const total = toc.cats.reduce((s, k) => s + (cache && cache[k] ? cache[k].length : 0), 0)
  const suggested = suggestSheetSize(Math.max(total, 1))
  toc.sheetSize = suggested
  const sheetSel = row.querySelector('.paw-toc-sheet')
  if (sheetSel) sheetSel.value = String(suggested)
}

// 목차 설정 읽기 — 목차 배열 반환
// 반환: [{ title, sheetSize, catKeys }, ...]
function readPhotoAssignConfig() {
  // DOM에서 최신 템플릿 크기·팀 체크 동기화
  document.querySelectorAll('.paw-toc-row').forEach(row => {
    const id = parseInt(row.dataset.toc, 10)
    const toc = _pawTocList.find(t => t.id === id)
    if (!toc) return
    const sheetEl = row.querySelector('.paw-toc-sheet')
    if (sheetEl) toc.sheetSize = parseInt(sheetEl.value, 10)
    toc.cats = Array.from(row.querySelectorAll('.paw-toc-cat:checked')).map(cb => cb.dataset.cat)
  })
  return _pawTocList
    .filter(toc => toc.cats.length > 0)   // 팀 미선택 목차 제외
    .map(toc => ({ menuCode: toc.menuCode, title: toc.title, sheetSize: toc.sheetSize, catKeys: toc.cats }))
}

function showAutoAlert(msg, ok) {
  const el = document.getElementById('autoModalAlertBox')
  el.style.display = ''; el.textContent = msg
  el.style.background = ok ? '#e8f5e9' : '#ffebee'
  el.style.border = '1px solid ' + (ok ? '#43a047' : '#e53935')
  el.style.color = ok ? '#1b5e20' : '#b71c1c'
}

function setBtnState(btn, loading) {
  if (!btn) return
  if (loading) { btn._orig = btn.textContent; btn.disabled = true; btn.textContent = '⏳ 생성 중...' }
  else { btn.disabled = false; btn.textContent = btn._orig || btn.textContent }
}

function getExtraSet() {
  return new Set(Array.from(document.querySelectorAll('.st-extra-stage-cb:checked')).map(cb => cb.value))
}

// ── 공통 유틸 ───────────────────────────────────────────────
function xmlEscape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;') }
function extractDates(t) { return ((t || '').match(/\d{4}\.\d{2}\.\d{2}/g) || []) }
function shiftDateStr(ds, delta) {
  const m = (ds || '').match(/(\d{4})\.(\d{2})\.(\d{2})/)
  if (!m) return ds || ''
  const d = new Date(+m[1], +m[2] - 1, +m[3]); d.setDate(d.getDate() + delta)
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0')
}
function fmtCertNo(text) {
  const raw = (text || '').trim()
  const m = raw.match(/^(\S+)\s+(제\s*\d+\s*호)$/)
  if (m) return m[1] + '<br>' + m[2].replace(/\s+/g, '')
  return raw
}
function getEffectiveGrade(name) {
  if (gradeOverrides[name]) return gradeOverrides[name]
  const info = parsedData.personGradeMap[name] || {}
  if (info.grade === '수석감리원') return '수석감리원'
  if (info.grade === '감리원') return '감리원'
  return '전문가'
}

// ── 세부감리일정 1 PPT ──────────────────────────────────────
function computeDetailSchedule1Rows() {
  const { stages } = parsedData
  return stages.map(s => {
    const ae = s['감리원'] || { pre: 0, audit: 0, post: 0, total: 0 }
    const dates = extractDates(s.date)
    const startD = dates[0] || '', endD = dates[1] || dates[0] || ''
    const isCompact = ['상주감리', '상시감리', '검수지원'].some(k => s.stage.includes(k))
    const preMD = ae.pre || 0, auditMD = ae.audit || 0, postMD = ae.post || 0
    const subtotalMD = ae.total || (preMD + auditMD + postMD)
    const subtotalDays = s.days || 0
    const compactLabel = s.stage.includes('검수') ? '검수지원' : '상주/상시 감리'
    const compactDate = startD && endD ? (startD + ' ~ ' + endD) : (s.date || '')
    return { stage: s.stage, startD, endD, days: s.days || 0, preMD, auditMD, postMD, subtotalMD, subtotalDays, isCompact, compactLabel, compactDate }
  })
}

async function downloadDetailSchedule1Pptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return null }
  setBtnState(btn, true)
  try {
    const stageRows = computeDetailSchedule1Rows()
    if (!stageRows.length) { alert('일정 데이터가 없습니다.'); return null }
    const extraSet = getExtraSet()
    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'
    const FONT_BOLD = 'KoPub돋움체 Bold', FONT_MEDIUM = 'KoPub돋움체 Medium'
    const colW = [0.8472, 0.8472, 1.6944, 1.6944, 1.5403]
    const tableX = 3.2717, tableY = 0.7635
    const BORDER_COLOR = 'BFBFBF'
    const bd = { pt: 0.5, color: BORDER_COLOR }, bd0 = { pt: 0, color: 'FFFFFF', type: 'none' }
    const bMid = [bd, bd, bd, bd], bLeft = [bd, bd, bd, bd0], bRight = [bd, bd0, bd, bd]
    const baseOpt = e => Object.assign({ align: 'center', valign: 'middle', margin: [0, 0, 0, 0] }, e)
    const mdLabel = (d, m) => '(' + d + ')일 / (' + m + ')MD'
    const STAGE_FILL = 'F2F2F2', HILITE_FILL = 'F2F2F2'
    const STAGE_ROW_H = [0.1623, 0.1298, 0.1623, 0.1298, 0.1298, 0.1623, 0.1710]
    const HEADER_H = 0.1623, TOTAL_H = 0.3254
    const rows = [], rowH = []
    rows.push([
      { text: '단계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bLeft }) },
      { text: '수행 활동', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bMid }) },
      { text: '수행 절차', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bMid }) },
      { text: '세부 일정', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bMid }) },
      { text: '소요 일수 및 공수', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bRight }) },
    ]); rowH.push(HEADER_H)
    let grandTotal = 0
    stageRows.forEach(s => {
      grandTotal += s.subtotalMD
      if (s.isCompact) {
        rows.push([
          { text: s.stage, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', rowspan: 2, fill: { color: STAGE_FILL }, border: bLeft }) },
          { text: '감리시행', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: s.compactLabel, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: s.compactDate, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: mdLabel(s.subtotalDays, s.subtotalMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[0])
        rows.push([
          { text: '소계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', colspan: 3, fill: { color: STAGE_FILL }, border: bMid }) },
          { text: mdLabel(s.subtotalDays, s.subtotalMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: STAGE_FILL }, border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[6])
        return
      }
      const showPre = s.preMD > 0, showPost = s.postMD > 0
      let pushed = false
      if (showPre) {
        const preEnd = s.startD ? shiftDateStr(s.startD, -1) : ''
        const preDate = s.startD ? ('~ ' + preEnd) : '예비조사'
        rows.push([
          { text: s.stage, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', rowspan: (showPre ? 1 : 0) + 3 + (showPost ? 1 : 0) + 1, fill: { color: STAGE_FILL }, border: bLeft }) },
          { text: '사전 검토', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: '예비조사', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: preDate, options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: mdLabel(1, s.preMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[1]); pushed = true
      }
      const auditDate = s.startD && s.endD ? (s.startD + ' ~ ' + s.endD) : (s.compactDate || '')
      rows.push([
        !pushed ? { text: s.stage, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', rowspan: 3 + (showPost ? 1 : 0) + 1, fill: { color: STAGE_FILL }, border: bLeft }) } : null,
        { text: '감리시행', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '현장감리', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
        { text: auditDate, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
        { text: mdLabel(s.days, s.auditMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
      ].filter(Boolean)); rowH.push(STAGE_ROW_H[2]); pushed = true
      rows.push([
        { text: '결과 검토', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '감리결과보고서 작성', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bRight }) },
      ]); rowH.push(STAGE_ROW_H[3])
      rows.push([
        { text: '후속 조치', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '시정조치 확인', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bRight }) },
      ]); rowH.push(STAGE_ROW_H[4])
      if (showPost) {
        const postDate = s.endD ? (shiftDateStr(s.endD, 14) + ' ~') : ''
        rows.push([
          { text: '조치확인', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: '조치확인', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: postDate, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: mdLabel(1, s.postMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[5])
      }
      rows.push([
        { text: '소계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', colspan: 4, fill: { color: STAGE_FILL }, border: bMid }) },
        { text: grandTotal + ' MD', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', fill: { color: STAGE_FILL }, border: bRight }) },
      ]); rowH.push(STAGE_ROW_H[6])
    })
    rows.push([
      { text: '합계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', colspan: 4, fill: { color: 'D2F0FF' }, border: bLeft }) },
      { text: grandTotal + ' MD', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', fill: { color: 'D2F0FF' }, border: bRight }) },
    ]); rowH.push(TOTAL_H)
    const sld = pres.addSlide()
    sld.addTable(rows, { x: tableX, y: tableY, w: colW.reduce((a, b) => a + b, 0), colW, rowH })
    if (opts.returnZip) {
      const ab = await pres.write({ outputType: 'arraybuffer' })
      const z = new JSZip(); await z.loadAsync(ab); return { zip: z }
    }
    await pres.writeFile({ fileName: '세부감리일정1_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
    showAutoAlert('✅ 세부 감리 일정 (1) 생성 완료', true)
    return null
  } catch (e) { showAutoAlert('❌ 생성 실패: ' + e.message, false); return null }
  finally { setBtnState(btn, false) }
}

// ── 표장표 PPT ──────────────────────────────────────────────
function computeAssignRows() {
  const { stages, personGradeMap, personFieldMap, portalOrder } = parsedData
  return (portalOrder || []).map(({ name }) => {
    const info = personGradeMap[name] || {}
    const field = personFieldMap[name] || ''
    const stageNames = []
    let isAudit = false
    stages.forEach(s => {
      const inA = s['감리원'] && s['감리원'].people.some(p => p.name === name && (p.pre + p.audit + p.post) > 0)
      const inE = s['전문가'] && s['전문가'].people.some(p => p.name === name && (p.pre + p.audit + p.post) > 0)
      if (inA) isAudit = true
      if ((inA || inE) && !stageNames.includes(s.stage)) stageNames.push(s.stage)
    })
    const stageLabel = stageNames.join(' / ')
    const residency = info.residency || ''
    const affil = residency ? '제안사 / ' + residency : '제안사'
    const certNo = (info.certNo || '').trim()
    const certDisplay = (!certNo || certNo === '-') ? '전문가' : fmtCertNo(certNo)
    const grade = getEffectiveGrade(name)
    return { name, field, stageLabel, affil, certDisplay, grade, isAudit, heritageLines: isAudit ? 10 : 3 }
  })
}

// ── downloadAssignPptx ──────────────────────────────────────────
// 8열 + 1인당3행 구조 (예시 PPTX 분석 기반)
//
// 열 구성 (총 8열):
//   col0: 감리단계  col1: 감리분야  col2: 소속·상근  col3: 성명
//   col4: 감리원번호  col5: 구분(등급)  col6: 투입율  col7: 유사감리실적(넓은열)
//
// 행 구성 (1인당 3행):
//   행A: 기본정보 — col0~6 각 값, col7 = "유사 감리 실적 : N건 / 감리 이외의 경력 : N년 N개월" (bg #AAE6FF)
//   행B: 실적목록  — col0~6 빈셀(rowspan 효과), col7 = 실적 목록 (h=1.851")
//   행C: 주요경력  — col0~6 빈셀(rowspan 효과), col7 = 주요경력·자격 (h=0.459")
//
// 예시 PPTX 실측값(EMU→인치):
//   테이블 pos: (0.57", 1.38"), 크기: (9.69" × 6.05")
//   열 너비: [0.603", 0.718", 0.718", 0.718", 0.718", 0.718", 0.718", 4.762"]
//   헤더 높이: 0.458", 기본정보: 0.268", 실적목록: 1.851", 주요경력: 0.459"
//   헤더 bg: #D2F0FF, 상단 border: #4BA6DD
//   기본정보 col7 bg: #AAE6FF, 텍스트 색: #1655A2
//   폰트: KoPub돋움체 Bold, sz=11pt(헤더)/10pt(데이터)
// ────────────────────────────────────────────────────────────────

async function downloadAssignPptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다.'); return null }
  setBtnState(btn, true)
  console.log('[AssignPptx] opts.templateB64:', opts.templateB64 ? '있음(길이:'+opts.templateB64.length+')' : 'null/없음', '| groupFilter:', opts.groupFilter || '없음')

  try {
    // ── 1. 인원 기본 데이터 수집 ────────────────────────────────
    let baseRows = computeAssignRows()
    if (!baseRows.length) { alert('인력 데이터가 없습니다.'); return null }

    if (opts.groupFilter === 'AUDITOR') {
      baseRows = baseRows.filter(r => r.isAudit)
    } else if (opts.groupFilter === 'EXPERT') {
      baseRows = baseRows.filter(r => !r.isAudit)
    }
    if (!baseRows.length) { alert('해당 그룹의 인력 데이터가 없습니다.'); return null }

    // ── 2. photo-profile API 병렬 호출 ─────────────────────────
    const pidMap     = parsedData.personnelIdMap || {}
    const proposalId = parsedData.proposalId || 0

    const profileMap = {}
    await Promise.all(
      baseRows.map(async r => {
        const pid = pidMap[r.name] || 0
        if (!pid) return
        try {
          const res = await fetch(`/api/personnel/${pid}/photo-profile?projectId=${proposalId}`)
          if (res.ok) {
            const json = await res.json()
            if (json.ok) profileMap[r.name] = json.data
          }
        } catch (e) { console.warn('[AssignPptx] photo-profile 로드 실패:', r.name, e) }
      })
    )

    // ── 3. IT경력기간 파싱 헬퍼 ────────────────────────────────
    // "YYYY.MM ~ YYYY.MM" 또는 "YYYY.MM ~ 현재" 형식 → "N년 N개월"
    function parseItCareerDuration(itCareerStr) {
      if (!itCareerStr) return ''
      try {
        const m = itCareerStr.match(/(\d{4})\.(\d{2})\s*~\s*(?:(\d{4})\.(\d{2})|현재)/)
        if (!m) return itCareerStr
        const startY = parseInt(m[1]), startM = parseInt(m[2])
        const now = new Date()
        const endY = m[3] ? parseInt(m[3]) : now.getFullYear()
        const endM = m[4] ? parseInt(m[4]) : now.getMonth() + 1
        let months = (endY - startY) * 12 + (endM - startM)
        if (months < 0) months = 0
        const y = Math.floor(months / 12), mo = months % 12
        if (y === 0) return `${mo}개월`
        if (mo === 0) return `${y}년`
        return `${y}년 ${mo}개월`
      } catch (e) { return itCareerStr }
    }

    // ── 4. 실적 목록 문자열 생성 ────────────────────────────────
    function buildJeokText(profile) {
      if (!profile) return ''
      const jeok = Array.isArray(profile.실적) ? profile.실적 : []
      return jeok.join('\n')
    }

    // ── 5. 주요경력 + 자격 문자열 생성 ─────────────────────────
    function buildCareerText(profile) {
      if (!profile) return ''
      const parts = []
      if (profile.주요이력) parts.push(profile.주요이력)
      if (profile.자격요약) parts.push(profile.자격요약)
      return parts.join('\n')
    }

    // ── 6. 상단 border 색(#4BA6DD) 0.75pt 헬퍼 ─────────────────
    const bdNone  = { type: 'none' }
    const bdGray  = { pt: 0.5, color: 'AAAAAA' }
    const bdBlue  = { pt: 0.75, color: '4BA6DD' }
    const bdDark  = { pt: 0.75, color: '1655A2' }

    // border 배열: [top, right, bottom, left]
    function bdr(top, right, bottom, left) { return [top, right, bottom, left] }

    const FONT = 'KoPub돋움체 Bold'
    const FONT_DATA = 'KoPub돋움체 Medium'
    const C_HEAD_BG  = 'D2F0FF'   // 헤더 배경
    const C_INFO_BG  = 'AAE6FF'   // 기본정보 col7 배경
    const C_BLUE_TXT = '1655A2'   // 파란 텍스트
    const C_DARK     = '1A2E4A'   // 헤더 텍스트
    const C_BLACK    = '222222'

    // 열 너비 (인치): [0.603, 0.718, 0.718, 0.718, 0.718, 0.718, 0.718, 4.762]
    const COL_W = [0.603, 0.718, 0.718, 0.718, 0.718, 0.718, 0.718, 4.762]

    // 헤더 높이 / 행 높이
    const H_HEADER = 0.458
    const H_INFO   = 0.268
    const H_JEOK   = 1.851
    const H_CAREER = 0.459

    const baseOpt = (extra) => Object.assign({
      fontFace: FONT_DATA, fontSize: 10,
      valign: 'middle', align: 'center',
      margin: [0.03, 0.05, 0.03, 0.05],
      color: C_BLACK,
    }, extra)

    // ── 7. 헤더 행 ──────────────────────────────────────────────
    const HEADERS = ['감리단계', '감리분야', '소속·상근', '성명', '감리원번호', '구분', '투입율', '유사감리실적']
    const headerRow = HEADERS.map((h, ci) => {
      const isFirst = ci === 0, isLast = ci === 7
      return {
        text: h,
        options: {
          fontFace: FONT, fontSize: 11,
          bold: true, color: C_DARK,
          fill: { color: C_HEAD_BG },
          valign: 'middle', align: 'center',
          margin: [0.03, 0.05, 0.03, 0.05],
          border: bdr(
            bdBlue,
            isLast  ? bdGray : bdGray,
            bdGray,
            isFirst ? bdNone : bdGray
          ),
        }
      }
    })

    // ── 8. 인원별 3행 생성 ──────────────────────────────────────
    const tRows = [headerRow]
    const rowH  = [H_HEADER]

    for (const r of baseRows) {
      const prof = profileMap[r.name] || {}
      const auditCnt   = prof.감리횟수   != null ? prof.감리횟수   : ''
      const itDuration = parseItCareerDuration(prof.IT경력기간 || '')
      const jeokText   = buildJeokText(prof)
      const careerText = buildCareerText(prof)

      // col7 기본정보 텍스트: "유사 감리 실적 : N건 / 감리 이외의 경력 : N년 N개월"
      const col7InfoText = [
        auditCnt !== '' ? `유사 감리 실적 : ${auditCnt}건` : '유사 감리 실적 : -',
        itDuration      ? `감리 이외의 경력 : ${itDuration}` : '감리 이외의 경력 : -',
      ].join(' / ')

      // ── 행A: 기본정보 ──────────────────────────────────────────
      const cellBase = (text, extra) => ({
        text,
        options: baseOpt(Object.assign({
          border: bdr(bdGray, bdGray, bdGray, bdGray)
        }, extra))
      })

      const rowA = [
        cellBase(r.stageLabel,  { align: 'center' }),   // col0: 감리단계
        cellBase(r.field,       { align: 'center' }),   // col1: 감리분야
        cellBase(r.affil,       { align: 'center', fontSize: 9 }), // col2: 소속·상근
        cellBase(r.name,        { align: 'center', fontFace: FONT, bold: true }), // col3: 성명
        cellBase(r.certDisplay, { align: 'center', fontSize: 9 }), // col4: 감리원번호
        cellBase(r.grade,       { align: 'center' }),   // col5: 구분
        cellBase('100%',        { align: 'center', fontFace: FONT, bold: true }), // col6: 투입율
        // col7: 유사감리실적 요약 (bg #AAE6FF, 파란 bold 텍스트)
        {
          text: col7InfoText,
          options: baseOpt({
            fontFace: FONT, bold: true, color: C_BLUE_TXT,
            fill: { color: C_INFO_BG },
            align: 'left',
            margin: [0.05, 0.1, 0.05, 0.1],
            border: bdr(bdDark, bdGray, bdGray, bdGray),
          })
        },
      ]

      // ── 행B: 실적목록 ──────────────────────────────────────────
      const emptyCell = (isLast) => ({
        text: '',
        options: baseOpt({
          border: bdr(bdGray, isLast ? bdGray : bdGray, bdGray, bdGray)
        })
      })

      const rowB = [
        emptyCell(false),  // col0
        emptyCell(false),  // col1
        emptyCell(false),  // col2
        emptyCell(false),  // col3
        emptyCell(false),  // col4
        emptyCell(false),  // col5
        emptyCell(false),  // col6
        // col7: 실적 목록
        {
          text: jeokText,
          options: baseOpt({
            align: 'left', valign: 'top',
            fontSize: 9,
            margin: [0.05, 0.1, 0.05, 0.1],
            border: bdr(bdGray, bdGray, bdGray, bdGray),
          })
        },
      ]

      // ── 행C: 주요경력 ──────────────────────────────────────────
      const rowC = [
        emptyCell(false),
        emptyCell(false),
        emptyCell(false),
        emptyCell(false),
        emptyCell(false),
        emptyCell(false),
        emptyCell(false),
        // col7: 주요경력·자격
        {
          text: careerText,
          options: baseOpt({
            align: 'left', valign: 'middle',
            fontSize: 9,
            margin: [0.03, 0.1, 0.03, 0.1],
            border: bdr(bdGray, bdGray, bdGray, bdGray),
          })
        },
      ]

      tRows.push(rowA); rowH.push(H_INFO)
      tRows.push(rowB); rowH.push(H_JEOK)
      tRows.push(rowC); rowH.push(H_CAREER)
    }

    // ── 9. PptxGenJS로 테이블 임시 PPTX 생성 ────────────────────
    const TBL_X = 0.57
    const TBL_Y = 1.38
    const TBL_W = COL_W.reduce((a, b) => a + b, 0)  // ≈ 9.69"

    const presTemp = new PptxGenJS()
    presTemp.defineLayout({ name: 'CUSTOM_10x7', width: 10.83, height: 7.5 })
    presTemp.layout = 'CUSTOM_10x7'
    const sldTemp = presTemp.addSlide()
    sldTemp.addTable(tRows, {
      x: TBL_X, y: TBL_Y,
      w: TBL_W,
      colW: COL_W,
      rowH: rowH,
    })
    const tempAb = await presTemp.write({ outputType: 'arraybuffer' })
    const tempZip = new JSZip()
    await tempZip.loadAsync(tempAb)
    const tableSlideXml = await tempZip.file('ppt/slides/slide1.xml').async('string')

    console.log('[AssignPptx] 테이블 생성 완료 — 인원:', baseRows.length, '명 / 행수:', tRows.length)

    // ── 10. 템플릿 오버레이 or 빈 슬라이드 출력 ─────────────────
    if (opts.templateB64) {
      // [A] 템플릿 PPTX 로드
      const bin = atob(opts.templateB64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const tplZip = await JSZip.loadAsync(bytes)

      // [A-1] [제목] 플레이스홀더 치환
      if (opts.menuTitle) {
        const menuTitle = opts.menuTitle
        const slideFilesT = Object.keys(tplZip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        for (const sf of slideFilesT) {
          let xml = await tplZip.file(sf).async('string')
          // Case 1: 단일 런
          if (xml.includes('[제목]')) {
            xml = xml.replace(/\[제목\]/g, menuTitle)
            tplZip.file(sf, xml); continue
          }
          // Case 2: 분산 런
          if (xml.includes('제목')) {
            const paraReg = /(<a:p\b[^>]*>)([\s\S]*?)(<\/a:p>)/g
            let changed = false
            xml = xml.replace(paraReg, (full, open, inner, close) => {
              const runs = []
              inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
                const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
                runs.push({ run, text: t ? t[1] : '' })
              })
              const concat = runs.map(r => r.text).join('')
              if (!concat.includes('[제목]')) return full
              const jStart = concat.indexOf('[제목]'), jEnd = jStart + 4
              let pos = 0, firstJRun = true
              const newInner = inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
                const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
                const txt = t ? t[1] : ''
                const rStart = pos, rEnd = pos + txt.length; pos = rEnd
                if (txt === '') return run
                const overlap = rEnd > jStart && rStart < jEnd
                if (!overlap) return run
                if (firstJRun) { firstJRun = false; return run.replace(/<a:t([^>]*)>[^<]*<\/a:t>/, `<a:t$1>${menuTitle}</a:t>`) }
                return ''
              })
              changed = true; return open + newInner + close
            })
            if (changed) tplZip.file(sf, xml)
          }
        }
      }

      // [A-2] 템플릿 슬라이드 파일 목록 (정렬)
      const tplSlideFiles = Object.keys(tplZip.files)
        .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]))

      if (tplSlideFiles.length > 0) {
        // [A-3] 기존 테이블(<p:graphicFrame>) 제거 후 새 테이블 삽입
        const tplFirstSlide = tplSlideFiles[0]
        let tplSlideXml = await tplZip.file(tplFirstSlide).async('string')

        // 기존 graphicFrame(테이블) 모두 제거
        tplSlideXml = tplSlideXml.replace(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g, '')
        console.log('[AssignPptx] 기존 graphicFrame 제거 완료')

        // 새 테이블 graphicFrame 추출 → 삽입
        const gfMatches = [...tableSlideXml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)]
        if (gfMatches.length > 0) {
          const tableGfXml = gfMatches.map(m => m[0]).join('\n')
          tplSlideXml = tplSlideXml.replace(/<\/p:spTree>/, tableGfXml + '</p:spTree>')
          console.log('[AssignPptx] 새 테이블 graphicFrame', gfMatches.length, '개 삽입 완료')
        } else {
          console.warn('[AssignPptx] 새 테이블 graphicFrame 추출 실패 — 슬라이드 전체 교체 fallback')
          tplZip.file(tplFirstSlide, tableSlideXml)
        }
        tplZip.file(tplFirstSlide, tplSlideXml)

        // [A-4] 나머지 슬라이드 제거
        for (let i = 1; i < tplSlideFiles.length; i++) {
          tplZip.remove(tplSlideFiles[i])
          const relFile = tplSlideFiles[i].replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
          if (tplZip.file(relFile)) tplZip.remove(relFile)
        }

        // [A-5] [Content_Types].xml 정리
        if (tplSlideFiles.length > 1) {
          const ctXml = await tplZip.file('[Content_Types].xml').async('string')
          let newCtXml = ctXml
          for (let i = 1; i < tplSlideFiles.length; i++) {
            const n = tplSlideFiles[i].match(/slide(\d+)/)[1]
            newCtXml = newCtXml.replace(new RegExp(`<Override[^>]*PartName="[^"]*slide${n}\\.xml"[^>]*/?>`, 'g'), '')
          }
          tplZip.file('[Content_Types].xml', newCtXml)
        }

        // [A-6] presentation.xml.rels / presentation.xml 정리
        if (tplSlideFiles.length > 1) {
          const presRelsFile = 'ppt/_rels/presentation.xml.rels'
          if (tplZip.file(presRelsFile)) {
            let presRelsXml = await tplZip.file(presRelsFile).async('string')
            for (let i = 1; i < tplSlideFiles.length; i++) {
              const n = tplSlideFiles[i].match(/slide(\d+)/)[1]
              presRelsXml = presRelsXml.replace(new RegExp(`<Relationship[^>]*Target="slides/slide${n}\\.xml"[^>]*/?>`, 'g'), '')
            }
            tplZip.file(presRelsFile, presRelsXml)
          }
          if (tplZip.file('ppt/presentation.xml')) {
            let presXml = await tplZip.file('ppt/presentation.xml').async('string')
            presXml = presXml.replace(/(<p:sldIdLst>)([\s\S]*?)(<\/p:sldIdLst>)/, (full, open, inner, close) => {
              const firstMatch = inner.match(/<p:sldId[^/]*\/>/)
              return open + (firstMatch ? firstMatch[0] : inner) + close
            })
            tplZip.file('ppt/presentation.xml', presXml)
          }
        }
      }

      if (opts.returnZip) return { zip: tplZip }
      const finalAb = await tplZip.generateAsync({ type: 'arraybuffer', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
      const blob = new Blob([finalAb], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url
      a.download = '표장표_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx'
      a.click(); URL.revokeObjectURL(url)
      showAutoAlert('✅ 표장표 생성 완료', true)
      return null

    } else {
      // [B] 템플릿 없는 경우 — 빈 슬라이드에 테이블만
      if (opts.returnZip) {
        const ab = await presTemp.write({ outputType: 'arraybuffer' })
        const z  = new JSZip(); await z.loadAsync(ab); return { zip: z }
      }
      await presTemp.writeFile({ fileName: '표장표_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
      showAutoAlert('✅ 표장표 생성 완료', true)
      return null
    }

  } catch (e) {
    console.error('[AssignPptx] 오류:', e)
    showAutoAlert('❌ 생성 실패: ' + e.message, false)
    return null
  } finally {
    setBtnState(btn, false)
  }
}

// ── buildHistoryPptx ────────────────────────────────────────────
// 감리원/전문가 유사 감리 실적 및 경력·자격 장표 생성 (플레이스홀더 방식)
//
// 동작 방식:
//   1. 템플릿 PPTX(opts.templateB64)를 JSZip으로 로드
//   2. 템플릿 첫 슬라이드에서 [P1_xxx] ~ [PN_xxx] 플레이스홀더를 인원 데이터로 치환
//   3. 인원수가 슬라이드당 capacity(감리원=2, 전문가=4)를 초과하면 슬라이드 복제
//   4. [제목] 치환 (분산런 포함)
//   5. 합본 ZIP 반환 또는 다운로드
//
// 템플릿 PPTX 제작 가이드 — 각 인원 자리에 아래 플레이스홀더를 정확히 입력:
//
//   1번 인원:
//     [P1_단계]   감리단계 (줄바꿈 필요 시 셀 내 줄바꿈으로 표현됨, 코드가 \r\n/\r\n으로 채움)
//     [P1_분야]   감리분야
//     [P1_소속]   소속 및 상근여부
//     [P1_이름]   성명
//     [P1_번호]   감리원번호
//     [P1_구분]   구분(등급)
//     [P1_투입]   현장감리 투입율
//     [P1_요약]   유사 감리 실적 : N건 / 감리 이외의 경력 : N년 N개월
//     [P1_실적]   유사 감리 실적 목록 (여러 줄)
//     [P1_경력]   주요 경력 및 자격 요약
//
//   2번 인원: [P2_단계] [P2_분야] ... [P2_경력]
//   3번 인원: [P3_xxx] (전문가 템플릿용)
//   4번 인원: [P4_xxx] (전문가 템플릿용)
// ────────────────────────────────────────────────────────────────

async function buildHistoryPptx(opts) {
  // opts: { templateB64, groupFilter:'AUDITOR'|'EXPERT', perPage:2|4, menuTitle, returnZip }
  opts = opts || {}
  const perPage = opts.perPage || 2

  if (!opts.templateB64) {
    throw new Error('템플릿 PPTX가 업로드되지 않았습니다. 관리자 메뉴에서 템플릿을 업로드해 주세요.')
  }

  // ── 1. 인원 데이터 수집 ────────────────────────────────────────
  let baseRows = computeAssignRows()
  if (opts.groupFilter === 'AUDITOR') baseRows = baseRows.filter(r => r.isAudit)
  else if (opts.groupFilter === 'EXPERT') baseRows = baseRows.filter(r => !r.isAudit)
  if (!baseRows.length) throw new Error('해당 그룹의 인력 데이터가 없습니다.')

  // ── 2. photo-profile API 병렬 호출 ────────────────────────────
  const pidMap     = parsedData.personnelIdMap || {}
  const proposalId = parsedData.proposalId || 0
  const profileMap = {}
  await Promise.all(baseRows.map(async r => {
    const pid = pidMap[r.name] || 0
    if (!pid) return
    try {
      const res = await fetch(`/api/personnel/${pid}/photo-profile?projectId=${proposalId}`)
      if (res.ok) { const j = await res.json(); if (j.ok) profileMap[r.name] = j.data }
    } catch (e) { console.warn('[HistoryPptx] photo-profile 실패:', r.name, e) }
  }))

  // ── 3. 헬퍼 함수들 ─────────────────────────────────────────────

  // IT경력기간 파싱: "YYYY.MM ~ YYYY.MM" → "N년 N개월"
  function parseCareerDuration(s) {
    if (!s) return ''
    const m = s.match(/(\d{4})\.(\d{2})\s*~\s*(?:(\d{4})\.(\d{2})|현재)/)
    if (!m) return s
    const sy = +m[1], sm = +m[2], now = new Date()
    const ey = m[3] ? +m[3] : now.getFullYear()
    const em = m[4] ? +m[4] : now.getMonth() + 1
    let mo = (ey - sy) * 12 + (em - sm)
    if (mo < 0) mo = 0
    const y = Math.floor(mo / 12), rm = mo % 12
    if (y === 0) return `${rm}개월`
    if (rm === 0) return `${y}년`
    return `${y}년 ${rm}개월`
  }

  // 소속·상근 텍스트 생성: "제안사\r\n/\r\n상근" 형식
  function buildSosok(affil) {
    // affil은 "제안사 / 상근" 또는 "제안사" 형태
    return (affil || '').replace(' / ', '\r\n/\r\n')
  }

  // 감리단계 텍스트: "설계 / 구현 / 종료" → "설계\r\n/\r\n구현\r\n/\r\n종료"
  function buildStage(stageLabel) {
    return (stageLabel || '').replace(/ \/ /g, '\r\n/\r\n')
  }

  // 이름 공백 처리: "이승학" → "이 승 학" (이미 computeAssignRows에서 처리됐을 수도)
  function spaceName(name) {
    if (!name) return ''
    // 이미 공백이 있으면 그대로, 없으면 한 글자씩 띄움
    if (name.includes(' ')) return name
    return name.split('').join(' ')
  }

  // 실적 N번째 항목 (1-based, 없으면 빈 문자열)
  function getJeok(profile, n) {
    if (!profile) return ''
    const arr = Array.isArray(profile.실적) ? profile.실적 : []
    return arr[n - 1] || ''
  }

  // ── 4. 인원 데이터를 플레이스홀더 맵으로 변환 ──────────────────
  // 분산런 치환 함수 — 파라미터 단위 (pptx-engine과 동일 로직)
  function replaceInXml(xml, placeholder, value) {
    // value에 <br>이 포함된 경우: PPTX <a:br> 태그로 분리 치환
    const hasBr = typeof value === 'string' && value.includes('<br>')

    // <br> 포함 시 단락 내 해당 런을 찾아 <a:r>파트1</a:r><a:br><a:rPr/></a:br><a:r>파트2</a:r> 형태로 교체
    function replaceBrInPara(inner, parts) {
      const rPrMatch = inner.match(/<a:rPr\b[\s\S]*?<\/a:rPr>/)
      const rPr = rPrMatch ? rPrMatch[0] : ''
      // <a:br> 태그: rPr를 그대로 포함 (서식 유지)
      const brTag = rPr ? `<a:br>${rPr}</a:br>` : `<a:br/>`
      // 원본 런에서 <a:t> 속성 추출 (xml:space 등)
      const tAttrMatch = inner.match(/<a:t([^>]*)>/)
      const tAttr = tAttrMatch ? tAttrMatch[1] : ''
      // 각 파트를 <a:r>로 감싸고 사이에 <a:br> 삽입
      // 첫 런에는 원본 rPr 재사용, 이후 런도 동일 rPr 적용
      const runOpen = rPr ? `<a:r>${rPr}` : `<a:r>`
      return parts.map(p => `${runOpen}<a:t${tAttr}>${escapeXml(p)}</a:t></a:r>`).join(brTag)
    }

    // Case 1: 단일 런 — 그대로 치환 (또는 <br> 포함 시 분리 치환)
    if (xml.includes(placeholder)) {
      if (!hasBr) return xml.split(placeholder).join(value)
      // <br> 분리: 단락 단위로 처리
      const parts = value.split('<br>')
      const paraReg = /(<a:p\b[^>]*>)([\s\S]*?)(<\/a:p>)/g
      return xml.replace(paraReg, (full, open, inner, close) => {
        if (!inner.includes(placeholder)) return full
        // 해당 플레이스홀더를 포함하는 런 찾기
        let done = false
        const newInner = inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
          if (done) return run
          const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
          if (!t || !t[1].includes(placeholder)) return run
          done = true
          return replaceBrInPara(run, parts)
        })
        return open + newInner + close
      })
    }

    // Case 2: 분산 런 — 단락 단위로 재조합
    // placeholder를 구성하는 문자가 여러 <a:r>에 나뉘어 있을 수 있음
    const paraReg = /(<a:p\b[^>]*>)([\s\S]*?)(<\/a:p>)/g
    let changed = false
    const result = xml.replace(paraReg, (full, open, inner, close) => {
      const runs = []
      inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
        const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
        runs.push({ run, text: t ? t[1] : '' })
      })
      const concat = runs.map(r => r.text).join('')
      if (!concat.includes(placeholder)) return full
      const pStart = concat.indexOf(placeholder), pEnd = pStart + placeholder.length
      let pos = 0, firstDone = false
      const newInner = inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
        const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
        const txt = t ? t[1] : ''
        const rStart = pos, rEnd = pos + txt.length; pos = rEnd
        if (txt === '') return run
        const overlap = rEnd > pStart && rStart < pEnd
        if (!overlap) return run
        if (!firstDone) {
          firstDone = true
          if (hasBr) {
            // <br> 포함: 이 런을 기점으로 분리 런 삽입
            const parts = value.split('<br>')
            return replaceBrInPara(run, parts)
          }
          return run.replace(/<a:t([^>]*)>[^<]*<\/a:t>/, `<a:t$1>${escapeXml(value)}</a:t>`)
        }
        return ''
      })
      changed = true
      return open + newInner + close
    })
    return changed ? result : xml
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── 감리이력 컬러런 치환 ──────────────────────────────────────
  // "[P1_감리이력N]" 플레이스홀더 단락 전체를
  // "[ 키워드 ]" 부분은 빨간색(#E60012), 나머지는 검정(#464646)인
  // 두 개의 <a:r>로 교체한다.
  //
  // 실적 텍스트 형식: "[ 통합관제 ] 울산정보산업진흥원, ..."
  //   → 키워드런: "[ 통합관제 ] "  색: E60012
  //   → 사업명런: "울산정보산업진흥원, ..."  색: 464646
  //
  // 키워드가 없는 경우(빈 문자열 포함) → 빈 단락으로 교체
  // overrideKeyword: 지정 시 [ 키워드 ] 부분을 이 값으로 덮어씀 (EXPERT_HISTORY용)
  function replaceJeokInXml(xml, placeholder, jeokText, overrideKeyword) {
    // 단락 단위로 순회
    const paraReg = /(<a:p\b[^>]*>)([\s\S]*?)(<\/a:p>)/g
    let changed = false
    const result = xml.replace(paraReg, (full, open, inner, close) => {
      // 분산런 조합 후 플레이스홀더 포함 여부 확인
      const runs = []
      inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
        const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
        runs.push({ run, text: t ? t[1] : '' })
      })
      const concat = runs.map(r => r.text).join('')
      if (!concat.includes(placeholder)) return full

      changed = true

      // pPr(단락 속성) 추출 — 그대로 유지
      const pPrMatch = inner.match(/<a:pPr\b[\s\S]*?<\/a:pPr>/)
      const pPr = pPrMatch ? pPrMatch[0] : ''

      // 원본 rPr 추출 (폰트·크기·외곽선 등 서식 기반)
      const rPrMatch = inner.match(/<a:rPr\b[\s\S]*?<\/a:rPr>/)
      // rPr에서 글자색(solidFill)만 교체하는 헬퍼
      // ※ <a:ln> 안의 solidFill(테두리색)은 건드리지 않음
      function makeRPr(color) {
        if (!rPrMatch) {
          return `<a:rPr lang="ko-KR" sz="900" dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr>`
        }
        const rpr = rPrMatch[0]
        // <a:ln>...</a:ln> 블록을 임시 토큰으로 보호 → solidFill 교체 → 복원
        const lnBlocks = []
        const protected_ = rpr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, m => {
          lnBlocks.push(m)
          return `\x00LN${lnBlocks.length - 1}\x00`
        })
        // <a:ln> 바깥의 solidFill만 교체 (없으면 </a:rPr> 앞에 삽입)
        let replaced
        if (/<a:solidFill>/.test(protected_)) {
          replaced = protected_.replace(
            /<a:solidFill>[\s\S]*?<\/a:solidFill>/,
            `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`
          )
        } else {
          replaced = protected_.replace(
            '</a:rPr>',
            `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr>`
          )
        }
        // 보호된 <a:ln> 블록 복원
        return replaced.replace(/\x00LN(\d+)\x00/g, (_, i) => lnBlocks[+i])
      }

      // 빈 텍스트 → 빈 단락 (행 자체는 유지해서 레이아웃 깨지지 않게)
      if (!jeokText) {
        return `${open}${pPr}<a:r>${makeRPr('464646')}<a:t></a:t></a:r>${close}`
      }

      // "[ 키워드 ] 사업명" 분리
      // 패턴: 텍스트가 "[" 로 시작하고 "]" 가 있으면 키워드 존재
      const kwMatch = jeokText.match(/^(\[.*?\]\s*)(.*)$/)
      if (kwMatch) {
        // overrideKeyword 지정 시 키워드 부분을 해당 값으로 교체 (EXPERT: [PN_분야] 값 사용)
        const kwStr    = overrideKeyword ? `[ ${overrideKeyword.trim()} ] ` : kwMatch[1]
        const kwPart   = escapeXml(kwStr)       // "[ 데이터품질 ] "
        const bodyPart = escapeXml(kwMatch[2])  // "울산정보산업진흥원, ..."
        const kwRun   = `<a:r>${makeRPr('E60012')}<a:t>${kwPart}</a:t></a:r>`
        const bodyRun = bodyPart
          ? `<a:r>${makeRPr('464646')}<a:t>${bodyPart}</a:t></a:r>`
          : ''
        return `${open}${pPr}${kwRun}${bodyRun}${close}`
      }

      // 키워드 없는 경우 → 단색(검정) 단일 런
      return `${open}${pPr}<a:r>${makeRPr('464646')}<a:t>${escapeXml(jeokText)}</a:t></a:r>${close}`
    })
    return changed ? result : xml
  }

  // 전체 플레이스홀더 키 목록 (인원 슬롯 n 기준)
  function personPlaceholders(n) {
    const list = [
      `[P${n}_단계]`, `[P${n}_분야]`, `[P${n}_소속]`, `[P${n}_이름]`,
      `[P${n}_번호]`, `[P${n}_구분]`, `[P${n}_투입]`,
      `[P${n}_감리횟수]`, `[P${n}_IT경력기간]`,
      `[P${n}_주요이력]`,
    ]
    for (let i = 1; i <= 10; i++) list.push(`[P${n}_감리이력${i}]`)
    return list
  }

  // 인원 N명의 데이터를 XML에서 [P1_xxx]~[PN_xxx] 치환
  function applyPersonData(xml, people) {
    let result = xml
    people.forEach((r, idx) => {
      const n = idx + 1
      const prof = profileMap[r.name] || {}
      const map = {
        [`[P${n}_단계]`]:    buildStage(r.stageLabel),
        [`[P${n}_분야]`]:    r.field || '',
        [`[P${n}_소속]`]:    buildSosok(r.affil),
        [`[P${n}_이름]`]:    spaceName(r.name),
        [`[P${n}_번호]`]:    r.certDisplay || '',
        [`[P${n}_구분]`]:    r.grade || '',
        [`[P${n}_투입]`]:    '100%',
        // 요약행: 템플릿에 "유사 감리 실적 : [P1_감리횟수]건 / 감리 이외의 경력 : [P1_IT경력기간]" 형태로 기재
        [`[P${n}_감리횟수]`]: prof.감리횟수 != null ? String(prof.감리횟수) : '-',
        [`[P${n}_IT경력기간]`]:   parseCareerDuration(prof.IT경력기간) || '-',
        // 주요이력: photo-profile의 주요이력(career_expert) 그대로
        [`[P${n}_주요이력]`]: prof.주요이력 || '',
      }
      // 감리이력 1~10 — 컬러런 분리 치환 ([ 키워드 ]=빨강, 사업명=검정)
      // EXPERT_HISTORY: [ 키워드 ] 부분을 [PN_분야] 값으로 덮어씀
      const jeokKeyword = (opts.groupFilter === 'EXPERT') ? (r.field || '').trim() : null
      for (let i = 1; i <= 10; i++) {
        result = replaceJeokInXml(result, `[P${n}_감리이력${i}]`, getJeok(prof, i), jeokKeyword)
      }
      for (const [ph, val] of Object.entries(map)) {
        result = replaceInXml(result, ph, val)
      }
    })
    // 미할당 슬롯 플레이스홀더 제거 (인원이 perPage에 미달할 때)
    for (let n = people.length + 1; n <= perPage; n++) {
      for (const ph of personPlaceholders(n)) {
        result = replaceInXml(result, ph, '')
      }
      // 감리이력 미할당 슬롯 → 빈 단락으로 교체
      for (let i = 1; i <= 10; i++) {
        result = replaceJeokInXml(result, `[P${n}_감리이력${i}]`, '')
      }
    }
    return result
  }

  // ── 5. [제목] 치환 함수 ────────────────────────────────────────
  function applyMenuTitle(xml, menuTitle) {
    if (!menuTitle) return xml
    if (xml.includes('[제목]')) return xml.split('[제목]').join(menuTitle)
    if (!xml.includes('제목')) return xml
    const paraReg = /(<a:p\b[^>]*>)([\s\S]*?)(<\/a:p>)/g
    let changed = false
    const result = xml.replace(paraReg, (full, open, inner, close) => {
      const runs = []
      inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
        const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
        runs.push({ run, text: t ? t[1] : '' })
      })
      const concat = runs.map(r => r.text).join('')
      if (!concat.includes('[제목]')) return full
      const jS = concat.indexOf('[제목]'), jE = jS + 4
      let pos = 0, firstDone = false
      const newInner = inner.replace(/<a:r\b[\s\S]*?<\/a:r>/g, run => {
        const t = run.match(/<a:t[^>]*>([^<]*)<\/a:t>/)
        const txt = t ? t[1] : ''
        const rS = pos, rE = pos + txt.length; pos = rE
        if (txt === '') return run
        if (!(rE > jS && rS < jE)) return run
        if (!firstDone) { firstDone = true; return run.replace(/<a:t([^>]*)>[^<]*<\/a:t>/, `<a:t$1>${menuTitle}</a:t>`) }
        return ''
      })
      changed = true; return open + newInner + close
    })
    return changed ? result : xml
  }

  // ── 6. 템플릿 PPTX 로드 ───────────────────────────────────────
  const bin = atob(opts.templateB64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const tplZip = await JSZip.loadAsync(bytes)

  // 슬라이드 파일 목록 (정렬)
  const allSlideFiles = Object.keys(tplZip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]))

  if (!allSlideFiles.length) throw new Error('템플릿에 슬라이드가 없습니다.')
  const tplSlideFile = allSlideFiles[0]
  const tplSlideXml  = await tplZip.file(tplSlideFile).async('string')
  // 삭제 전에 관계 XML 전체를 확보한다. rId는 슬라이드별 로컬 식별자이므로
  // 복제 시 재번호매김하지 않고 이미지·레이아웃·외부 링크·TargetMode를 그대로 보존한다.
  const tplRelsFile = tplSlideFile.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
  if (!tplZip.file(tplRelsFile)) throw new Error('실적 템플릿의 슬라이드 연결 정보(.rels)가 없습니다. 원본 PPTX를 확인해 주세요.')
  const tplRelsXml = await tplZip.file(tplRelsFile).async('string')

  // ── 7. 인원을 perPage 단위로 청크 분할 ────────────────────────
  const chunks = []
  for (let i = 0; i < baseRows.length; i += perPage) {
    chunks.push(baseRows.slice(i, i + perPage))
  }

  // ── 8. 슬라이드 복제 + 치환 ───────────────────────────────────
  // 기존 슬라이드 모두 제거 후 새로 생성
  // presentation.xml, presentation.xml.rels, [Content_Types].xml 관리

  let presXml     = await tplZip.file('ppt/presentation.xml').async('string')
  let presRelsXml = await tplZip.file('ppt/_rels/presentation.xml.rels').async('string')
  let ctXml       = await tplZip.file('[Content_Types].xml').async('string')

  // 기존 슬라이드 관계만 제거한다. Target의 슬래시나 속성 순서에 의존하지 않는다.
  presXml     = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '<p:sldIdLst></p:sldIdLst>')
  const presRelsDoc = new DOMParser().parseFromString(presRelsXml, 'application/xml')
  for (const rel of Array.from(presRelsDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship'))) {
    if (rel.getAttribute('Type')?.endsWith('/slide')) rel.parentNode.removeChild(rel)
  }
  presRelsXml = new XMLSerializer().serializeToString(presRelsDoc)
  ctXml       = ctXml.replace(/<Override[^>]*presentationml\.slide\+xml[^>]*\/>/g, '')

  // 기존 슬라이드 파일들 삭제
  for (const sf of allSlideFiles) {
    tplZip.remove(sf)
    const rf = sf.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
    if (tplZip.file(rf)) tplZip.remove(rf)
  }

  // 현재 최대 rId, sldId 파악
  let maxRid = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid = Math.max(maxRid, +n) })
  let maxSldId = 255; presXml.replace(/<p:sldId\b[^>]*\bid="(\d+)"/g, (_, n) => { maxSldId = Math.max(maxSldId, +n) })

  let newRels = '', newSldIds = '', newCt = ''

  chunks.forEach((chunk, ci) => {
    const slideNum = ci + 1
    const fileName = `ppt/slides/slide${slideNum}.xml`
    const relFileName = `ppt/slides/_rels/slide${slideNum}.xml.rels`

    // presentation.xml.rels에 이 슬라이드 관계 추가
    const sldRid = ++maxRid
    const sldId = ++maxSldId

    // 본문 토큰만 치환한다. 그림 객체와 관계 ID는 원본 그대로 복제한다.
    let slideXml = applyMenuTitle(tplSlideXml, opts.menuTitle || '')
    slideXml = applyPersonData(slideXml, chunk)

    tplZip.file(fileName, slideXml)
    tplZip.file(relFileName, tplRelsXml)

    newRels   += `<Relationship Id="rId${sldRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`
    newSldIds += `<p:sldId id="${sldId}" r:id="rId${sldRid}"/>`
    newCt     += `<Override PartName="/ppt/slides/slide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  })

  // presentation.xml 업데이트
  presXml     = presXml.replace('<p:sldIdLst></p:sldIdLst>', `<p:sldIdLst>${newSldIds}</p:sldIdLst>`)
  const addedRels = new DOMParser().parseFromString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${newRels}</Relationships>`, 'application/xml')
  for (const rel of Array.from(addedRels.documentElement.childNodes)) {
    if (rel.nodeType === 1) presRelsDoc.documentElement.appendChild(presRelsDoc.importNode(rel, true))
  }
  presRelsXml = new XMLSerializer().serializeToString(presRelsDoc)
  ctXml       = ctXml.replace('</Types>', newCt + '</Types>')

  tplZip.file('ppt/presentation.xml', presXml)
  tplZip.file('ppt/_rels/presentation.xml.rels', presRelsXml)
  tplZip.file('[Content_Types].xml', ctXml)

  console.log(`[HistoryPptx] 완료 — ${baseRows.length}명 / ${chunks.length}슬라이드 / perPage=${perPage}`)

  if (opts.returnZip) return { zip: tplZip }

  const finalAb = await tplZip.generateAsync({
    type: 'arraybuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  })
  const blob = new Blob([finalAb], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url
  const title = (opts.menuTitle || '실적장표').slice(0, 15)
  a.download = `${title}_${(parsedData.projectTitle || '').slice(0, 10)}.pptx`
  a.click(); URL.revokeObjectURL(url)
}

// ── 사진장표 PPT (템플릿 기반) ─────────────────────────────────
// 원본 PPTX 템플릿(photo-template.b64.js)을 JSZip으로 열고 DOMParser로
// 슬라이드 XML을 파싱해 placeholder만 실제 값으로 치환한다.
// 폰트·색상·레이아웃 등 서식이 100% 원본 그대로 보존된다.

// 장표 레이아웃 메타 (원본 PPT의 슬라이드 파일명 + 카드 배치 매핑)
const PHOTO_LAYOUT_META = {
  2: { file: 'ppt/slides/slide1.xml', rows: 1, cols: 2, orderIndexToSlot: [1, 2],          titleLabel: '2인장표' },
  4: { file: 'ppt/slides/slide2.xml', rows: 2, cols: 2, orderIndexToSlot: [1, 2, 3, 4],    titleLabel: '4인장표' },
  6: { file: 'ppt/slides/slide3.xml', rows: 2, cols: 3, orderIndexToSlot: [1, 4, 5, 6, 2, 3], titleLabel: '6인장표' },
  9: { file: 'ppt/slides/slide4.xml', rows: 3, cols: 3, orderIndexToSlot: [1, 2, 3, 6, 9, 4, 5, 7, 8], titleLabel: '9인장표' },
}

// ── 템플릿별 슬롯 x/y 경계 (EMU 단위, 분석된 실제 좌표 기반) ──────────────
// sp 중앙점(x+cx/2, y+cy/2)이 어느 col/row 구간에 속하는지 판별
// 반환: 0-based 슬롯 인덱스 (row * cols + col), 판별 불가 시 -1
const SLOT_BOUNDARIES = {
  // 2인: 1행 2열 — x 경계 4,700,000
  2: { colBounds: [4_700_000], rowBounds: [] },
  // 4인: 2행 2열 — x 경계 5,000,000 / y 경계 3,500,000
  4: { colBounds: [5_000_000], rowBounds: [3_500_000] },
  // 6인: 2행 3열 — x 경계 2,700,000 / 5,400,000 / y 경계 3,060,000
  6: { colBounds: [2_700_000, 5_400_000], rowBounds: [3_060_000] },
  // 9인: 3행 3열 — x 경계 2,500,000 / 5,500,000
  //   y 경계: row0 [주요이력] bottom(2,127,624) ~ row1 [분야] top(2,983,452) 중간값 → 2,555,538
  //            row1 [주요이력] bottom(3,842,662) ~ row2 [분야] top(4,689,625) 중간값 → 4,266,143
  9: { colBounds: [2_500_000, 5_500_000], rowBounds: [2_555_538, 4_266_143] },
}

// sp 요소 하나를 받아 0-based 슬롯 인덱스 반환 (sp 자체 좌표 사용)
function getSpSlotIndex(sp, size) {
  const bounds = SLOT_BOUNDARIES[size]
  if (!bounds) return -1
  // sp 직속 spPr > xfrm > off/ext 읽기
  const spPr = sp.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'spPr')[0]
    || sp.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'spPr')[0]
  // spPr이 p:spPr인 경우도 처리
  let xfrm = null
  for (const ns of [
    'http://schemas.openxmlformats.org/presentationml/2006/main',
    'http://schemas.openxmlformats.org/drawingml/2006/main',
  ]) {
    const pr = sp.getElementsByTagNameNS(ns, 'spPr')[0]
    if (pr) { xfrm = pr.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'xfrm')[0]; if (xfrm) break }
  }
  if (!xfrm) return -1
  const off = xfrm.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'off')[0]
  const ext = xfrm.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'ext')[0]
  if (!off || !ext) return -1
  const cx = +off.getAttribute('x') + +ext.getAttribute('cx') / 2  // 중앙 x
  const cy = +off.getAttribute('y') + +ext.getAttribute('cy') / 2  // 중앙 y
  const col = bounds.colBounds.filter(b => cx >= b).length
  const row = bounds.rowBounds.filter(b => cy >= b).length
  const cols = bounds.colBounds.length + 1
  return row * cols + col
}

// 행 우선 슬롯 채움 순서 (위쪽 행부터 왼→오른쪽으로 채운 뒤 다음 행)
// 예) 3×3: [1,2,3, 4,5,6, 7,8,9] → 빈 슬롯이 항상 마지막 행 오른쪽에 위치
function computeFillOrder(rows, cols) {
  const order = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push(r * cols + c + 1)
  return order
}

// 신규 슬라이드용 관계 XML (slideLayout6.xml 참조 고정)
const PHOTO_SLIDE_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout6.xml"/>'
  + '</Relationships>'

// PHOTO_CATS 라벨 → 슬라이드 제목 매핑 (하위 호환용, 현재 buildPhotoPptxFromTemplate에선 미사용)
const PHOTO_CAT_TITLES = {
  audit:    '감리원',
  core:     '핵심기술 전문가',
  required: '필수기술 전문가',
  security: '보안진단 전문가',
  tester:   '테스터',
}

// ── buildPhotoPptxFromTemplate ──────────────────────────────────
// ── buildPhotoPptxFromTemplate (A안) ────────────────────────────
// pages = [{
//   sheetSize: 2|4|6|9,
//   slotPeople: { slotNum: { name, field, grade, profile:{...} } }
// }]
// templateZips = { 2: JSZip, 4: JSZip, 6: JSZip, 9: JSZip }
//   — DB에서 로드한 PERSON_2/4/6/9 각각의 ZIP 객체
//   — 각 ZIP의 첫 번째 슬라이드(slide1.xml)를 템플릿으로 사용
// → 최종 합본 JSZip 반환
async function buildPhotoPptxFromTemplate(pages, templateZips) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip을 찾을 수 없습니다.')
  if (!templateZips) throw new Error('templateZips가 없습니다. PERSON_2/4/6/9 템플릿을 업로드하세요.')

  // 각 size별 ZIP에서 첫 번째 슬라이드 XML 미리 읽기
  // ZIP 안 슬라이드 목록을 presentation.xml.rels에서 순서대로 파악
  async function getFirstSlideXml(tplZip) {
    const presRels = await tplZip.file('ppt/_rels/presentation.xml.rels').async('string')
    const matches = [...presRels.matchAll(/Target="slides\/(slide\d+\.xml)"/g)]
    if (!matches.length) throw new Error('슬라이드를 찾을 수 없습니다.')
    // presentation.xml에서 sldIdLst 순서로 첫 번째 슬라이드 결정
    const presXml = await tplZip.file('ppt/presentation.xml').async('string')
    const idOrder = [...presXml.matchAll(/r:id="(rId\d+)"/g)].map(m => m[1])
    const relMap = {}
    for (const m of [...presRels.matchAll(/Id="(rId\d+)"[^>]*Target="slides\/(slide\d+\.xml)"/g)]) {
      relMap[m[1]] = m[2]
    }
    const firstFile = idOrder.map(rid => relMap[rid]).find(f => f) || matches[0][1]
    return {
      xml:  await tplZip.file(`ppt/slides/${firstFile}`).async('string'),
      file: firstFile,
    }
  }

  // size → { xml, tplZip } 맵 (없는 사이즈는 PERSON_2 fallback)
  const templateData = {}
  for (const size of [2, 4, 6, 9]) {
    const tplZip = templateZips[size] || templateZips[2]
    if (!tplZip) throw new Error('PERSON_2 템플릿이 업로드되지 않았습니다.')
    const { xml, file } = await getFirstSlideXml(tplZip)
    templateData[size] = { xml, file, zip: tplZip }
  }

  // ── 기본 placeholder 이미지(홍길동) 추출: PERSON_2 템플릿 첫 번째 pic의 이미지 ──
  // NAS 사진이 없는 슬롯에 9인/4인/6인 템플릿 고유 placeholder(ISMSP 로고 등) 대신
  // 2인 템플릿의 홍길동 이미지를 표시하기 위해 미리 추출해 둔다.
  let defaultPhotoBuffer = null
  try {
    const tpl2 = templateZips[2]
    const { xml: xml2, file: file2 } = templateData[2]
    const relsPath2 = `ppt/slides/_rels/${file2}.rels`
    const relsXml2 = await tpl2.file(relsPath2).async('string')
    // 슬라이드 XML에서 첫 번째 pic > blipFill > blip의 r:embed 추출
    const doc2 = new DOMParser().parseFromString(xml2, 'application/xml')
    const P_NS2 = 'http://schemas.openxmlformats.org/presentationml/2006/main'
    const R_NS2 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const spTree2 = doc2.getElementsByTagNameNS(P_NS2, 'spTree')[0]
    // 재귀로 첫 번째 pic 탐색
    function findFirstPic(node) {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType !== 1) continue
        if (c.localName === 'pic') return c
        const found = findFirstPic(c)
        if (found) return found
      }
      return null
    }
    const pic2 = spTree2 ? findFirstPic(spTree2) : null
    if (pic2) {
      // blip 탐색
      function findBlip(node) {
        for (const c of Array.from(node.childNodes)) {
          if (c.nodeType !== 1) continue
          if (c.localName === 'blip') return c
          const found = findBlip(c)
          if (found) return found
        }
        return null
      }
      const blip2 = findBlip(pic2)
      if (blip2) {
        let rid2 = blip2.getAttributeNS(R_NS2, 'embed') || blip2.getAttribute('r:embed')
        if (!rid2) {
          const m2 = new XMLSerializer().serializeToString(blip2).match(/:embed="([^"]+)"/)
          if (m2) rid2 = m2[1]
        }
        if (rid2) {
          // rels에서 rId → Target 경로 추출
          const relM = relsXml2.match(new RegExp(`Id="${rid2}"[^>]*Target="([^"]+)"`))
          if (relM) {
            const imgPath = ('ppt/slides/' + relM[1]).replace(/\/[^/]+\/\.\.\//g, '/')
            const imgFile = tpl2.file(imgPath)
            if (imgFile) {
              defaultPhotoBuffer = await imgFile.async('arraybuffer')
              console.log('[PhotoPptx] 기본 placeholder 이미지 추출 성공:', imgPath, `(${defaultPhotoBuffer.byteLength} bytes)`)
            }
          }
        }
      }
    }
    if (!defaultPhotoBuffer) console.warn('[PhotoPptx] 기본 placeholder 이미지 추출 실패 — NAS 사진 없는 슬롯은 원본 placeholder 유지')
  } catch (e) {
    console.warn('[PhotoPptx] 기본 placeholder 추출 오류:', e)
  }

  // ── 합본용 베이스 ZIP: PERSON_2 ZIP을 기반으로 사용 ──────────
  // (마스터/테마/레이아웃은 PERSON_2 것을 그대로 유지)
  const baseZip = templateZips[2]
  let presXml     = await baseZip.file('ppt/presentation.xml').async('string')
  let presRelsXml = await baseZip.file('ppt/_rels/presentation.xml.rels').async('string')
  let ctXml       = await baseZip.file('[Content_Types].xml').async('string')

  // 기존 슬라이드 모두 제거 (마스터/레이아웃은 유지)
  presXml     = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '<p:sldIdLst></p:sldIdLst>')
  presRelsXml = presRelsXml.replace(/<Relationship\b[^/]*Type="[^"]*\/slide"[^/]*\/>/g, '')
  ctXml       = ctXml.replace(/<Override[^>]*presentationml\.slide\+xml[^>]*\/>/g, '')

  let maxRid   = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid   = Math.max(maxRid,   +n); return _ })
  let maxSldId = 255; presXml.replace(/<p:sldId id="(\d+)"/g, (_, n) => { maxSldId = Math.max(maxSldId, +n); return _ })
  // baseZip의 기존 미디어 파일 인덱스 파악 → 충돌 없는 새 이름 생성용
  // 새 슬라이드 이미지는 image_gsN 이름으로 저장 (기존 imageN 파일과 이름 충돌 방지)
  let maxMediaIdx = 0
  Object.keys(baseZip.files).forEach(k => {
    const m = k.match(/^ppt\/media\/image(?:_gs)?(\d+)\./i)
    if (m) maxMediaIdx = Math.max(maxMediaIdx, +m[1])
  })

  let newRels = '', newIds = '', newCt = ''

  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'

  // ── slideLayout 참조 보존: 원본 슬라이드의 .rels에서 꺼냄 ──
  async function getSlideLayoutRel(tplZip, slideFile) {
    const relsPath = `ppt/slides/_rels/${slideFile}.rels`
    const relsFile = tplZip.file(relsPath)
    if (relsFile) return await relsFile.async('string')
    // 없으면 기본 fallback
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout6.xml"/>'
      + '</Relationships>'
  }

  function shapeXfrm(sp) {
    const spPr = sp.getElementsByTagNameNS(P_NS, 'spPr')[0]
    if (!spPr) return null
    const xfrm = spPr.getElementsByTagNameNS(A_NS, 'xfrm')[0]
    if (!xfrm) return null
    const off = xfrm.getElementsByTagNameNS(A_NS, 'off')[0]
    const ext = xfrm.getElementsByTagNameNS(A_NS, 'ext')[0]
    if (!off || !ext) return null
    return { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy') }
  }

  // ── IT경력 컬러런 치환 ─────────────────────────────────────────
  // 전략: replaceLabelInParagraphNorm으로 [IT경력] → 첫 줄 텍스트 치환 후
  //       나머지 줄은 <a:br>+런으로 뒤에 추가, 각 런에 색상 서식 적용
  // 색상 규칙:
  //   1행: [ 키워드 ] → #1655A2, 나머지 → #E60012
  //   2행: [ 키워드 ] → #1655A2, 나머지 → #1655A2
  //   3행~: [ 키워드 ] → #1655A2, 나머지 → #404040
  function replaceItCareerWithColorRuns(pEl, label, value) {
    if (!value) {
      replaceLabelInParagraphNorm(pEl, label, '')
      return
    }

    const lines = value.split('\n').filter(l => l.trim())
    if (!lines.length) {
      replaceLabelInParagraphNorm(pEl, label, '')
      return
    }

    // ① [IT경력] → 첫 줄 텍스트로 치환 (기존 런 구조 보존)
    replaceLabelInParagraphNorm(pEl, label, lines[0])

    // ② 치환 후 단락의 모든 런 수집 (기준 서식용)
    const allRuns = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
    const baseRun = allRuns[0]
    const baseRPr = baseRun ? baseRun.getElementsByTagNameNS(A_NS, 'rPr')[0] : null
    const doc = pEl.ownerDocument

    function makeSolidFill(hexColor) {
      const solidFill = doc.createElementNS(A_NS, 'a:solidFill')
      const srgbClr   = doc.createElementNS(A_NS, 'a:srgbClr')
      srgbClr.setAttribute('val', hexColor)
      solidFill.appendChild(srgbClr)
      return solidFill
    }

    function makeRun(text, hexColor) {
      const r   = doc.createElementNS(A_NS, 'a:r')
      const rPr = doc.createElementNS(A_NS, 'a:rPr')
      if (baseRPr) {
        Array.from(baseRPr.attributes).forEach(attr => rPr.setAttribute(attr.name, attr.value))
        Array.from(baseRPr.childNodes).forEach(child => {
          if (child.localName !== 'solidFill') rPr.appendChild(child.cloneNode(true))
        })
      }
      rPr.appendChild(makeSolidFill(hexColor))
      const t = doc.createElementNS(A_NS, 'a:t')
      t.textContent = text
      r.appendChild(rPr)
      r.appendChild(t)
      return r
    }

    function makeBr() {
      const br   = doc.createElementNS(A_NS, 'a:br')
      const brPr = doc.createElementNS(A_NS, 'a:rPr')
      if (baseRPr) Array.from(baseRPr.attributes).forEach(attr => brPr.setAttribute(attr.name, attr.value))
      br.appendChild(brPr)
      return br
    }

    // ③ 첫 줄 런에 색상 적용
    function applyColorToLine(lineRuns, lineIdx) {
      // lineRuns: 해당 줄에 속하는 런 배열
      // 첫 런의 텍스트가 [ xxx ] 시작이면 키워드 색, 나머지 런은 rest 색
      const kwColor   = '1655A2'
      const restColor = lineIdx === 0 ? 'E60012' : lineIdx === 1 ? '1655A2' : '404040'
      // 전체 텍스트 concat으로 키워드 분리
      const fullText = lineRuns.map(r => {
        const t = r.getElementsByTagNameNS(A_NS, 't')[0]
        return t ? t.textContent : ''
      }).join('')
      const bracketEnd = fullText.indexOf(']')
      if (bracketEnd !== -1 && fullText.startsWith('[')) {
        // 키워드 부분과 나머지 부분을 런 2개로 교체
        const kwText   = fullText.slice(0, bracketEnd + 1)
        const restText = fullText.slice(bracketEnd + 1)
        // 기존 런 제거 후 새 런 삽입
        const parent = lineRuns[0].parentNode
        const anchor = lineRuns[lineRuns.length - 1].nextSibling
        lineRuns.forEach(r => parent.removeChild(r))
        if (kwText)   parent.insertBefore(makeRun(kwText,   kwColor),   anchor)
        if (restText) parent.insertBefore(makeRun(restText, restColor), anchor)
      } else {
        // 키워드 없음 — 전체 rest 색
        lineRuns.forEach(r => {
          const rPr = r.getElementsByTagNameNS(A_NS, 'rPr')[0]
          if (rPr) {
            const existing = rPr.getElementsByTagNameNS(A_NS, 'solidFill')[0]
            if (existing) rPr.removeChild(existing)
            rPr.appendChild(makeSolidFill(restColor))
          }
        })
      }
    }

    // 첫 줄: 치환 후 존재하는 모든 런이 첫 줄
    applyColorToLine(Array.from(pEl.getElementsByTagNameNS(A_NS, 'r')), 0)

    // ④ 나머지 줄: <a:br> + 런 추가
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const bracketEnd = line.indexOf(']')
      const restColor  = i === 1 ? '1655A2' : '404040'
      const kwColor    = '1655A2'
      pEl.appendChild(makeBr())
      if (bracketEnd !== -1 && line.startsWith('[')) {
        pEl.appendChild(makeRun(line.slice(0, bracketEnd + 1), kwColor))
        if (line.slice(bracketEnd + 1)) pEl.appendChild(makeRun(line.slice(bracketEnd + 1), restColor))
      } else {
        pEl.appendChild(makeRun(line, restColor))
      }
    }
  }

  // ── 런(run) 분산 placeholder 치환 엔진 ──────────────────────────
  // PPTX XML에서 [분야], [이름] 등이 여러 <a:r> 런에 분산될 수 있음
  // 예: <a:r>[</a:r><a:r>이름</a:r><a:r>]</a:r>
  //     <a:r>[ </a:r><a:r>감리이력</a:r><a:r>1 ]</a:r>
  //     <a:r>[IT</a:r><a:r>경력기간</a:r><a:r>]</a:r>
  // 접근: 단락(<a:p>) 내 모든 런의 텍스트를 이어붙여 [xxx] 찾고,
  //       해당 범위 런들을 첫 번째 런에 value로 합치고 나머지 런 제거

  // 단락 내 런 배열의 연결 텍스트에서 label 위치 찾기
  function findLabelInRuns(runs, label) {
    // runs: Array of {el, text} — <a:r> 요소와 텍스트
    const concat = runs.map(r => r.text).join('')
    let idx = -1
    while (true) {
      idx = concat.indexOf(label, idx + 1)
      if (idx === -1) break
      // label이 끝난 뒤가 다음 placeholder 시작이거나 공백이어야 노이즈 제거
      const after = concat[idx + label.length]
      if (after === undefined || after === ' ' || after === '[' || after === '\n') {
        return { concat, startIdx: idx, endIdx: idx + label.length }
      }
      // label이 더 긴 placeholder의 부분인 경우 skip (예: [이름] vs [이름없음])
    }
    // 마지막 시도: 정확히 끝
    idx = concat.lastIndexOf(label)
    if (idx !== -1 && concat.slice(idx) === label) {
      return { concat, startIdx: idx, endIdx: idx + label.length }
    }
    return null
  }

  // 단락의 런들에서 label을 찾아 value로 치환 (분산 런 포함)
  // 반환값: 치환 성공한 횟수
  function replaceLabelInParagraph(pEl, label, value) {
    const runs = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
    if (!runs.length) return 0
    const runData = runs.map(r => {
      const tEl = r.getElementsByTagNameNS(A_NS, 't')[0]
      return { el: r, tEl, text: tEl ? tEl.textContent : '' }
    })
    const concat = runData.map(r => r.text).join('')
    // 모든 occurrence 치환 (같은 단락에 같은 placeholder 여러 개 가능)
    let count = 0
    let searchFrom = 0
    while (true) {
      const pos = concat.indexOf(label, searchFrom)
      if (pos === -1) break
      searchFrom = pos + label.length

      // label이 걸쳐있는 런 범위 찾기
      let charAccum = 0
      let startRunIdx = -1, endRunIdx = -1
      let startCharInRun = 0, endCharInRun = 0
      for (let ri = 0; ri < runData.length; ri++) {
        const rLen = runData[ri].text.length
        if (startRunIdx === -1 && charAccum + rLen > pos) {
          startRunIdx = ri
          startCharInRun = pos - charAccum
        }
        if (endRunIdx === -1 && charAccum + rLen >= pos + label.length) {
          endRunIdx = ri
          endCharInRun = (pos + label.length) - charAccum
          break
        }
        charAccum += rLen
      }
      if (startRunIdx === -1 || endRunIdx === -1) break

      // startRun의 텍스트에서 label 이전 부분만 남기고 value 설정
      const startRun = runData[startRunIdx]
      const before = startRun.text.slice(0, startCharInRun)
      const afterEnd = runData[endRunIdx].text.slice(endCharInRun)

      if (startRunIdx === endRunIdx) {
        // 같은 런 안에 있는 경우
        if (startRun.tEl) startRun.tEl.textContent = before + value + afterEnd
      } else {
        // 여러 런에 걸친 경우: startRun에 value, 중간 런들 제거, endRun에 after
        if (startRun.tEl) startRun.tEl.textContent = before + value
        for (let ri = startRunIdx + 1; ri < endRunIdx; ri++) {
          if (runData[ri].el.parentNode) runData[ri].el.parentNode.removeChild(runData[ri].el)
        }
        if (endRunIdx > startRunIdx && runData[endRunIdx].tEl) {
          runData[endRunIdx].tEl.textContent = afterEnd
          if (!afterEnd && runData[endRunIdx].el.parentNode) {
            runData[endRunIdx].el.parentNode.removeChild(runData[endRunIdx].el)
          }
        }
      }
      count++
      // runData 갱신 (제거된 런 반영)
      break  // 단락당 1회 치환 (카드 분리는 단락 단위로 처리됨)
    }
    return count
  }

  // xmlDoc 전체에서 label을 모두 찾아 value로 치환 (공백 정규화 매칭)
  function replaceAllLabels(xmlDoc, label, value) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    let count = 0
    paras.forEach(p => { count += replaceLabelInParagraphNorm(p, label, value) })
    return count
  }

  // 제목 단락 치환: 장표 크기별 실제 placeholder 텍스트(예: '9인장표')를 찾아
  // titleText로 치환하고, totalPages >= 2 이면 뒤에 16pt " (pageNum/totalPages)" 런 추가.
  // titleLabel: PHOTO_LAYOUT_META의 titleLabel 값 (예: '9인장표')
  function replaceTitleLabel(xmlDoc, titleText, pageNum, totalPages, titleLabel) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    // 탐색 후보: titleLabel(공백제거)을 포함하는 단락 또는 '[제목]' 포함 단락(하위 호환)
    const candidates = titleLabel
      ? [titleLabel.replace(/\s+/g, ''), '[제목]']
      : ['[제목]']

    for (const pEl of paras) {
      const runs = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
      if (!runs.length) continue
      const concat = runs.map(r => {
        const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : ''
      }).join('').replace(/\s+/g, '')

      // 후보 중 하나라도 포함하면 제목 단락으로 인식
      const matchedLabel = candidates.find(c => concat.includes(c))
      if (!matchedLabel) continue

      // 1) placeholder → titleText 치환 (기존 런 서식 유지)
      // titleLabel은 공백 포함 원본 형태로 치환 (예: '9인장표' → 공백 정규화 매칭)
      const labelToReplace = (titleLabel && concat.includes(titleLabel.replace(/\s+/g, '')))
        ? titleLabel
        : '[제목]'
      replaceLabelInParagraphNorm(pEl, labelToReplace, titleText)

      // 2) totalPages >= 2 이면 뒤에 16pt (pageNum/totalPages) 런 추가
      if (totalPages >= 2) {
        // 마지막 런을 복제해 서식 참조
        const lastRun = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r')).pop()
        if (!lastRun) continue

        const numRun = lastRun.cloneNode(true)
        // 텍스트 설정
        const numT = numRun.getElementsByTagNameNS(A_NS, 't')[0]
        if (numT) numT.textContent = ' (' + pageNum + '/' + totalPages + ')'

        // rPr 가져오거나 생성 후 sz=1600(16pt) 설정
        let rPr = numRun.getElementsByTagNameNS(A_NS, 'rPr')[0]
        if (!rPr) {
          rPr = xmlDoc.createElementNS(A_NS, 'a:rPr')
          numRun.insertBefore(rPr, numRun.firstChild)
        }
        rPr.setAttribute('sz', '1600')
        // 기존 b(볼드) 속성은 유지, 별도 제거 불필요

        pEl.appendChild(numRun)
      }
      break // 제목은 슬라이드당 1개
    }
  }

  // 슬라이드에서 label이 몇 번 등장하는지 카운트
  function countLabel(xmlDoc, label) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    let count = 0
    paras.forEach(p => {
      const concat = Array.from(p.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('')
      let idx = -1
      while ((idx = concat.indexOf(label, idx + 1)) !== -1) count++
    })
    return count
  }

  // N번째(0-indexed) occurrence의 단락 반환
  function getParagraphOfOccurrence(xmlDoc, label, occIdx) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    let found = 0
    for (const p of paras) {
      const concat = Array.from(p.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('')
      if (concat.includes(label)) {
        if (found === occIdx) return p
        found++
      }
    }
    return null
  }

  // [이름] 단락 기준으로 카드 슬롯 인덱스 반환 (슬라이드 내 등장 순서, 공백 정규화 매칭)
  function getNameParaOccurrences(xmlDoc) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    const result = []
    paras.forEach((p, pi) => {
      const concat = Array.from(p.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('').replace(/\s+/g, '')
      if (concat.includes('[이름]')) result.push({ para: p, paraIdx: pi })
    })
    return result
  }

  // 공백 정규화 치환 엔진: 런 concat을 공백 제거 후 label(공백 제거)을 탐색,
  // 실제로는 원본 런에서 해당 범위를 찾아 value로 치환
  // 예: "[ 감리이력1 ]" → normLabel("[감리이력1]")으로 위치를 찾되,
  //     실제 런 범위를 공백 포함 원본 기준으로 계산하여 제거
  function replaceLabelInParagraphNorm(pEl, label, value) {
    const runs = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
    if (!runs.length) return 0
    const runData = runs.map(r => {
      const tEl = r.getElementsByTagNameNS(A_NS, 't')[0]
      return { el: r, tEl, text: tEl ? tEl.textContent : '' }
    })

    // 원본 concat과 공백제거 concat을 모두 계산
    const origConcat = runData.map(r => r.text).join('')
    const normConcat = origConcat.replace(/\s+/g, '')
    const normLabelStr = label.replace(/\s+/g, '')

    // 정규화 concat에서 label 위치 탐색
    const normPos = normConcat.indexOf(normLabelStr)
    if (normPos === -1) return 0

    // 정규화 위치 → 원본 concat 위치로 역매핑
    // normConcat[i]는 origConcat에서 공백 제거 후의 i번째 문자
    // origPos: normConcat의 normPos번째 비공백 문자가 origConcat의 몇 번째인지
    let normIdx = 0, origStart = -1, origEnd = -1
    for (let oi = 0; oi < origConcat.length; oi++) {
      if (!/\s/.test(origConcat[oi])) {
        if (normIdx === normPos) origStart = oi
        if (normIdx === normPos + normLabelStr.length - 1) { origEnd = oi + 1; break }
        normIdx++
      }
    }
    // origEnd가 끝 공백까지 포함하도록 확장 ("]" 뒤 공백 포함)
    if (origEnd === -1) return 0

    // 원본 concat 위치 → 런 인덱스 매핑
    let charAccum = 0
    let startRunIdx = -1, endRunIdx = -1
    let startCharInRun = 0, endCharInRun = 0
    for (let ri = 0; ri < runData.length; ri++) {
      const rLen = runData[ri].text.length
      if (startRunIdx === -1 && charAccum + rLen > origStart) {
        startRunIdx = ri
        startCharInRun = origStart - charAccum
      }
      if (endRunIdx === -1 && charAccum + rLen >= origEnd) {
        endRunIdx = ri
        endCharInRun = origEnd - charAccum
        break
      }
      charAccum += rLen
    }
    if (startRunIdx === -1 || endRunIdx === -1) return 0

    const startRun = runData[startRunIdx]
    const before = startRun.text.slice(0, startCharInRun)
    const afterEnd = runData[endRunIdx].text.slice(endCharInRun)

    if (startRunIdx === endRunIdx) {
      if (startRun.tEl) startRun.tEl.textContent = before + value + afterEnd
    } else {
      if (startRun.tEl) startRun.tEl.textContent = before + value
      for (let ri = startRunIdx + 1; ri < endRunIdx; ri++) {
        if (runData[ri].el.parentNode) runData[ri].el.parentNode.removeChild(runData[ri].el)
      }
      if (runData[endRunIdx].tEl) {
        runData[endRunIdx].tEl.textContent = afterEnd
        if (!afterEnd && runData[endRunIdx].el.parentNode) {
          runData[endRunIdx].el.parentNode.removeChild(runData[endRunIdx].el)
        }
      }
    }
    return 1
  }

  // ── 슬라이드 생성 루프 ──────────────────────────────────────────
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const size = page.sheetSize
    const { xml: tplXml, file: tplFile, zip: tplZip } = templateData[size]
    const meta = PHOTO_LAYOUT_META[size]
    const fname = `photoSlide${i + 1}.xml`

    const xmlDoc = new DOMParser().parseFromString(tplXml, 'application/xml')
    const spTree = xmlDoc.getElementsByTagNameNS(P_NS, 'spTree')[0]
    // sp, cxnSp, pic, grpSp 모두 포함 (카드 삭제 대상에 pic도 포함)
    const shapeEls = Array.from(spTree.childNodes).filter(n => n.nodeType === 1 &&
      (n.localName === 'sp' || n.localName === 'cxnSp' || n.localName === 'pic' || n.localName === 'grpSp'))

    // 장표 밖의 예시 객체는 슬롯 분류와 빈 슬롯 삭제에서 제외한다.
    const slideSizeDoc = new DOMParser().parseFromString(await tplZip.file('ppt/presentation.xml').async('string'), 'application/xml');
    const slideSize = slideSizeDoc.getElementsByTagNameNS(P_NS, 'sldSz')[0];
    const width = +slideSize.getAttribute('cx'), height = +slideSize.getAttribute('cy');
    const inSlide = b => b && b.x >= 0 && b.y >= 0 && b.x < width && b.y < height;
    // ── sp 좌표 캐시 (shapeXfrm 기반) ──
    const xfrmOf = new Map()
    shapeEls.forEach(el => {
      const xf = shapeXfrm(el)
      if (xf) xfrmOf.set(el, xf)
    })

    // ── 슬롯별 shape 귀속: sp 좌측 x / 상단 y 기준으로 슬롯 인덱스 결정 ──
    // center_x 사용 시 [주요이력] sp(폭이 col 경계를 넘어감)가 인접 슬롯으로 오귀속됨
    // center_y 사용 시 [키워드][사업명] sp(y 자체가 row 경계 아래)가 다음 row로 오귀속됨
    // → x: sp 좌측 좌표, y: sp 상단 좌표로 판별하면 9인 장표 36개 shape 모두 정상 귀속
    const N = meta.rows * meta.cols
    const bounds = SLOT_BOUNDARIES[size]
    // slotShapes[slotIdx] = 해당 슬롯에 속하는 shape 요소 배열
    const slotShapes = Array.from({ length: N }, () => [])
    shapeEls.forEach(el => {
      const xf = xfrmOf.get(el)
      if (!inSlide(xf) || !bounds) return
      const col = bounds.colBounds.filter(b => xf.x >= b).length  // 좌측 x 기준
      const row = bounds.rowBounds.filter(b => xf.y >= b).length  // 상단 y 기준
      const cols = bounds.colBounds.length + 1
      const si = row * cols + col
      if (si >= 0 && si < N) slotShapes[si].push(el)
    })

    // 이름 플레이스홀더 옆의 증명사진만 교체 대상으로 확정한다.
    // 그룹 내부 좌표는 장표 좌표와 다르므로 추정하지 않는다.
    // 후보가 없거나 여러 개면 다른 슬롯/작업용 그림으로 보충하지 않는다.
    function getAllPics(root) {
      const pics = []
      function walk(node) {
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType !== 1) continue
          if (child.localName === 'pic') pics.push(child)
          else walk(child)
        }
      }
      walk(root)
      return pics
    }
    // 등록된 2/4/6/9인 양식의 이름-사진 간격 허용 범위(EMU).
    const slotPicEl = Array.from({ length: N }, () => null);
    for (let si = 0; si < N; si++) {
      const anchors = slotShapes[si].filter(e => e.localName === 'sp' && Array.from(e.getElementsByTagNameNS(A_NS, 't')).map(t => t.textContent).join('').replace(/\s+/g, '').includes('[이름]'));
      if (anchors.length !== 1) continue;
      const b = shapeXfrm(anchors[0]);
      const candidates = getAllPics(spTree).filter(pic => {
        if (pic.parentNode !== spTree) return false;
        const q = shapeXfrm(pic);
        return inSlide(q) && q.x + q.w <= width && q.y + q.h <= height
          && q.x + q.w <= b.x + 50000 && b.x - q.x - q.w < 300000 && Math.abs(q.y - b.y) < 200000;
      });
      if (candidates.length === 1) slotPicEl[si] = candidates[0];
    }

    // ── 라벨 매칭 헬퍼 ──
    function normLabel(s) { return s.replace(/\s+/g, '') }
    function paraMatchesLabel(pEl, label) {
      const concat = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('')
      return concat.replace(/\s+/g, '').includes(normLabel(label))
    }

    const ALL_LABELS = [
      '[분야]', '[이름]', '[감리원등급]', '[자격구분]', '[자격요약]',
      '[감리횟수]', '[자격수]', '[감리경력]', '[IT경력기간]', '[IT경력]', '[주요이력]',
    ]
    for (let ri = 1; ri <= 10; ri++) ALL_LABELS.push('[감리이력' + ri + ']')

    // ── 슬롯별 라벨→단락 맵 사전 수집 ──
    // preFetchedParasBySlot[slotIdx][label] = 단락 (단일) 또는 null
    // 단, [키워드]/[사업명]은 sp 하나에 행별 단락이 모여있으므로
    //   → '_jeokRows': 해당 sp의 모든 단락 배열 (행 인덱스로 접근)
    // 슬롯 sp 스코프로 수집하므로 다른 슬롯 단락과 절대 섞이지 않음
    const preFetchedParasBySlot = Array.from({ length: N }, (_, si) => {
      const labelMap = {}

      // ① _jeokRows / _jeokFormat 탐지를 먼저 수행
      // → [분야] ALL_LABELS 탐색 시 이력 sp를 제외해야 하므로 순서 중요
      // → '_jeokFormat': 'keyword'([키워드] 형식) | 'domain'([분야] 형식)
      let jeokSp = null  // 이력 sp 참조 (중복 탐색 방지용)
      for (const el of slotShapes[si]) {
        if (el.localName !== 'sp') continue
        const paras = Array.from(el.getElementsByTagNameNS(A_NS, 'p'))
        const hasKwFormat = paras.some(p => paraMatchesLabel(p, '[키워드]'))
        const hasDomainFormat = paras.some(p => paraMatchesLabel(p, '[분야]'))
                             && paras.some(p => paraMatchesLabel(p, '[사업명]'))
        if (hasKwFormat || hasDomainFormat) {
          jeokSp = el
          labelMap['_jeokRows']   = paras
          labelMap['_jeokFormat'] = hasKwFormat ? 'keyword' : 'domain'
          break
        }
      }
      if (!labelMap['_jeokRows'])   labelMap['_jeokRows']   = null
      if (!labelMap['_jeokFormat']) labelMap['_jeokFormat'] = 'keyword'

      // ② ALL_LABELS 탐색 — domain 형식일 때 [분야]는 이력 sp(jeokSp) 제외하고 탐색
      // → 헤더 sp의 [분야] 단락만 labelMap['[분야]']에 저장
      ALL_LABELS.forEach(label => {
        for (const el of slotShapes[si]) {
          if (el.localName !== 'sp') continue
          // domain 형식의 [분야] 라벨: 이력 sp는 건너뜀 (헤더 sp만 탐색)
          if (label === '[분야]' && labelMap['_jeokFormat'] === 'domain' && el === jeokSp) continue
          const paras = Array.from(el.getElementsByTagNameNS(A_NS, 'p'))
          const found = paras.find(p => paraMatchesLabel(p, label))
          if (found) { labelMap[label] = found; break }
        }
        if (!labelMap[label]) labelMap[label] = null
      })

      return labelMap
    })

    // ── 슬롯→orderIndex 역매핑 (orderIndexToSlot[orderIdx] = 1-based slot) ──
    // slotIndexOf[1-based slot] = orderIdx (0-based)
    const slotIndexOf = {}
    meta.orderIndexToSlot.forEach((slot, oi) => { slotIndexOf[slot] = oi })

    // ── 미배정 슬롯 shape 삭제 ──
    // slotShapes[slotIdx] 단위로 삭제하므로 정확함
    for (let si = 0; si < N; si++) {
      const slot1 = si + 1  // 1-based slot
      if (page.slotPeople[slot1]) continue
      slotShapes[si].forEach(el => { if (el.parentNode) el.parentNode.removeChild(el) })
    }

    // ── 슬라이드 전체 [제목] 치환 ──
    replaceTitleLabel(xmlDoc, page.slideTitle || '', page.pageNum || 1, page.totalPages || 1, meta.titleLabel)

    // ── 슬롯별 치환 ──
    for (let si = 0; si < N; si++) {
      const slot1 = si + 1  // 1-based slot
      const person = page.slotPeople[slot1]
      if (!person) continue
      const pr = person.profile || {}
      const labelMap = preFetchedParasBySlot[si]

      // 단순 텍스트 치환 필드
      const directMap = {
        '[분야]':       person.field || '',
        '[이름]':       person.name  || '',
        '[감리원등급]':  person.grade || '',
        '[자격구분]':   pr.자격구분   || '',
        '[자격요약]':   pr.자격요약   || '',
        '[감리횟수]':   pr.감리횟수   != null ? String(pr.감리횟수)   : '',
        '[자격수]':     pr.자격수     != null ? String(pr.자격수)     : '',
        '[감리경력]':   pr.감리경력   || '',
        '[IT경력기간]': pr.IT경력기간 || '',
        '[주요이력]':   pr.주요이력   || '',
      }
      Object.entries(directMap).forEach(([label, value]) => {
        const para = labelMap[label]
        if (para) replaceLabelInParagraphNorm(para, label, value)
      })

      // [감리이력1]~[감리이력10] — 템플릿 서식 그대로 텍스트만 치환
      const 실적List = pr.실적 || []
      for (let ri = 1; ri <= 10; ri++) {
        const label = '[감리이력' + ri + ']'
        const para = labelMap[label]
        if (para) replaceLabelInParagraphNorm(para, label, 실적List[ri - 1] || '')
      }

      // [키워드] [사업명] 또는 [분야] [사업명] — sp 안 행별 단락에 실적 데이터 치환
      const jeokRows   = labelMap['_jeokRows']
      const jeokFormat = labelMap['_jeokFormat'] || 'keyword'
      if (jeokRows) {
        if (jeokFormat === 'domain') {
          // domain 형식: [분야] = "[ person.field ]" 형태로 삽입 (괄호 포함)
          //              [사업명] = rawLine에서 ] 이후 텍스트 (기관명, 사업명)
          const fieldValue = person.field ? '[ ' + person.field + ' ]' : ''
          jeokRows.forEach((para, rowIdx) => {
            const rawLine = 실적List[rowIdx] || ''
            if (!rawLine) {
              replaceLabelInParagraphNorm(para, '[분야]', '')
              replaceLabelInParagraphNorm(para, '[사업명]', '')
              return
            }
            // rawLine: "[ 기능점수 ] 한국지능정보사회진흥원, 혜택알리미..."
            // → [분야] = person.field("기능점수"), [사업명] = "] 이후 텍스트"
            const bracketEnd = rawLine.indexOf(']')
            const nm = bracketEnd !== -1
              ? rawLine.slice(bracketEnd + 1).trim()   // "한국지능정보사회진흥원, 혜택알리미..."
              : rawLine
            replaceLabelInParagraphNorm(para, '[분야]',  fieldValue)
            replaceLabelInParagraphNorm(para, '[사업명]', nm)
          })
        } else {
          // keyword 형식: [키워드] = rawLine의 [ ] 부분, [사업명] = ] 이후 텍스트
          jeokRows.forEach((para, rowIdx) => {
            const rawLine = 실적List[rowIdx] || ''
            if (!rawLine) {
              replaceLabelInParagraphNorm(para, '[키워드]', '')
              replaceLabelInParagraphNorm(para, '[사업명]', '')
              return
            }
            const bracketEnd = rawLine.indexOf(']')
            if (bracketEnd !== -1) {
              const kw = rawLine.slice(0, bracketEnd + 1).trim()
              const nm = rawLine.slice(bracketEnd + 1).trim()
              replaceLabelInParagraphNorm(para, '[키워드]', kw)
              replaceLabelInParagraphNorm(para, '[사업명]', nm)
            } else {
              replaceLabelInParagraphNorm(para, '[키워드]', '')
              replaceLabelInParagraphNorm(para, '[사업명]', rawLine)
            }
          })
        }
      }

      // [IT경력] — 줄마다 새 <a:p> 단락으로 삽입 (ENTER 개행)
      // itPara를 템플릿으로 복제 → 줄 수만큼 새 단락 생성 → 원본 단락 자리에 순서대로 삽입
      const itPara = labelMap['[IT경력]']
      if (itPara) {
        const itLines = (pr.IT경력 || '').split('\n').filter(l => l.trim())
        const itDoc   = itPara.ownerDocument
        const txBody  = itPara.parentNode

        // 기존 rPr 클론 (서식 기준용) — 내용 제거 전에 먼저 수집
        const baseRPr      = Array.from(itPara.getElementsByTagNameNS(A_NS, 'r'))[0]
                              ?.getElementsByTagNameNS(A_NS, 'rPr')[0] ?? null
        const baseRPrClone = baseRPr ? baseRPr.cloneNode(true) : null

        // pPr 클론 (단락 서식)
        const basePPr        = itPara.getElementsByTagNameNS(A_NS, 'pPr')[0] ?? null
        const basePPrClone   = basePPr ? basePPr.cloneNode(true) : null
        // endParaRPr 클론 — schemeClr 기반 기본색이 런 색을 override하므로 첫 런 rPr로 교체
        const baseEndRPr     = itPara.getElementsByTagNameNS(A_NS, 'endParaRPr')[0] ?? null
        const baseEndRPrClone = baseEndRPr ? baseEndRPr.cloneNode(true) : null

        function makeItPara(line) {
          const p = itDoc.createElementNS(A_NS, 'a:p')
          if (basePPrClone) p.appendChild(basePPrClone.cloneNode(true))
          if (line) {
            const r = itDoc.createElementNS(A_NS, 'a:r')
            if (baseRPrClone) r.appendChild(baseRPrClone.cloneNode(true))
            const t = itDoc.createElementNS(A_NS, 'a:t')
            t.textContent = line
            r.appendChild(t)
            p.appendChild(r)
          }
          // endParaRPr: schemeClr 제거하고 첫 런과 동일한 solidFill(1655A2) 적용
          if (baseEndRPrClone) {
            const epr = baseEndRPrClone.cloneNode(true)
            // schemeClr 기반 solidFill 제거
            Array.from(epr.getElementsByTagNameNS(A_NS, 'solidFill')).forEach(sf => {
              if (sf.parentNode === epr) epr.removeChild(sf)
            })
            // 첫 런 rPr의 solidFill 복사
            if (baseRPrClone) {
              const sf = baseRPrClone.getElementsByTagNameNS(A_NS, 'solidFill')[0]
              if (sf) epr.appendChild(sf.cloneNode(true))
            }
            p.appendChild(epr)
          }
          return p
        }

        // 원본 단락 위치 기준으로 새 단락들 삽입 후 원본 제거
        const anchor = itPara.nextSibling
        if (!itLines.length) {
          txBody.insertBefore(makeItPara(''), anchor)
        } else {
          itLines.forEach(line => {
            txBody.insertBefore(makeItPara(line), anchor)
          })
        }
        txBody.removeChild(itPara)
      }

      // ── 증명사진 교체: slotPicEl[si]의 origRid 등록 (DOM embed 직접 교체 방식) ──
      // NAS 사진이 있으면 NAS 사진, 없으면 defaultPhotoBuffer(홍길동)로 교체
      // → 9인/4인/6인 템플릿의 고유 placeholder(ISMSP 로고 등)를 홍길동으로 대체
      const photoForSlot = person.photoArrayBuffer || defaultPhotoBuffer
      if (photoForSlot) {
        const picEl = slotPicEl[si] || null
        if (picEl) {
          function findByLocalName(root, localName) {
            if (!root || !root.childNodes) return null
            for (const child of Array.from(root.childNodes)) {
              if (child.nodeType === 1 && child.localName === localName) return child
              const found = findByLocalName(child, localName)
              if (found) return found
            }
            return null
          }
          const blip = findByLocalName(picEl, 'blip')
          if (blip) {
            const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
            let origRid = blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed')
            if (!origRid) {
              const m = new XMLSerializer().serializeToString(blip).match(/:embed="([^"]+)"/)
              if (m) origRid = m[1]
            }

            if (origRid) {
              if (!page._picRidOverride) page._picRidOverride = {}
              if (!page._picRidPicMap)   page._picRidPicMap   = []

              const newPhotoRid = `_photo_si${si}`
              page._picRidOverride[newPhotoRid] = photoForSlot
              // picEl DOM 레퍼런스도 함께 저장 → 직렬화 후 해당 pic 블록 특정에 활용
              page._picRidPicMap.push({ origRid, newRid: newPhotoRid, picEl })

              // DOM에서 직접 embed 교체 시도 (setAttributeNS + setAttribute 둘 다)
              try { blip.setAttributeNS(R_NS, 'r:embed', newPhotoRid) } catch(_) {}
              try {
                // setAttribute로도 덮어쓰기 (DOMParser가 namespace를 flat하게 파싱한 경우)
                if (blip.getAttribute('r:embed')) blip.setAttribute('r:embed', newPhotoRid)
              } catch(_) {}
              const photoSrc = person.photoArrayBuffer ? 'NAS' : '기본(홍길동)'
              console.log(`[PhotoPptx] DOM embed 교체: si=${si} name=${person.name} src=${photoSrc} ${origRid} → ${newPhotoRid}`)
            }
          } else {
            console.warn(`[PhotoPptx] blip 못 찾음: si=${si} name=${person.name}`)
          }
        } else {
          console.warn(`[PhotoPptx] pic 요소 없음: si=${si} name=${person.name}`)
        }
      }
    }

    // ── 슬라이드 XML 저장 (rels rId 재번호매김 + 미디어 파일 복사) ──
    // 문제: 2인/6인/9인 템플릿이 같은 이름(image3.png 등)의 다른 이미지를 가짐
    //   → baseZip에 이미 있으면 복사 안 하면 엉뚱한 2인 이미지가 사용됨
    // 해결: 각 슬라이드의 이미지를 무조건 새 고유 이름(maxMediaIdx++)으로 복사
    //        rels의 Target도 새 이름으로 재작성 → 슬라이드 XML r:embed도 함께 재매핑
    const rawRelsXml = await getSlideLayoutRel(tplZip, tplFile)

    // 이미지 Target → 새 이름 매핑 테이블 구성
    // + _picRidOverride: 해당 rId의 원본 이미지를 NAS 증명사진으로 교체
    // ─────────────────────────────────────────────────────────────────
    // 수정: origTarget 기준 일괄 처리 → rId 기준 개별 처리
    //   여러 슬롯이 같은 ../media/imageX.png(origTarget)을 참조하더라도
    //   각 rId 마다 별도 png 파일을 생성하여 슬롯별 독립 교체를 보장
    // ─────────────────────────────────────────────────────────────────
    const targetRemap = {}  // oldRid → '../media/image_gsN.png'  (rId 기준)

    // 슬롯별 치환 때 기록된 { newRid → ArrayBuffer }
    const picRidOverride = page._picRidOverride || {}
    // 슬롯별 picEl 직렬화 기반 교체 맵: [{oldPicXml, newPicXml, origRid, newRid}]
    const picRidPicMap   = page._picRidPicMap   || []

    // ① picRidOverride에 있는 newRid마다 별도 png 파일 생성 (NAS 증명사진)
    for (const [newRid, arrayBuf] of Object.entries(picRidOverride)) {
      const pngIdx = ++maxMediaIdx
      const pngFileName = `ppt/media/image_gs${pngIdx}.png`
      baseZip.file(pngFileName, arrayBuf)
      targetRemap[newRid] = `../media/image_gs${pngIdx}.png`
      console.log('[PhotoPptx] 증명사진 저장: rId=', newRid, '→', pngFileName)
    }

    // ② 나머지 image rId(원본 placeholder)는 origTarget을 새 이름으로 복사
    const allRelEntries = [...rawRelsXml.matchAll(/<Relationship\b([^>]*)\/>/g)]
    const imageRels = allRelEntries
      .filter(m => /Type="[^"]*\/image"/.test(m[1]))
      .map(m => {
        const idM  = m[1].match(/\bId="([^"]+)"/)
        const tgtM = m[1].match(/\bTarget="([^"]+)"/)
        return idM && tgtM ? { id: idM[1], target: tgtM[1] } : null
      })
      .filter(Boolean)

    for (const rel of imageRels) {
      const { id: oldRid, target: origTarget } = rel
      if (targetRemap[oldRid]) continue  // 이미 NAS 사진으로 교체됨

      const ext = origTarget.replace(/.*\./, '.')
      const newIdx = ++maxMediaIdx
      const newFileName = `ppt/media/image_gs${newIdx}${ext}`
      targetRemap[oldRid] = `../media/image_gs${newIdx}${ext}`

      const origPath = ('ppt/slides/' + origTarget).replace(/\/[^/]+\/\.\.\//g, '/')
      const srcFile = tplZip.file(origPath)
      if (srcFile) {
        const bytes = await srcFile.async('arraybuffer')
        baseZip.file(newFileName, bytes)
      }
    }

    // rels: rId 재번호매김 + Target 교체
    const rIdMap = {}
    let remappedRelsXml = rawRelsXml.replace(
      /<Relationship\b([^>]*)\/>/g,
      (fullTag, attrs) => {
        const idM  = attrs.match(/\bId="([^"]+)"/)
        const tgtM = attrs.match(/\bTarget="([^"]+)"/)
        const oldId  = idM  ? idM[1]  : null
        const oldTgt = tgtM ? tgtM[1] : null

        const newId = `rId${++maxRid}`
        if (oldId) rIdMap[oldId] = newId

        let newTag = fullTag
        if (oldId) newTag = newTag.replace(`Id="${oldId}"`, `Id="${newId}"`)
        if (oldId && targetRemap[oldId] && oldTgt)
          newTag = newTag.replace(`Target="${oldTgt}"`, `Target="${targetRemap[oldId]}"`)
        return newTag
      }
    )

    // ③ _photo_si* 신규 rId → rels에 image Relationship 추가 + rIdMap 등록
    const IMAGE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
    for (const { newRid } of picRidPicMap) {
      if (!targetRemap[newRid]) continue
      const finalRid = `rId${++maxRid}`
      rIdMap[newRid] = finalRid
      remappedRelsXml = remappedRelsXml.replace(
        '</Relationships>',
        `<Relationship Id="${finalRid}" Type="${IMAGE_TYPE}" Target="${targetRemap[newRid]}"/></Relationships>`
      )
      console.log(`[PhotoPptx] rels 추가: ${newRid} → ${finalRid} Target=${targetRemap[newRid]}`)
    }

    // ④ XMLSerializer로 직렬화
    let slideXmlStr = new XMLSerializer().serializeToString(xmlDoc)

    // ⑤ 모든 rId → rIdMap으로 최종 교체 (_photo_si* → finalRid, 원본 rId → 재번호매김)
    slideXmlStr = slideXmlStr.replace(/\br:(embed|link|id)="([^"]+)"/g, (full, attr, oldId) =>
      rIdMap[oldId] ? `r:${attr}="${rIdMap[oldId]}"` : full
    )
    baseZip.file(`ppt/slides/${fname}`, slideXmlStr)
    baseZip.file(`ppt/slides/_rels/${fname}.rels`, remappedRelsXml)

    const rid = `rId${++maxRid}`
    const sldId = ++maxSldId
    newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${fname}"/>`
    newIds  += `<p:sldId id="${sldId}" r:id="${rid}"/>`
    newCt   += `<Override PartName="/ppt/slides/${fname}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  }

  presRelsXml = presRelsXml.replace('</Relationships>', newRels + '</Relationships>')
  presXml     = presXml.replace('</p:sldIdLst>',        newIds  + '</p:sldIdLst>')
  ctXml       = ctXml.replace('</Types>',               newCt   + '</Types>')
  baseZip.file('ppt/presentation.xml',          presXml)
  baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml)
  baseZip.file('[Content_Types].xml',            ctXml)
  return baseZip
}

// ── downloadPhotoAssignPptx ─────────────────────────────────────
// 체크리스트 설정을 읽어 pages 배열을 구성한 뒤 buildPhotoPptxFromTemplate 호출
// ── 목차 기반 사진장표 생성 ─────────────────────────────────────
// 각 목차(toc)는 독립적으로 처리된다.
// 흐름: readPhotoAssignConfig() → 목차별 인원 수집(portalOrder 순) → 슬롯 배치 → PPTX 생성
// 사진은 프로파일 ID와 독립적으로 이름으로 조회한다. ID=0인 여러 인원도 구분한다.
async function loadProposalPhotos(pages) {
  const people = pages.flatMap(pg => Object.values(pg.slotPeople))
  const key = p => String(p.name || '').trim()
  const names = [...new Set(people.map(key).filter(n => n && !/^TBD\d*$/i.test(n)))]
  const results = new Map()
  for (let start = 0; start < names.length; start += 100) {
    const batch = names.slice(start, start + 100)
    try {
      const res = await fetch('/api/personnel/photo-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: batch }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json()
      if (!json.ok || !Array.isArray(json.results)) throw new Error('응답 형식 오류')
      for (const row of json.results) results.set(row.name, row)
    } catch {
      for (const name of batch) results.set(name, { ok: false, error: 'photo_api_error' })
    }
  }
  const warnings = new Map()
  const labels = {
    nas_not_configured: 'NAS 환경변수 미설정',
    nas_connection_error: 'NAS 연결 실패/시간 초과',
    nas_http_error: 'NAS HTTP 오류',
    nas_error: 'NAS 조회 실패',
    nas_invalid_response: 'NAS 응답 형식 오류',
    nas_invalid_image: 'NAS 사진 형식 오류',
    photo_path_not_found: 'NAS 사진 파일/경로 확인 필요',
    photo_api_error: '사진 API 조회 실패',
    invalid_name: '사진 조회 이름 확인 필요',
  }
  for (const p of people) {
    // 이전 생성의 사진이 조회 실패 후에도 남아 있지 않게 초기화한다.
    delete p.photoArrayBuffer
    const name = key(p)
    const row = results.get(name)
    if (row?.ok && /^data:image\/png;base64,/.test(row.dataUri || '')) {
      try {
        const bin = atob(row.dataUri.split(',')[1])
        if (!bin.length) throw new Error('empty image')
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        p.photoArrayBuffer = bytes.buffer
        continue
      } catch { /* 잘못된 이미지도 조회 실패로 보고한다. */ }
    }
    const label = /^TBD\d*$/i.test(name) ? '미정 인력 (사진 조회 제외)'
      : (labels[row?.error] || '사진 데이터 확인 필요')
        + (row?.stage ? ' / ' + row.stage : '')
        + (Number.isInteger(row?.code) ? ' (코드 ' + row.code + ')' : '')
    if (!warnings.has(label)) warnings.set(label, new Set())
    warnings.get(label).add(name || '(이름 없음)')
  }
  return [...warnings].map(([label, names]) => label + ' — 기존 대체 이미지 사용: ' + [...names].join(', '))
}

async function downloadPhotoAssignPptx(btn, opts) {
  opts = opts || {}
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return null }
  setBtnState(btn, true)
  try {
    const cache = buildPhotoAssignCache()
    if (!cache) { showAutoAlert('❌ 인력 데이터가 없습니다.', false); return null }

    // ── 목차 설정 읽기 ──
    // 1) UI DOM에서 읽기 (모달이 열려있을 때)
    let tocList = []
    try { tocList = readPhotoAssignConfig() } catch (e) { tocList = [] }

    // 2) opts.menuCode 지정 시 → 해당 menuCode 목차만 필터링
    //    (ppt-engine이 AUDITOR/CORE_EXPERT/EXPERT_PROFILE 각각 호출 시 해당 것만)
    if (opts.menuCode && tocList.length) {
      tocList = tocList.filter(t => t.menuCode === opts.menuCode)
    }

    // 3) tocList가 비어있으면 → _pawTocList 또는 PptMenuRegistry에서 직접 구성
    //    (ppt-engine 호출 시 모달 미열림 상태이거나 DOM이 없는 경우)
    if (!tocList.length) {
      const activeCats = PHOTO_CATS.filter(c => (cache[c.key] || []).length > 0)
      const menuCode = opts.menuCode

      // _pawTocList 이미 로드됐으면 그걸 우선 사용
      if (_pawTocList && _pawTocList.length) {
        const src = menuCode
          ? _pawTocList.filter(t => t.menuCode === menuCode)
          : _pawTocList
        tocList = src
          .filter(t => t.cats.length > 0)
          .map(t => ({ menuCode: t.menuCode, title: t.title, sheetSize: t.sheetSize, catKeys: t.cats }))
      }

      // _pawTocList도 없으면 PptMenuRegistry에서 직접 로드
      if (!tocList.length && menuCode && PAW_MENU_DEFAULT_CATS[menuCode]) {
        try {
          const registry = await PptMenuRegistry.load()
          const m = registry.byCode[menuCode]
          const title = m ? [m.menu_number, m.menu_name].filter(Boolean).join(' ') : menuCode
          const defaultCatKeys = PAW_MENU_DEFAULT_CATS[menuCode]
            .filter(k => activeCats.some(c => c.key === k))
          const total = defaultCatKeys.reduce((s, k) => s + (cache[k] || []).length, 0)
          if (defaultCatKeys.length && total > 0) {
            const fixedSheet = PAW_MENU_FIXED_SHEET[menuCode]
            const sheetSize = fixedSheet !== undefined ? fixedSheet : suggestSheetSize(total)
            tocList.push({ menuCode, title, sheetSize, catKeys: defaultCatKeys })
          }
        } catch (e) { /* registry 실패 시 하드코딩 fallback으로 진행 */ }
      }

      // 최후 하드코딩 fallback
      if (!tocList.length) {
        if (cache.audit && cache.audit.length)
          tocList.push({ menuCode: 'AUDITOR_PROFILE', title: '감리원 전문역량', sheetSize: 2, catKeys: ['audit'] })
        const expKeys = activeCats.filter(c => c.key !== 'audit').map(c => c.key)
        if (expKeys.length) {
          const tot = expKeys.reduce((s, k) => s + cache[k].length, 0)
          tocList.push({ menuCode: 'EXPERT_PROFILE', title: '전문역량', sheetSize: suggestSheetSize(tot), catKeys: expKeys })
        }
      }
    }

    if (!tocList.length) { showAutoAlert('❌ 생성할 목차가 없습니다.', false); return null }

    // ── pages 배열 구성 ──
    // 각 목차 → 선택된 팀의 인원을 portalOrder 순서(tbl 기재 순)로 수집 → 슬롯 배치
    const pages = []
    const pidMap = parsedData.personnelIdMap || {}
    const { portalOrder } = parsedData

    for (const toc of tocList) {
      const { title: slideTitle, sheetSize, catKeys } = toc
      const meta = PHOTO_LAYOUT_META[sheetSize]
      if (!meta) continue

      // portalOrder 전체를 순회하면서 선택된 팀에 속하는 인원만 필터 (원본 순서 유지)
      const people = (portalOrder || [])
        .filter(p => catKeys.some(k => {
          const cat = PHOTO_CATS.find(c => c.key === k)
          return cat && cat.grpFilter(p)
        }))
        .map(p => {
          const catKey = catKeys.find(k => {
            const cat = PHOTO_CATS.find(c => c.key === k)
            return cat && cat.grpFilter(p)
          })
          const catLabel = catKey ? PHOTO_CATS.find(c => c.key === catKey).label.replace(/^\S+\s/, '') : ''
          return {
            name: p.name,
            field: (parsedData.personFieldMap || {})[p.name] || catLabel,
            grade: getEffectiveGrade(p.name),
            personnelId: pidMap[p.name] || 0,
          }
        })

      if (!people.length) continue

      // 템플릿 크기 단위로 페이지 분할
      // slotPeople: i번째 인원 → 슬롯(i+1) 에 배치 (행 우선: 왼→오른, 위→아래)
      // orderIndexToSlot은 "XML shape 저장 순서 → 시각 슬롯 번호" 매핑이므로
      // 인원 배치는 단순 1-based 슬롯 순서(행 우선)로 하면 됨.
      // XML 처리 측(buildPhotoPptxFromTemplate)에서 slotShapes[slotIdx]로 귀속하므로
      // slotPeople[1]→슬롯1(행1열1), slotPeople[2]→슬롯2(행1열2), ... 가 정확히 들어감.
      for (let start = 0; start < people.length; start += sheetSize) {
        const pagePeople = people.slice(start, start + sheetSize)
        const slotPeople = {}
        pagePeople.forEach((p, i) => { slotPeople[i + 1] = p })  // 행 우선 1-based
        pages.push({ sheetSize, slotPeople, slideTitle })
      }
    }

    if (!pages.length) { showAutoAlert('❌ 생성할 인력이 없습니다.', false); return null }

    // ── slideTitle 기준 pageNum / totalPages 계산 ──
    // 동일 목차 제목끼리 묶어서 (N/total) 넘버링
    // 1장짜리는 넘버링 없이 제목만, 2장 이상부터 (N/total) 추가
    const titleCountMap = {}
    pages.forEach(pg => { titleCountMap[pg.slideTitle] = (titleCountMap[pg.slideTitle] || 0) + 1 })
    const titleSeqMap = {}
    pages.forEach(pg => {
      titleSeqMap[pg.slideTitle] = (titleSeqMap[pg.slideTitle] || 0) + 1
      pg.pageNum    = titleSeqMap[pg.slideTitle]
      pg.totalPages = titleCountMap[pg.slideTitle]
    })

    // ── photo-profile API 호출: 등장하는 모든 인원의 profile 로드 ──
    const proposalId = parsedData.proposalId || 0
    const allPeople = []
    pages.forEach(pg => Object.values(pg.slotPeople).forEach(p => {
      if (!allPeople.find(x => x.personnelId === p.personnelId && x.name === p.name)) allPeople.push(p)
    }))
    const profileMap = {}
    await Promise.all(
      allPeople
        .filter(p => p.personnelId)
        .map(async p => {
          try {
            const res = await fetch(`/api/personnel/${p.personnelId}/photo-profile?projectId=${proposalId}`)
            if (res.ok) {
              const json = await res.json()
              if (json.ok) profileMap[p.personnelId] = json.data
            }
          } catch (e) { console.warn('photo-profile 로드 실패:', p.name, e) }
        })
    )
    // slotPeople에 profile 주입 + photo-profile의 분야(domain)로 field 보완
    pages.forEach(pg => {
      Object.values(pg.slotPeople).forEach(p => {
        const prof = profileMap[p.personnelId] || {}
        p.profile = prof
        // photo-profile API가 반환한 분야가 있으면 우선 사용
        if (!p.field && prof['분야']) p.field = prof['분야']
      })
    })

    // 사진은 이름 기준 일괄 조회: NAS 로그인 1회, 다운로드 동시성 제한.
    const photoWarnings = await loadProposalPhotos(pages)

    // ── templateZips 로드 ──
    // PptMenuRegistry에서 AUDITOR_PROFILE 메뉴의 PERSON_2/4/6/9 템플릿 로드
    let templateZips = null
    try {
      const registry = await PptMenuRegistry.load()
      // 목차 기반에서는 모든 목차가 동일 템플릿 세트를 공유
      // AUDITOR_PROFILE → CORE_EXPERT_PROFILE → EXPERT_PROFILE 순으로 fallback
      const menuCodes = ['AUDITOR_PROFILE', 'CORE_EXPERT_PROFILE', 'EXPERT_PROFILE']
      let tpls = []
      for (const code of menuCodes) {
        const menu = registry.byCode[code]
        if (menu && Array.isArray(menu.templates) && menu.templates.length) {
          tpls = menu.templates; break
        }
      }
      const VARIANT_RE = /PERSON[_-]?(\d+)/i
      const b64Map = {}
      tpls.forEach(t => {
        if (!t.pptx_b64_key) return
        const vn = t.variant_code || t.variant_name || t.template_name || ''
        const m = vn.match(VARIANT_RE)
        if (m) b64Map[Number(m[1])] = t.pptx_b64_key
      })
      const sizes = [2, 4, 6, 9]
      if (!b64Map[2]) {
        showAutoAlert('❌ PERSON_2 템플릿을 업로드해주세요.', false)
        return null
      }
      sizes.forEach(s => { if (!b64Map[s]) b64Map[s] = b64Map[2] })
      templateZips = {}
      await Promise.all(sizes.map(async s => {
        const b64 = b64Map[s]
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        templateZips[s] = await JSZip.loadAsync(bytes)
      }))
    } catch (e) {
      console.error('templateZips 로드 실패:', e)
      showAutoAlert('❌ 사진장표 템플릿 로드 실패: ' + e.message, false)
      return null
    }

    const zip = await buildPhotoPptxFromTemplate(pages, templateZips)
    const warnings = [...photoWarnings]
    const people = pages.flatMap(pg => Object.values(pg.slotPeople))
    const missingProfiles = [...new Set(people.filter(p => !p.personnelId || !profileMap[p.personnelId]).map(p => p.name))]
    if (missingProfiles.length) warnings.push('프로파일 확인 필요: ' + missingProfiles.join(', '))
    if (opts.returnZip) return { zip, warnings }
    // 단독 다운로드도 확인창 없이 진행하고 경고는 완료 메시지에 표시한다.

    const today = new Date().toISOString().slice(0, 10)
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `사진장표_${today}.pptx`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showAutoAlert(warnings.length ? '사진장표 다운로드 완료. 검토 사항: ' + warnings.join(' / ') : '사진장표 다운로드 완료', !warnings.length)
    return null
  } catch (e) {
    console.error(e)
    showAutoAlert('❌ 생성 실패: ' + e.message, false)
    if (opts.returnZip) throw e
    return null
  }
  finally { setBtnState(btn, false) }
}

// ── 요약표 PPT ──────────────────────────────────────────────
async function downloadSummaryTablePptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') throw new Error('PPT 라이브러리를 불러오지 못했습니다.')
  setBtnState(btn, true)
  try {
    const ctx = ProposalTemplate.context(parsedData, ProposalTemplate.options())
    const checks = ProposalTemplate.checks(ctx)
    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'
    const slide = pres.addSlide()
    slide.addText('주관기관 요청사항 준수 여부 — 입력값 기준 검토', { x: 0.5, y: 0.35, w: 12, h: 0.5, fontFace: 'KoPub돋움체 Bold', fontSize: 19 })
    const header = ['요청 구분', '제안요청 내용 (RFP)', '판정', '제안 내역 / 확인 사항']
      .map(text => ({ text, options: { bold: true, fill: 'D2F0FF', color: '222222' } }))
    const rows = [header, ...checks.map(c => [c.label, c.required,
      { text: c.status, options: { bold: true, color: c.status === '미충족' ? 'B91C1C' : c.status === '검토 필요' ? '92400E' : '166534' } }, c.actual])]
    slide.addTable(rows, { x: 0.5, y: 1.15, w: 12.3, colW: [1.8, 3.0, 1.2, 6.3],
      fontFace: 'KoPub돋움체 Medium', fontSize: 12, border: { pt: 0.5, color: 'BFBFBF' },
      margin: 0.12, rowH: 0.75, valign: 'mid', autoPage: true, autoPageRepeatHeader: true })
    slide.addText('충족은 선택한 범위의 숫자 비교 결과입니다. RFP 해석·증빙·인력 자격은 담당자 최종 확인이 필요합니다.',
      { x: 0.5, y: 6.8, w: 12.3, h: 0.35, fontSize: 10, color: '92400E' })
    const warnings = [...ctx.warnings, ...checks.filter(c => c.status !== '충족').map(c => `${c.label}: ${c.status} (${c.required})`)]
    if (opts.returnZip) {
      const zip = await JSZip.loadAsync(await pres.write({ outputType: 'arraybuffer' }))
      return { zip, warnings, mergeStrategy: 'FOREIGN_TEMPLATE' }
    }
    await pres.writeFile({ fileName: '검토용_요약표_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
    showAutoAlert('검토용 요약표를 생성했습니다. RFP 비교 범위와 판정 근거를 확인하세요.', false)
  } catch (e) {
    showAutoAlert('요약표 생성 실패: ' + e.message, false)
    if (opts.returnZip) throw e
  } finally { setBtnState(btn, false) }
}

// ── 전체 합본 PPT ───────────────────────────────────────────
// ppt-engine.js의 generateProposalPpt()를 우선 사용하고,
// 오류를 숨기는 레거시 fallback 없이 결과 보고서를 표시
async function downloadAllPptx(btn) {
  if (typeof downloadProposalPpt !== 'function') {
    showAutoAlert('본문 생성 엔진을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.', false)
    return
  }
  // 실패를 숨기고 다른 목차로 만드는 레거시 합본 fallback은 사용하지 않는다.
  return downloadProposalPpt(btn)
}

// ── 인원 상세 모달 ──────────────────────────────────────────
async function openPersonModal(personnelId) {
  document.getElementById('personModal').classList.remove('hidden')
  document.getElementById('personModalBody').innerHTML =
    '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>'
  try {
    const res = await fetch('/api/personnel/' + personnelId)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    const { person, certs, auditHistory } = json.data
    const certRows = certs.map(c =>
      '<tr class="border-t border-slate-100 text-xs"><td class="px-3 py-1.5 text-slate-600">' + (c.cert_name || '-') + '</td><td class="px-3 py-1.5 text-center text-slate-500">' + (c.cert_no || '-') + '</td><td class="px-3 py-1.5 text-center text-slate-500">' + (c.cert_year || '-') + '</td></tr>'
    ).join('')
    const auditRows = auditHistory.slice(0, 10).map(h =>
      '<tr class="border-t border-slate-100 text-xs"><td class="px-3 py-1.5 text-slate-500">' + (h.audit_yearmonth || '-') + '</td><td class="px-3 py-1.5 text-slate-700">' + (h.project_name || '-') + '</td><td class="px-3 py-1.5 text-slate-500">' + (h.domain || '-') + '</td><td class="px-3 py-1.5 text-slate-500">' + (h.role || '-') + '</td></tr>'
    ).join('')
    document.getElementById('personModalTitle').textContent = person.name + ' — 인원 정보'
    let html = '<div class="grid grid-cols-2 gap-3 mb-5 text-sm">'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">직위</span><span class="font-medium">' + (person.position || '-') + '</span></div>'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">소속</span><span class="font-medium">' + (person.company || '-') + '</span></div>'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">감리등급</span><span class="font-medium">' + (person.auditor_grade || '-') + '</span></div>'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">자격번호</span><span class="font-medium">' + (person.auditor_cert_no || '-') + '</span></div>'
    html += '</div>'
    if (certs.length > 0) {
      html += '<div class="mb-4"><h4 class="font-semibold text-slate-700 text-sm mb-2"><i class="fas fa-certificate mr-1 text-amber-500"></i>자격증 (' + certs.length + '건)</h4>'
      html += '<table class="w-full text-xs rounded-xl overflow-hidden border border-slate-200"><thead><tr class="bg-slate-50 text-slate-500"><th class="px-3 py-1.5 text-left">자격명</th><th class="px-3 py-1.5 text-center">자격번호</th><th class="px-3 py-1.5 text-center">취득연도</th></tr></thead><tbody>' + certRows + '</tbody></table></div>'
    }
    if (auditHistory.length > 0) {
      html += '<div><h4 class="font-semibold text-slate-700 text-sm mb-2"><i class="fas fa-history mr-1 text-indigo-500"></i>감리실적 (최근 10건 / 전체 ' + auditHistory.length + '건)</h4>'
      html += '<table class="w-full text-xs rounded-xl overflow-hidden border border-slate-200"><thead><tr class="bg-slate-50 text-slate-500"><th class="px-3 py-1.5 text-left">연월</th><th class="px-3 py-1.5 text-left">사업명</th><th class="px-3 py-1.5 text-left">분야</th><th class="px-3 py-1.5 text-left">역할</th></tr></thead><tbody>' + auditRows + '</tbody></table>'
      if (auditHistory.length > 10) html += '<p class="text-xs text-slate-400 mt-1 text-right">... 외 ' + (auditHistory.length - 10) + '건</p>'
      html += '</div>'
    } else {
      html += '<p class="text-slate-400 text-sm text-center py-4">감리실적 없음</p>'
    }
    document.getElementById('personModalBody').innerHTML = html
  } catch (e) {
    document.getElementById('personModalBody').innerHTML =
      '<p class="text-red-500 text-sm text-center py-4">불러오기 실패: ' + e.message + '</p>'
  }
}
function closePersonModal() { document.getElementById('personModal').classList.add('hidden') }

// ── K 감리이력 키워드 매칭 모달 ─────────────────────────────
async function openKModal(personnelId, projectId, personName) {
  document.getElementById('kModal').classList.remove('hidden')
  document.getElementById('kModalTitle').textContent = personName + ' — 감리이력 키워드 매칭'
  document.getElementById('kModalBody').innerHTML =
    '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div></div>'
  try {
    const res = await fetch('/api/personnel/' + personnelId + '/audit-match?projectId=' + projectId)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    const { keywords, rows, mappingMap, kw_matched_count, domain_rows_count } = json
    const kwTags = keywords.map((k, i) => {
      const cls = i < 3 ? 'bg-teal-50 border-teal-300 text-teal-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-500'
      const kwText = mappingMap[k.keyword]
        ? '<span class="line-through text-slate-300">' + k.keyword + '</span><span class="ml-1">' + mappingMap[k.keyword] + '</span>'
        : k.keyword
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + cls + '"><span class="text-slate-400">' + (i + 1) + '.</span>' + kwText + '</span>'
    }).join(' ')
    const tableRows = rows.map(h => {
      const isKeyword = h.match_type === 'keyword'
      const isDomain  = h.match_type === 'domain'
      const isNone    = !isKeyword && !isDomain
      const matchBadges = isDomain
        ? '<span class="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-medium mr-0.5">' + (h.domain || '-') + '</span>'
        : isKeyword ? h.mapped_keywords.map(mk => '<span class="inline-block px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium mr-0.5">' + mk + '</span>').join('') : ''
      const origBadges = isKeyword ? h.matched_keywords.map(ok => mappingMap[ok] ? '<span class="text-slate-400 text-xs line-through mr-0.5">' + ok + '</span>' : '').join('') : ''
      const matchClass = isNone ? 'opacity-40' : isDomain ? 'opacity-70' : h.match_count >= 3 ? 'bg-teal-50' : h.match_count >= 1 ? 'bg-indigo-50/40' : ''
      const matchBadge = isKeyword
        ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-teal-600 text-white">' + h.match_count + '</span>'
        : isDomain
          ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-300 text-white" title="분야 매칭">분야</span>'
          : '<span class="text-slate-200">-</span>'
      return '<tr class="border-t border-slate-100 text-xs ' + matchClass + '"><td class="px-3 py-2 text-slate-700 max-w-xs">' + (h.project_name || '-') + '</td><td class="px-3 py-2 text-slate-500">' + (h.client_org || '-') + '</td><td class="px-3 py-2 text-slate-500">' + (h.domain || '-') + '</td><td class="px-3 py-2 text-center">' + matchBadge + '</td><td class="px-3 py-2">' + (matchBadges || '<span class="text-slate-300 text-xs">-</span>') + origBadges + '</td></tr>'
    }).join('')
    const matchedCount = kw_matched_count != null ? kw_matched_count : rows.filter(r => r.match_count > 0).length
    const domainCount  = domain_rows_count != null ? domain_rows_count : 0
    // 요약 필드: 키워드 매칭(match_count>0) 우선, 부족하면 분야 보충 행으로 채워 최대 20건
    const kwLines = rows.filter(r => r.match_count > 0).map(r => {
      const kwLabel = r.mapped_keywords.length > 0 ? r.mapped_keywords[0] : r.matched_keywords[0]
      return '[ ' + kwLabel + ' ] ' + (r.client_org || '') + ', ' + (r.project_name || '')
    })
    const domainLines = rows.filter(r => r.match_type === 'domain').map(r => {
      return '[ ' + (r.domain || '분야') + ' ] ' + (r.client_org || '') + ', ' + (r.project_name || '')
    })
    const copyLines = [...kwLines, ...domainLines].slice(0, 20).join('\n')
    const summaryCount = Math.min(kwLines.length + domainLines.length, 20)

    let countText = '<span class="text-sm text-slate-600">전체 감리실적 <strong>' + rows.length + '</strong>건</span>'
      + '<span class="text-sm text-teal-700 font-semibold">키워드 매칭 <strong>' + matchedCount + '</strong>건</span>'
    if (domainCount > 0) {
      countText += '<span class="text-sm text-slate-500">분야 보충 <strong>' + domainCount + '</strong>건</span>'
    }
    countText += '<span class="text-xs text-slate-400">(상위 키워드 순 → 최근 수행일자 순 정렬)</span>'
    let html = '<div class="mb-4"><p class="text-xs text-slate-500 mb-2 font-medium">이 제안의 키워드 (' + keywords.length + '개) — 앞 순서가 상위 키워드</p><div class="flex flex-wrap gap-1.5">' + kwTags + '</div></div>'
    html += '<div class="mb-3 flex items-center gap-3">' + countText + '</div>'
    if (summaryCount > 0) {
      html += '<div class="mb-4"><div class="flex items-center justify-between mb-1.5"><span class="text-xs font-semibold text-slate-600">매칭 감리이력 요약 <span class="text-slate-400 font-normal">(' + summaryCount + '건)</span></span><button onclick="copyKText()" class="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg transition"><i class="fas fa-copy"></i> 복사</button></div>'
      html += '<textarea id="kCopyText" readonly class="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" rows="' + Math.min(summaryCount, 10) + '">' + copyLines + '</textarea></div>'
    }
    html += '<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full text-xs"><thead><tr class="bg-slate-50 text-slate-500 text-xs"><th class="px-3 py-2 text-left">사업명</th><th class="px-3 py-2 text-left">발주처</th><th class="px-3 py-2 text-left">분야</th><th class="px-3 py-2 text-center">매칭</th><th class="px-3 py-2 text-left">주요 키워드 (변환) / 분야</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>'
    if (domainCount > 0) {
      html += '<p class="text-xs text-slate-400 mt-2">* <span class="inline-block px-1.5 py-0.5 rounded bg-slate-300 text-white text-xs font-bold">분야</span> 배지: 분야 매칭 이력 &nbsp;|&nbsp; 흐린 행: 키워드·분야 모두 미매칭 이력</p>'
    }
    document.getElementById('kModalBody').innerHTML = html
  } catch (e) {
    document.getElementById('kModalBody').innerHTML =
      '<p class="text-red-500 text-sm text-center py-4">불러오기 실패: ' + e.message + '</p>'
  }
}
function closeKModal() { document.getElementById('kModal').classList.add('hidden') }

function copyKText() {
  const ta = document.getElementById('kCopyText')
  if (!ta) return
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.querySelector('#kModal button[onclick="copyKText()"]')
    if (btn) {
      const orig = btn.innerHTML
      btn.innerHTML = '<i class="fas fa-check"></i> 복사됨'
      btn.classList.replace('bg-teal-600', 'bg-green-600')
      btn.classList.replace('hover:bg-teal-700', 'hover:bg-green-700')
      setTimeout(() => {
        btn.innerHTML = orig
        btn.classList.replace('bg-green-600', 'bg-teal-600')
        btn.classList.replace('hover:bg-green-700', 'hover:bg-teal-700')
      }, 2000)
    }
  }).catch(() => { ta.select(); document.execCommand('copy') })
}

// ── ESC 키로 모달 닫기 ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePersonModal(); closeKModal()
    closeAutoModal(); closePersonnelTableModal(); closeExpertBreakdown()
  }
})

// ── 키워드 치환 규칙 CRUD ────────────────────────────────────
async function addKwMapping(projectId) {
  const origEl   = document.getElementById('kwMapOrig')
  const mappedEl = document.getElementById('kwMapMapped')
  const orig   = (origEl?.value || '').trim()
  const mapped = (mappedEl?.value || '').trim()
  if (!orig || !mapped) { alert('원본 키워드와 변환 이름을 모두 입력해주세요.'); return }

  try {
    const res = await fetch('/api/projects/' + projectId + '/keyword-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_keyword: orig, mapped_keyword: mapped }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)

    // DOM 즉시 반영 (새 규칙들 삽입)
    const list = document.getElementById('kwMappingList')
    if (list) {
      const empty = list.querySelector('p')
      if (empty) empty.remove()
      ;(json.inserted || []).forEach(m => {
        const div = document.createElement('div')
        div.className = 'flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5'
        div.dataset.mappingId = String(m.id)
        div.innerHTML =
          '<span class="text-xs text-slate-500 line-through">' + m.original_keyword + '</span>' +
          '<i class="fas fa-arrow-right text-teal-400 text-xs"></i>' +
          '<span class="text-xs font-semibold text-teal-700">' + m.mapped_keyword + '</span>' +
          '<button onclick="deleteKwMapping(' + projectId + ',' + m.id + ')" ' +
            'class="ml-auto text-slate-300 hover:text-red-400 transition text-xs" title="삭제">' +
            '<i class="fas fa-times"></i></button>'
        list.appendChild(div)
      })
    }
    if (origEl)   origEl.value   = ''
    if (mappedEl) mappedEl.value = ''
  } catch (e) {
    alert('저장 실패: ' + e.message)
  }
}

async function deleteKwMapping(projectId, mappingId) {
  if (!confirm('이 치환 규칙을 삭제하시겠습니까?')) return
  try {
    const res = await fetch('/api/projects/' + projectId + '/keyword-mappings/' + mappingId, {
      method: 'DELETE',
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)

    // DOM에서 해당 행 제거
    const row = document.querySelector('[data-mapping-id="' + mappingId + '"]')
    if (row) row.remove()
    // 목록이 비었으면 안내 문구 표시
    const list = document.getElementById('kwMappingList')
    if (list && !list.querySelector('[data-mapping-id]')) {
      list.innerHTML = '<p class="text-xs text-slate-400 py-1">등록된 치환 규칙이 없습니다.</p>'
    }
  } catch (e) {
    alert('삭제 실패: ' + e.message)
  }
}
