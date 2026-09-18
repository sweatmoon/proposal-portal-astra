/**
 * 사업 제안작업표 HTML 파서 (node-html-parser 기반)
 *
 * 파싱 대상:
 *   #tblSchedule  → audit_phases + audit_phase_assignments
 *   #tblManList   → proposal_members
 *   일반 th/td    → audit_projects (사업 기본정보)
 *
 * index.html(감리 일정 분석기)의 parsePortalHTML() 로직을 그대로 포팅.
 */

import { parse as parseHTML } from 'node-html-parser'
import type { HTMLElement as NHTMLElement } from 'node-html-parser'
import { extractNumber, normalizeDate } from './html-table-parser.js'

// ─── 반환 타입 ────────────────────────────────────────────────
export interface AuditProjectData {
  project_name: string
  bid_notice_no: string
  client_org: string
  registered_yearmonth: string
  target_project_name: string
  target_client_org: string
  target_period_start: string
  target_period_end: string
  bid_amount: number | null
  bid_amount_excl_vat: number | null
  bid_rate: number | null
  base_budget: number | null
  bid_deadline: string
  bid_open_dt: string
  eval_dt: string
  required_md: number | null
  proposed_md: number | null
  optimal_md: number | null
  md_unit_price_incl: number | null
  md_unit_price_excl: number | null
  base_unit_price: number | null
  proposal_allowance: number | null
  proposal_allowance_rate: number | null
  required_phases: number | null
  required_audit_days: number | null
  eval_method: string
  proposal_status: string
  writer: string
  director: string
  supporters: string
  references_cc: string
  special_notes: string
  remarks: string
  proposal_template: string
}

export interface KeywordData {
  keyword: string
  sort_order: number
}

export interface KeywordMappingData {
  original_keyword: string
  mapped_keyword: string
}

export interface AuditPhaseData {
  phase_name: string
  phase_days: number
  phase_start_date: string
  phase_end_date: string
  phase_order: number
  total_auditor_cnt: number
  pre_survey_md: number
  audit_md: number
  action_confirm_md: number
  proposed_md: number
}

export interface PhaseAssignmentData {
  phase_name: string
  person_name: string
  member_type: string
  pre_survey_md: number
  audit_md: number
  action_confirm_md: number
}

export interface ProposalMemberData {
  person_name: string
  member_group: string
  member_type: string
  domain: string
  regular_md: number
  additional_md: number
  acceptance_md: number
  is_fulltime: number
  auditor_grade: string
  auditor_cert_no: string
  phone: string
  education_hours: number
}

export interface ProposalFileData {
  file_category: string
  file_name: string
  file_size_kb: number | null
  uploaded_at: string
  file_type: string
}

export interface AttachmentTocData {
  item_order: number
  item_name: string
}

export interface ParsedProject {
  project: AuditProjectData
  keywords: KeywordData[]
  keyword_mappings: KeywordMappingData[]
  phases: AuditPhaseData[]
  phase_assignments: PhaseAssignmentData[]
  proposal_members: ProposalMemberData[]
  proposal_files: ProposalFileData[]
  attachments_toc: AttachmentTocData[]
}

// ─── 헬퍼 ────────────────────────────────────────────────────

function txt(el: NHTMLElement | null | undefined): string {
  if (!el) return ''
  return el.text.replace(/\s+/g, ' ').trim()
}

function parseJpDate(raw: string): string {
  const m = raw.match(/(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/)
  if (!m) return raw
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function parseDatetime(raw: string): string {
  const m1 = raw.match(/(\d{4})[\/](\d{2})[\/](\d{2})\s+(\d{2}:\d{2}:\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]} ${m1[4]}`
  return parseJpDate(raw)
}

// ─── 메인 파서 ───────────────────────────────────────────────
export function parseProjectHtml(html: string): ParsedProject {
  const doc = parseHTML(html)

  // ── 기본 프로젝트 정보 초기화 ──
  const proj: AuditProjectData = {
    project_name: '', bid_notice_no: '', client_org: '', registered_yearmonth: '',
    target_project_name: '', target_client_org: '',
    target_period_start: '', target_period_end: '',
    bid_amount: null, bid_amount_excl_vat: null, bid_rate: null, base_budget: null,
    bid_deadline: '', bid_open_dt: '', eval_dt: '',
    required_md: null, proposed_md: null, optimal_md: null,
    md_unit_price_incl: null, md_unit_price_excl: null,
    base_unit_price: null, proposal_allowance: null, proposal_allowance_rate: null,
    required_phases: null, required_audit_days: null,
    eval_method: '', proposal_status: '',
    writer: '', director: '', supporters: '', references_cc: '',
    special_notes: '', remarks: '', proposal_template: '',
  }

  // ── 1. th/td 기반 기본정보 파싱 ──────────────────────────────
  // index.html의 방식: th 텍스트로 라벨 판별, 인접 td/다음 th로 값 추출
  const allThs = doc.querySelectorAll('th')
  for (const th of allThs) {
    const label = txt(th)
    // nextElementSibling 대신 부모 tr에서 td들을 순서대로 사용
    const tr = th.parentNode as NHTMLElement
    if (!tr) continue
    const tds = tr.querySelectorAll('td')

    if (label === '사업명' && tds[0]) {
      const raw = txt(tds[0])
      proj.project_name = raw.split(' - ')[0].trim()
      const mYM = raw.match(/(\d{4})[.\/](\d{1,2})/)
      if (mYM) proj.registered_yearmonth = `${mYM[1]}.${mYM[2].padStart(2, '0')}`
      const parts = raw.split(' - ')
      if (parts.length >= 2) proj.client_org = parts[1].replace(/등록년월.*/, '').trim()

      // index.html 방식: copyTextToClipboard 속성에서 정확한 주관기관 추출
      const orgFont = tds[0].querySelectorAll('font[onclick]').find(
        f => /copyTextToClipboard/.test(f.getAttribute('onclick') || '')
      )
      if (orgFont) {
        const m = (orgFont.getAttribute('onclick') || '').match(/copyTextToClipboard\('([^']*)'\)/)
        if (m) proj.client_org = m[1]
      }
    }

    if (label === '입찰공고번호' && tds[0]) {
      proj.bid_notice_no = txt(tds[0]).replace(/\[.*?\]/g, '').trim()
    }

    if (label === '입찰 마감 일시' && tds[0]) {
      proj.bid_deadline = parseDatetime(txt(tds[0]))
    }
    if (label === '입찰 개시 일시' && tds[0]) {
      proj.bid_open_dt = parseDatetime(txt(tds[0]))
    }
    if (label === '평가 일시' && tds[0]) {
      proj.eval_dt = parseDatetime(txt(tds[0]))
    }

    if ((label === '사업 금액' || label === '배정 예산') && tds[0]) {
      proj.base_budget = extractNumber(txt(tds[0]))
    }

    if (label === '입찰 금액' && tds[0]) {
      const v = txt(tds[0])
      const rateM = v.match(/투찰률?[:：]\s*([\d.]+)/)
      if (rateM) proj.bid_rate = parseFloat(rateM[1])
      const amtM = v.match(/([\d,]+)원/)
      if (amtM) proj.bid_amount = extractNumber(amtM[0])
      const exclM = v.match(/VAT\s*제외시?\s*([\d,]+)/)
      if (exclM) proj.bid_amount_excl_vat = extractNumber(exclM[1])
    }

    if (label.includes('제안 투입 공수') && tds[0]) {
      proj.proposed_md = extractNumber(txt(tds[0]))
    }
    if (label.includes('요구 투입 공수') && tds[0]) {
      // index.html 방식: #demandInptMdDiv
      const div = th.parentNode?.querySelector('#demandInptMdDiv')
      if (div) {
        const m = txt(div).match(/([\d.]+)/)
        if (m) proj.required_md = parseFloat(m[1])
      } else {
        proj.required_md = extractNumber(txt(tds[0]))
      }
    }
    if (label.includes('요구 단계') && tds[0]) {
      const div = th.parentNode?.querySelector('#demandStepDiv')
      if (div) {
        const m = txt(div).match(/(\d+)/)
        if (m) proj.required_phases = parseInt(m[1])
      } else {
        proj.required_phases = extractNumber(txt(tds[0]))
      }
    }
    if (label.includes('요구 감리 일수') && tds[0]) {
      const div = th.parentNode?.querySelector('#demandSprvisnDaycntDiv')
      if (div) {
        const m = txt(div).match(/([\d.]+)/)
        if (m) proj.required_audit_days = parseFloat(m[1])
      } else {
        proj.required_audit_days = extractNumber(txt(tds[0]))
      }
    }

    if (label.includes('1MD 단가') && tds[0]) {
      const v = txt(tds[0])
      if (v.includes('VAT 제외')) proj.md_unit_price_excl = extractNumber(v)
      else if (v.includes('VAT 포함')) proj.md_unit_price_incl = extractNumber(v)
    }

    // 같은 tr에 여러 th가 있는 경우 (예: "입찰 마감 일시 | 값 | 1MD 단가 | 값")
    const allThsInTr = tr.querySelectorAll('th')
    const allTdsInTr = tr.querySelectorAll('td')
    allThsInTr.forEach((th2, idx) => {
      const l2 = txt(th2)
      const v2 = txt(allTdsInTr[idx])
      if (l2 === '입찰 마감 일시' && v2) proj.bid_deadline = parseDatetime(v2)
      if (l2 === '입찰 개시 일시' && v2) proj.bid_open_dt = parseDatetime(v2)
      if (l2 === '제안 작업 상태' && v2) proj.proposal_status = v2
      if (l2.includes('1MD 단가') && v2) {
        if (v2.includes('VAT 포함')) proj.md_unit_price_incl = extractNumber(v2)
        if (v2.includes('VAT 제외')) proj.md_unit_price_excl = extractNumber(v2)
      }
    })

    if (label === '제안 평가 방식' && tds[0]) proj.eval_method = txt(tds[0])
    if (label === '제안 작업 상태' && tds[0]) proj.proposal_status = txt(tds[0])

    if (label === '제안 관련자' && tds[0]) {
      const raw = txt(tds[0])
      const writerM = raw.match(/작성자[:：]\s*(\S+)/)
      const dirM    = raw.match(/총괄[:：]\s*(\S+)/)
      const suppM   = raw.match(/지원[:：]\s*([^\s총괄제안]+)/)
      const refM    = raw.match(/참조[:：]\s*(.+)/)
      if (writerM) proj.writer       = writerM[1]
      if (dirM)    proj.director     = dirM[1]
      if (suppM)   proj.supporters   = suppM[1].trim()
      if (refM)    proj.references_cc = refM[1].trim()

      // index.html 방식: pmName = 총괄
      if (dirM) proj.director = dirM[1]
    }

    if (label === '특이 사항' && tds[0]) proj.special_notes = txt(tds[0])
    if (label === '비고' && tds[0])      proj.remarks        = txt(tds[0])

    // 적정 공수
    for (const td of tds) {
      const mOpt = txt(td).match(/적정\s*공수[:：]?\s*(\d+)\s*MD/)
      if (mOpt) proj.optimal_md = parseInt(mOpt[1])
    }

    // 기준 단가
    for (const td of tds) {
      const mBase = txt(td).match(/기준\s*단가\s*([\d,]+)/)
      if (mBase) proj.base_unit_price = extractNumber(mBase[1])
    }

    // 제안 수당
    if (label.includes('제안 수당') && tds[0]) {
      const v = txt(tds[0])
      const rateM = v.match(/([\d.]+)%/)
      if (rateM) proj.proposal_allowance_rate = parseFloat(rateM[1])
      const amtM = v.match(/([\d,]+)/)
      if (amtM) proj.proposal_allowance = extractNumber(amtM[0])
    }

    // 대상 사업명
    if (label.includes('대상 사업명') && tds[0]) {
      proj.target_project_name = txt(tds[0])
    }
    if (label.includes('대상 사업 기간') && tds[0]) {
      const v = txt(tds[0])
      const periodM = v.match(/(\d{4}\.\d{2})-?~?(\d{4}\.\d{2})/)
      if (periodM) {
        proj.target_period_start = periodM[1]
        proj.target_period_end   = periodM[2]
      }
    }
  }

  // ── 2. keywords ──────────────────────────────────────────────
  const keywords: KeywordData[] = []
  const keyword_mappings: KeywordMappingData[] = []

  for (const th of allThs) {
    const label = txt(th)
    const tr = th.parentNode as NHTMLElement
    const tds = tr?.querySelectorAll('td') ?? []

    if ((label.includes('주요 키워드') || (label.includes('키워드') && !label.includes('변환'))) && tds[0]) {
      const rawKws = txt(tds[0]).split(',').map(s => s.trim()).filter(Boolean)
      let order = 0
      for (const kw of rawKws) {
        const clean = kw.split(/\s{2,}/)[0].trim()
        if (!clean || clean.length > 50) continue
        keywords.push({ keyword: clean, sort_order: order++ })
      }
    }

    if (label.includes('변환') && tds[0]) {
      // txt()는 \s+를 공백으로 뭉개므로 줄바꿈이 사라짐 → .text를 직접 사용해 줄바꿈 보존
      const rawText = tds[0].text
      const lines = rawText.split('\n').map(s => s.trim()).filter(Boolean)
      for (const line of lines) {
        const arrow = line.includes('->') ? '->' : line.includes('→') ? '→' : null
        if (!arrow) continue
        // arrow 첫 번째 등장 기준으로 분리 (mapped_keyword에 → 포함 방지)
        const arrowIdx = line.indexOf(arrow)
        const orig   = line.slice(0, arrowIdx).trim()
        const mapped = line.slice(arrowIdx + arrow.length).trim()
        if (!orig || !mapped) continue
        for (const o of orig.split(',').map(s => s.trim()).filter(Boolean)) {
          if (o) keyword_mappings.push({ original_keyword: o, mapped_keyword: mapped })
        }
      }
    }
  }

  // ── 3. #tblManList → proposal_members ───────────────────────
  // index.html parsePortalHTML() 로직을 그대로 포팅
  const proposal_members: ProposalMemberData[] = []
  const personGradeMap: Record<string, { grade: string; group: string; expertSubGroup: string; residency: string; certNo: string }> = {}

  const tblMan = doc.querySelector('#tblManList')
  if (tblMan) {
    const tbody = tblMan.querySelector('tbody') || tblMan
    const rows = tbody.querySelectorAll('tr')
    let currentGroup = '감리원팀'

    for (const row of rows) {
      // rowspan 있는 셀 → 그룹 헤더 (index.html과 동일 로직)
      const groupCell = row.querySelectorAll('td[rowspan]')[0]
      if (groupCell) {
        const gt = txt(groupCell)
        currentGroup = gt.includes('전문가') ? '전문가'
                     : gt.includes('테스터') ? '테스터'
                     : '감리원팀'
      }

      // 이름 추출: .FontBlue > onclick="retrieveIndvdlCareer('이름')"
      let name = ''
      const fontBlues = row.querySelectorAll('.FontBlue')
      for (const el of fontBlues) {
        const onclick = el.getAttribute('onclick') || ''
        const m = onclick.match(/retrieveIndvdlCareer\('([^']+)'\)/)
        if (m && m[1] !== '(K)') { name = m[1].trim(); break }
      }
      if (!name) {
        for (const el of fontBlues) {
          const t = txt(el)
          if (t && t !== '(K)' && !/^\d+$/.test(t)) { name = t; break }
        }
      }
      if (!name) {
        for (const c of row.querySelectorAll('td')) {
          if (c.getAttribute('colspan') || c.querySelector('.FontBlue') || c.querySelector('.FontLink')) continue
          const t = txt(c)
          if (/^[가-힣]{2,5}\d?$/.test(t)) { name = t; break }
        }
      }
      if (!name) continue

      // 상근여부 / 감리원증
      const rowTds = row.querySelectorAll('td')
      let residency = '', certNo = ''
      let residencyIdx = -1
      rowTds.forEach((td, i) => {
        const t = txt(td)
        if (t === '상근' || t === '비상근') residencyIdx = i
      })
      if (residencyIdx >= 0) {
        residency = txt(rowTds[residencyIdx])
        const certTd = rowTds[residencyIdx + 2]
        if (certTd) certNo = txt(certTd)
      }

      // 담당분야 + expertSubGroup
      // 자격증 td(residencyIdx+2)는 certNo 추출에 이미 사용되므로 분야 탐색에서 제외
      const certTdIndex = residencyIdx >= 0 ? residencyIdx + 2 : -1
      let mainField = '', subField = '', separateCategoryField = '', expertSubGroup = ''
      for (const [ci, c] of rowTds.entries()) {
        if (ci === certTdIndex) continue   // 자격증 번호 td 명시적 제외
        const style   = c.getAttribute('style') || ''
        const colspan = c.getAttribute('colspan')

        if (colspan === '2' && !c.querySelector('.FontBlue')) {
          const fl = c.querySelector('.FontLink')
          if (fl) {
            // 텍스트 노드만 (FontGray 제외)
            let ft = ''
            for (const child of fl.childNodes) {
              if (child.nodeType === 3) ft += child.text
            }
            ft = ft.trim()
            if (ft && ft.length < 40) mainField = ft
          } else {
            const ct = txt(c)
            if (ct && ct.length < 40) mainField = ct
          }
          const gray = c.querySelector('.FontGray')
          if (gray) { const gt = txt(gray); if (gt) subField = gt }
          continue
        }

        if (style.includes('min-width') && !c.querySelector('.FontBlue') && !c.querySelector('.FontLink') && !colspan) {
          const ct = txt(c)
          if (ct && ct.length < 30 && !/^\d+$/.test(ct) && !['상근', '비상근'].includes(ct)) {
            if (ct.includes('핵심') || ct.includes('필수') || ct.includes('보안')) {
              expertSubGroup = ct
            } else {
              separateCategoryField = ct
            }
          }
          continue
        }

        const flinks = c.querySelectorAll('.FontLink').filter(fl => !fl.classList.contains('FontBlue') as unknown as boolean)
        for (const fl of flinks) {
          let ft = ''
          for (const child of fl.childNodes) {
            if (child.nodeType === 3) ft += child.text
          }
          ft = ft.trim()
          if (!ft || ft === '(K)') continue
          if (/^(서울|경기|부산|대구|인천|광주|대전|울산|정감협|행안부|강원|충북|충남|전북|전남|경북|경남|제주)/.test(ft)) continue
          if (ft.length > 40) continue
          mainField = ft
          const gray = fl.querySelector('.FontGray') || c.querySelector('.FontGray')
          if (gray) { const gt = txt(gray); if (gt) subField = gt }
        }

        if (!colspan) {
          const gray = c.querySelector('.FontGray')
          if (gray && !subField) {
            const gt = txt(gray)
            if (gt && !gt.startsWith('(VAT') && gt.length < 50) subField = gt
          }
        }
      }

      let field = ''
      if (separateCategoryField && mainField)      field = `${separateCategoryField} > ${mainField}`
      else if (mainField)                           field = subField ? `${mainField} ${subField}` : mainField
      else if (separateCategoryField)               field = separateCategoryField

      // 등급
      let grade = ''
      for (const c of rowTds) {
        const t = txt(c)
        if (t === '수석감리원')                          { grade = '수석감리원'; break }
        else if (t === '감리원' && !grade)               grade = '감리원'
        else if (t === '전문가' && !grade)               grade = '전문가'
        else if (t === '테스터' && !grade)               grade = '테스터'
      }

      // MD 파싱: 상근 셀 앞의 숫자 셀들 (정기/추가/검수 순)
      let regularMd = 0, additionalMd = 0, acceptanceMd = 0, educationHours = 0
      if (residencyIdx >= 0) {
        // 상근 셀 바로 앞 3칸: [소계], [검수], [추가], [정기] 순 (역방향)
        // 실제로 MD 숫자 셀이 residencyIdx - 3, -2, -1에 위치
        const mdTd1 = rowTds[residencyIdx - 3]  // 정기
        const mdTd2 = rowTds[residencyIdx - 2]  // 추가
        const mdTd3 = rowTds[residencyIdx - 1]  // 검수(소계 직전)
        regularMd    = extractNumber(txt(mdTd1 ?? null)) ?? 0
        additionalMd = extractNumber(txt(mdTd2 ?? null)) ?? 0
        acceptanceMd = extractNumber(txt(mdTd3 ?? null)) ?? 0
        // 교육시간: 맨 마지막 td
        const lastTd = rowTds[rowTds.length - 1]
        educationHours = extractNumber(txt(lastTd)) ?? 0
      }

      const is_fulltime = residency === '상근' ? 1 : 0

      // member_group: index.html의 personGradeMap.group + expertSubGroup 조합
      // pages.ts의 rawGroup 파싱: "전문가/핵심기술" 형태
      let memberGroup = currentGroup
      if (currentGroup === '전문가' && expertSubGroup) {
        const subKey = expertSubGroup.includes('핵심') ? '핵심기술'
                     : expertSubGroup.includes('필수') ? '필수기술'
                     : expertSubGroup.includes('보안') ? '보안진단'
                     : expertSubGroup
        memberGroup = `전문가/${subKey}`
      }

      const memberType = currentGroup === '전문가' ? '전문가'
                       : currentGroup === '테스터' ? '테스터'
                       : '감리원'

      personGradeMap[name] = { grade, group: currentGroup, expertSubGroup, residency, certNo }

      proposal_members.push({
        person_name:     name,
        member_group:    memberGroup,
        member_type:     memberType,
        domain:          field,
        regular_md:      regularMd,
        additional_md:   additionalMd,
        acceptance_md:   acceptanceMd,
        is_fulltime,
        auditor_grade:   grade,
        auditor_cert_no: certNo,
        phone:           '',   // 포탈 HTML에는 전화번호 없음
        education_hours: educationHours,
      })
    }
  }

  // ── 4. #tblSchedule → audit_phases + phase_assignments ──────
  // index.html의 schedRows 파싱 로직 포팅
  const phases: AuditPhaseData[] = []
  const phase_assignments: PhaseAssignmentData[] = []
  let phaseOrder = 0

  const tblSched = doc.querySelector('#tblSchedule')
  if (tblSched) {
    const tbody = tblSched.querySelector('tbody') || tblSched
    const schedRows = tbody.querySelectorAll('tr')
    let currentPhaseName = ''
    let currentPhaseObj: AuditPhaseData | null = null

    for (const row of schedRows) {
      const cells = row.querySelectorAll('td, th')
      if (!cells.length) continue
      const firstText = txt(cells[0])
      if (firstText === '합계' || firstText.includes('▶')) continue
      // 전부 th인 헤더행 스킵
      if (row.querySelectorAll('th').length === cells.length) continue

      // rowspan td 2개 이상 → 새 단계 행
      const rowspanTds = row.querySelectorAll('td[rowspan]')
      if (rowspanTds.length >= 2) {
        const stageTd = rowspanTds[0]
        const dateTd  = rowspanTds[1]

        const stageRaw = txt(stageTd).replace(/\s*\(\s*\d+\s*일\s*\)\s*$/, '').trim()
        const dateText = txt(dateTd)

        // 일수: title 속성 또는 텍스트에서
        const titleAttr = stageTd.querySelector('font')?.getAttribute('title') || txt(stageTd)
        const dayMatch  = titleAttr.match(/(\d+)일/)
        const phaseDays = dayMatch ? parseInt(dayMatch[1]) : 0

        // 날짜 파싱
        const dateParts = dateText.match(/(\d{4}\.\d{2}\.\d{2})/g) ?? []

        currentPhaseName = stageRaw
        currentPhaseObj = {
          phase_name:        stageRaw,
          phase_days:        phaseDays,
          phase_start_date:  dateParts[0] ? parseJpDate(dateParts[0]) : '',
          phase_end_date:    dateParts[1] ? parseJpDate(dateParts[1]) : '',
          phase_order:       phaseOrder++,
          total_auditor_cnt: 0,
          pre_survey_md:     0,
          audit_md:          0,
          action_confirm_md: 0,
          proposed_md:       0,
        }
        phases.push(currentPhaseObj)
      }

      if (!currentPhaseObj) continue

      // 감리원/전문가 타입 탐색
      let typeText = ''
      for (const c of cells) {
        const t = txt(c)
        if (t === '감리원' || t === '전문가') { typeText = t; break }
      }
      if (!typeText) continue

      // rowspan 없는 td만 데이터 셀
      const dataTds = row.querySelectorAll('td').filter(td => !td.getAttribute('rowspan'))
      const typeIdx = dataTds.findIndex(td => txt(td) === typeText)
      if (typeIdx < 0) continue

      const get = (offset: number) => txt(dataTds[typeIdx + offset] ?? null) || '0'

      const headcount    = parseInt(get(1)) || 0
      const preMd        = parseInt(get(2)) || 0
      const auditMd      = parseInt(get(3)) || 0
      const actionMd     = parseInt(get(4)) || 0
      const proposedMd   = parseInt(get(5)) || 0

      if (typeText === '감리원') {
        currentPhaseObj.total_auditor_cnt = headcount
        currentPhaseObj.pre_survey_md     = preMd
        currentPhaseObj.audit_md          = auditMd
        currentPhaseObj.action_confirm_md = actionMd
        currentPhaseObj.proposed_md       = proposedMd
      }

      // 투입 인력: col[6]
      const peopleTd = dataTds[typeIdx + 6]
      if (peopleTd) {
        const raw = peopleTd.text
        const pattern = /([가-힣a-zA-Z]+\d*(?:\s*[가-힣a-zA-Z]+\d*)?):\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)/g
        let m: RegExpExecArray | null
        while ((m = pattern.exec(raw)) !== null) {
          const nm = m[1].trim()
          if (!nm) continue
          // member_type: personGradeMap에서 결정
          const info = personGradeMap[nm]
          const memberType = info
            ? (info.group === '전문가' ? '전문가' : info.group === '테스터' ? '테스터' : '감리원')
            : typeText === '전문가' ? '전문가' : '감리원'

          phase_assignments.push({
            phase_name:        currentPhaseName,
            person_name:       nm,
            member_type:       memberType,
            pre_survey_md:     parseInt(m[2]),
            audit_md:          parseInt(m[3]),
            action_confirm_md: parseInt(m[4]),
          })
        }
      }
    }
  }

  // ── 5. proposal_files (기존 로직 유지) ───────────────────────
  const proposal_files: ProposalFileData[] = []

  // ── 6. attachments_toc + template ────────────────────────────
  const attachments_toc: AttachmentTocData[] = []

  for (const th of allThs) {
    const label = txt(th)
    const tr = th.parentNode as NHTMLElement
    const tds = tr?.querySelectorAll('td') ?? []

    if (label.includes('템플릿') && tds[0]) {
      proj.proposal_template = txt(tds[0])
    }
    if (label.includes('첨부 목차') && tds[0]) {
      const val = txt(tds[0])
      const parts = val.split(/\s+(\d+)\.\s+/)
      for (let j = 1; j < parts.length - 1; j += 2) {
        const num   = parseInt(parts[j])
        const title = (parts[j + 1] ?? '').trim()
        if (title) attachments_toc.push({ item_order: num, item_name: title })
      }
    }
  }

  return {
    project:          proj,
    keywords,
    keyword_mappings,
    phases,
    phase_assignments,
    proposal_members,
    proposal_files,
    attachments_toc,
  }
}
