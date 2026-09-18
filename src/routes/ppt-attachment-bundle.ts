/**
 * ============================================================================
 *  [ppt-portal 추가 기능] "첨부PPT 생성" 세트 — 조립 엔드포인트 (이 세트의 진입점)
 * ============================================================================
 *
 * "첨부PPT 생성"이란: 표지 + 선택한 첨부 항목들을 사용자가 고른 순서대로 한 파일로 합쳐서
 * 생성한다 (2026-09-01 사용자 확인). 웹 화면의 모달에서 체크/드래그로 항목과 순서를 고르고,
 * 각 항목의 템플릿 파일을 올린 뒤 "생성"을 누르면 이 엔드포인트 하나로 전부 처리된다.
 *
 * 이 세트를 이루는 파일 전체 (전부 새로 추가된 파일 — 기존 파일을 수정한 곳은 없음):
 *   화면(UI)
 *     src/views/attachment-bundle-widget.ts   화면 HTML + 클라이언트 JS 전체
 *   조립/생성 라우트
 *     src/routes/ppt-attachment-bundle.ts      (이 파일) 표지+선택 항목을 순서대로 합치는 진입점
 *     src/routes/ppt-cover.ts                  0. 정성제안서 첨부 표지
 *     src/routes/ppt-schedule.ts               1. 감리원 일정 현황표
 *     src/routes/ppt-career.ts                 2. 투입 감리원별 실적 및 경력
 *     src/routes/ppt-consent.ts                3. 비상근 감리원 참여 동의서
 *     src/routes/ppt-financial-statement.ts    4. 표준재무제표 (NAS의 회사 표준재무제표 원본을
 *                                               페이지별 이미지로 뽑아 범용 템플릿에 붙여넣음)
 *     src/routes/ppt-business-registration.ts  5. 사업자등록증 ("범용 템플릿(도장O)" — 슬라이드
 *     src/routes/ppt-tax-certificate.ts        6. 국세 납세증명서    1장에 큰 자리=NAS 스캔본/
 *     src/routes/ppt-local-tax-certificate.ts  7. 지방세 납세증명서  PDF 첫 페이지, 작은 자리=
 *     src/routes/ppt-corporate-registry.ts     8. 법인등기부등본     사용자가 고른 도장. 이
 *                                               4개 항목이 템플릿 파일 하나(범용 템플릿
 *                                               (도장O))를 공유한다 — 2026-09-03 사용자 확인)
 *   공용 OOXML 조립 유틸 (위 라우트들이 나눠서 사용)
 *     src/lib/pptx-runtext.ts                  [placeholder] 텍스트 치환 (런 분산 대응)
 *     src/lib/pptx-table-rows.ts               일정표류 표 동적 확장(rowSpan/vMerge, 페이지 분할)
 *     src/lib/pptx-career-rows.ts              실적/경력 표 채우기 + 클러스터 병합 + 색상 규칙
 *     src/lib/pptx-deck.ts                     템플릿 슬라이드(1~N장)를 데이터 개수만큼 복제
 *     src/lib/pptx-cover-toc.ts                표지의 번호 매긴 목차를 선택 항목으로 재작성
 *     src/lib/pptx-merge.ts                    완성된 여러 pptx를 한 파일로 이어붙이기
 *     src/lib/pptx-image-swap.ts               템플릿의 placeholder 이미지를 실제 이미지로
 *                                               교체(원본 비율 유지) + pptx에서 이미지 추출
 *     src/lib/pptx-stamped-doc.ts              "범용 템플릿(도장O)" 조립 공용 함수(5~8번 공유)
 *     src/lib/pdf-render.ts                    PDF 첫 페이지를 PNG로 렌더링(지방세/법인등기부등본)
 *     src/lib/nas-client.ts                    Synology NAS(QuickConnect)에서 파일 조회
 *
 * 다른 사이트(예: proposal-portal-main)로 이식하는 방법:
 *   1) 위 파일 전부를 같은 상대 경로로 복사
 *   2) package.json에 "jszip" 의존성 추가 (proposal-portal-main은 현재 jszip을 서버
 *      의존성으로 안 쓰고 있음 — 2026-09-02 확인)
 *   3) index.tsx에 import 5줄 + app.route(...) 5줄 추가 (이 리포의 src/index.tsx
 *      "[ppt-portal 추가 기능]" 배너 부분을 그대로 참고)
 *   4) 사업 목록/상세 화면 아무 곳에 renderAttachmentBundleWidget()의 반환값(html,
 *      script)을 끼워넣고, 버튼 하나 추가: onclick="openBundleModal(사업id, this)"
 *   DB 쪽은 손댈 게 없다 — proposal-portal-main의 query/queryOne 헬퍼 시그니처가
 *   이 리포와 동일해서 그대로 호출된다 (2026-09-02 확인).
 *
 * 항목 종류(ATTACHMENT_TYPES)는 지금은 3개(일정표/실적경력/동의서)뿐이지만, 나중에 다른
 * 첨부가 추가될 수 있으므로 이 레지스트리에 한 줄만 추가하면 되도록 설계했다 — id, 표지
 * 목차에 쓸 라벨, 실제 생성 함수를 한 군데(ATTACHMENT_TYPES)에 묶어둔다.
 *
 * 표지(0번)는 체크 대상이 아니라 항상 자동으로 맨 앞에 붙는다. 표지 안의 번호 매긴 목차는
 * 이번에 실제로 선택된 항목들의 라벨로, 선택된 순서 그대로 다시 번호를 매겨 채워진다.
 *
 * 합치는 방식(mergeDecksSharingMaster)은 모든 첨부 템플릿이 같은 마스터/레이아웃/테마를
 * 쓴다는 전제에서 슬라이드 본문만 이어붙이는 단순한 방식이다 — 자세한 건
 * src/lib/pptx-merge.ts 참고.
 *
 * ⚠️ 템플릿 파일들은 이 요청 처리 중에만 메모리에 존재하고 저장하지 않습니다
 *    (DB/디스크 저장 없음 — 2026-09-01 사용자 확인: PPT 템플릿 DB 적재는 절대 금지, 지금은
 *    매번 업로드하는 현재 방식 유지).
 *
 * POST /api/ppt-attachment-bundle/:projectId
 *   multipart/form-data:
 *     - cover: File (.pptx) — "0. 정성제안서 첨부 표지" 템플릿, 항상 필요
 *     - order: JSON 배열 문자열, 예: '["schedule","consent"]' — 체크된 항목 id를 원하는
 *       순서대로 나열 (최소 1개 필요)
 *     - order에 들어간 각 id와 같은 이름의 파일 필드 — 그 항목의 템플릿 (예: 'schedule' 필드)
 *     - additionalPhaseIds: JSON 배열 문자열 — order에 'schedule'이 있을 때만 사용
 */
import { Hono } from 'hono'
import type JSZip from 'jszip'
import { buildScheduleZip } from './ppt-schedule.js'
import { buildCareerZip, type FreeCareerOptions } from './ppt-career.js'
import { buildConsentZip } from './ppt-consent.js'
import { buildFinancialStatementZip } from './ppt-financial-statement.js'
import { buildBusinessRegistrationZip } from './ppt-business-registration.js'
import { buildTaxCertificateZip } from './ppt-tax-certificate.js'
import { buildLocalTaxCertificateZip } from './ppt-local-tax-certificate.js'
import { buildCorporateRegistryZip } from './ppt-corporate-registry.js'
import { buildInsuranceEnrollmentZip } from './ppt-insurance-enrollment.js'
import { buildEmploymentCertificateZip } from './ppt-employment-certificate.js'
import { buildCareerCertificateZip } from './ppt-career-certificate.js'
import { buildStaffingStatusZip } from './ppt-staffing-status.js'
import { buildLicenseCertificateZip } from './ppt-license-certificate.js'
import type { CompanyStampType } from '../lib/nas-client.js'
import { buildCoverZip } from './ppt-cover.js'
import { mergeDecksSharingMaster } from '../lib/pptx-merge.js'

const app = new Hono()

/** "범용 템플릿(도장O)" 계열 항목(사업자등록증/국세·지방세 납세증명서/법인등기부등본)이
 *  전부 같은 stampType 검증을 공유해서 뺐다(2026-09-03 — 이제 4곳에서 씀). */
function validateStampType(form: FormData): CompanyStampType {
  const stampType = form.get('stampType')
  if (stampType !== '원본대조필' && stampType !== '사실과상위없음' && stampType !== '사용인감') {
    throw new Error('찍을 도장 종류(원본대조필/사실과상위없음/사용인감)를 선택해주세요')
  }
  return stampType
}

/** form 에서 stampNumber(1~5)를 파싱. 범위 밖이거나 없으면 1. */
function parseStampNumber(form: FormData, key = 'stampNumber'): number {
  const raw = Number(form.get(key))
  return Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : 1
}

/** 각 항목 생성 결과 요약 */
export interface AttachmentItemSummary {
  key: string
  label: string
  /** 인력 데이터를 참조하는 서류 여부 (repeat_per_person과 동일한 기준) */
  isPersonBased: boolean
  slideCount: number
  /** 인원 수 (인력반복 서류에서 채워짐) */
  personCount?: number
  /** 건너뛴 인원 목록 (이름 없음 등) */
  skipped?: string[]
  /** 추가 상세 메시지 */
  detail?: string
}

/** 첨부 항목 레지스트리 — 나중에 새 첨부가 생기면 여기에 한 줄만 추가하면 된다.
 *  build()의 titlePrefix는 이 항목이 선택된 순서에서 몇 번째인지("1. " 등)이며, 각 항목의
 *  실제 슬라이드 제목([제목] 자리)에 그대로 반영된다 — 표지 목차 번호와 맞춰서. */
const ATTACHMENT_TYPES: Record<
  string,
  {
    label: string
    isPersonBased: boolean
    build: (buf: Buffer, projectId: number, form: FormData, titlePrefix: string) => Promise<{ zip: JSZip; summary: Omit<AttachmentItemSummary, 'key' | 'label' | 'isPersonBased'> }>
  }
> = {
  schedule: {
    label: '감리원 일정 현황표',
    isPersonBased: true,
    build: async (buf, projectId, form, titlePrefix) => {
      let additionalPhaseIds: number[] = []
      const raw = form.get('additionalPhaseIds')
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) additionalPhaseIds = parsed.map(Number).filter(n => !Number.isNaN(n))
      }
      const { zip, auditorCount, pageCount } = await buildScheduleZip(buf, projectId, additionalPhaseIds, titlePrefix)
      return { zip, summary: { slideCount: pageCount, personCount: auditorCount, detail: `감리원 ${auditorCount}명` } }
    },
  },
  career: {
    label: '투입 감리원별 실적 및 경력',
    isPersonBased: true,
    build: async (buf, projectId, form, titlePrefix) => {
      const onePage = form.get('careerOnePage') === 'true'
      let freeOpts: FreeCareerOptions | undefined
      if (projectId === 0) {
        const kwRaw = form.get('freeKeywords')
        const mapRaw = form.get('freeMappings')
        const namesRaw = form.get('personnelNames')
        freeOpts = {
          keywords: kwRaw ? JSON.parse(kwRaw as string) : [],
          mappings: mapRaw ? JSON.parse(mapRaw as string) : [],
          personnelNames: namesRaw ? JSON.parse(namesRaw as string) : [],
        }
      }
      const { zip, personCount } = await buildCareerZip(buf, projectId, titlePrefix, onePage, freeOpts)
      return { zip, summary: { slideCount: personCount * 2, personCount, detail: `투입인력 ${personCount}명` } }
    },
  },
  consent: {
    label: '비상근 감리원 참여 동의서',
    isPersonBased: true,
    build: async (buf, projectId, _form, titlePrefix) => {
      const { zip, peopleCount } = await buildConsentZip(buf, projectId, titlePrefix)
      return { zip, summary: { slideCount: peopleCount, personCount: peopleCount, detail: `비상근 ${peopleCount}명` } }
    },
  },
  financial: {
    label: '표준재무제표',
    isPersonBased: false,
    build: async (buf, projectId, _form, titlePrefix) => {
      const { zip } = await buildFinancialStatementZip(buf, projectId, titlePrefix)
      return { zip, summary: { slideCount: 1 } }
    },
  },
  bizreg: {
    label: '사업자등록증',
    isPersonBased: false,
    build: async (buf, projectId, form, titlePrefix) => {
      const stampType = validateStampType(form)
      const { zip } = await buildBusinessRegistrationZip(buf, projectId, stampType, titlePrefix)
      return { zip, summary: { slideCount: 1 } }
    },
  },
  taxcert: {
    label: '국세 납세증명서',
    isPersonBased: false,
    build: async (buf, projectId, form, titlePrefix) => {
      const stampType = validateStampType(form)
      const { zip } = await buildTaxCertificateZip(buf, projectId, stampType, titlePrefix)
      return { zip, summary: { slideCount: 1 } }
    },
  },
  localtaxcert: {
    label: '지방세 납세증명서',
    isPersonBased: false,
    build: async (buf, projectId, form, titlePrefix) => {
      const stampType = validateStampType(form)
      const { zip } = await buildLocalTaxCertificateZip(buf, projectId, stampType, titlePrefix)
      return { zip, summary: { slideCount: 1 } }
    },
  },
  corpregistry: {
    label: '법인등기부등본',
    isPersonBased: false,
    build: async (buf, projectId, form, titlePrefix) => {
      const stampType = validateStampType(form)
      const includeCancelledRaw = form.get('corpRegistryIncludeCancelled')
      if (includeCancelledRaw !== 'true' && includeCancelledRaw !== 'false') {
        throw new Error('법인등기부등본 말소사항 포함 여부를 선택해주세요')
      }
      const { zip } = await buildCorporateRegistryZip(buf, projectId, includeCancelledRaw === 'true', stampType, titlePrefix)
      return { zip, summary: { slideCount: 1 } }
    },
  },
  insurance: {
    label: '4대보험 가입확인서',
    isPersonBased: false,
    build: async (buf, projectId, form, titlePrefix) => {
      const stampType = validateStampType(form)
      const { zip } = await buildInsuranceEnrollmentZip(buf, projectId, stampType, titlePrefix)
      return { zip, summary: { slideCount: 1 } }
    },
  },
  employmentCert: {
    label: '재직증명서',
    isPersonBased: true,
    build: async (buf, projectId, form, titlePrefix) => {
      // 자유 생성(projectId=0)일 때는 personnelNames 에서 이름 목록을 직접 읽는다
      const freeNames: string[] = projectId === 0
        ? (() => {
            try {
              const parsed = JSON.parse(form.get('personnelNames') as string || '[]')
              return (parsed as { name: string; domain: string }[]).map(p => p.name).filter(Boolean)
            } catch { return [] }
          })()
        : []
      // 자유 생성 시 사용자가 선택한 날짜(YYYY-MM-DD) — 비어있으면 오늘 날짜 fallback
      const freeDeadlineDate = projectId === 0 ? (form.get('freeDeadlineDate') as string || '') : ''
      const { zip, personCount, skipped } = await buildEmploymentCertificateZip(buf, projectId, titlePrefix, freeNames, freeDeadlineDate)
      return { zip, summary: { slideCount: personCount, personCount, skipped, detail: `${personCount}명` + (skipped.length ? ` (${skipped.length}명 제외)` : '') } }
    },
  },
  careerCert: {
    label: '경력증명서',
    isPersonBased: true,
    build: async (buf, projectId, form, titlePrefix) => {
      const withStamp = form.get('careerCertWithStamp') === 'true'
      const rawStampType = form.get('careerCertStampType')
      // 서류 도장에는 사용인감 미사용 — 원본대조필/사실과상위없음만 허용
      const stampType: CompanyStampType =
        rawStampType === '사실과상위없음' ? '사실과상위없음' : '원본대조필'
      const stampNumber = parseStampNumber(form, 'careerCertStampNumber')
      // 자유 생성(projectId=0)일 때는 personnelNames 에서 이름 목록을 직접 읽는다
      // parseFreePersonnel이 { name, domain } 객체 배열을 반환하므로 .name만 추출
      const freeNames: string[] = projectId === 0
        ? (() => {
            try {
              const parsed = JSON.parse(form.get('personnelNames') as string || '[]')
              return (parsed as { name: string; domain: string }[]).map(p => p.name).filter(Boolean)
            } catch { return [] }
          })()
        : []
      const { zip, personCount, skipped } =
        await buildCareerCertificateZip(buf, projectId, withStamp, stampType, titlePrefix, freeNames, stampNumber)
      const stampLabel = withStamp ? ` · ${stampType}${stampNumber}` : ''
      return {
        zip,
        summary: {
          slideCount: personCount,
          personCount,
          skipped,
          detail: `${personCount}명${stampLabel}` + (skipped.length ? ` (${skipped.length}명 제외)` : ''),
        },
      }
    },
  },
  staffingStatus: {
    label: '상근감리원인력현황',
    isPersonBased: true,
    build: async (buf, projectId, _form, titlePrefix) => {
      const { zip, personCount, pageCount } = await buildStaffingStatusZip(buf, projectId, titlePrefix)
      return { zip, summary: { slideCount: pageCount, personCount, detail: `상근감리원 ${personCount}명` } }
    },
  },
  licenseCert: {
    label: '자격증사본',
    isPersonBased: true,
    build: async (buf, projectId, form, titlePrefix) => {
      const withStamp = form.get('licenseCertWithStamp') === 'true'
      const rawStampType = form.get('licenseCertStampType')
      // 서류 도장에는 사용인감 미사용 — 원본대조필/사실과상위없음만 허용
      const stampType: CompanyStampType =
        rawStampType === '사실과상위없음' ? '사실과상위없음' : '원본대조필'
      const stampNumber = parseStampNumber(form, 'licenseCertStampNumber')
      // 자유 생성(projectId=0)일 때는 personnelNames 에서 이름 목록을 직접 읽는다
      const freeNames: string[] = projectId === 0
        ? (() => {
            try {
              const parsed = JSON.parse(form.get('personnelNames') as string || '[]')
              return (parsed as { name: string; domain: string }[]).map(p => p.name).filter(Boolean)
            } catch { return [] }
          })()
        : []
      const { zip, personCount, slideCount, skipped } =
        await buildLicenseCertificateZip(buf, projectId, withStamp, stampType, titlePrefix, freeNames, stampNumber)
      const stampLabel = withStamp ? ` · ${stampType}${stampNumber}` : ''
      return {
        zip,
        summary: {
          slideCount,
          personCount,
          skipped,
          detail: `${personCount}명 ${slideCount}슬라이드${stampLabel}` + (skipped.length ? ` (${skipped.length}명 제외)` : ''),
        },
      }
    },
  },
}

app.post('/:projectId', async (c) => {
  try {
    const projectId = Number(c.req.param('projectId'))
    if (isNaN(projectId) || projectId < 0) return c.json({ ok: false, error: 'projectId가 올바르지 않습니다' }, 400)

    const contentType = c.req.header('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return c.json({ ok: false, error: 'multipart/form-data 로 보내주세요' }, 400)
    }
    const form = await c.req.formData()

    const coverFile = form.get('cover') as File | null
    if (!coverFile || coverFile.size === 0) {
      return c.json({ ok: false, error: '표지 템플릿(.pptx) 파일이 필요합니다' }, 400)
    }

    const orderRaw = form.get('order')
    if (typeof orderRaw !== 'string' || !orderRaw.trim()) {
      return c.json({ ok: false, error: '생성할 항목 순서(order)가 필요합니다' }, 400)
    }
    let order: string[]
    try {
      const parsed = JSON.parse(orderRaw)
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error()
      order = parsed.map(String)
    } catch {
      return c.json({ ok: false, error: 'order는 비어있지 않은 JSON 배열이어야 합니다' }, 400)
    }
    for (const id of order) {
      if (!ATTACHMENT_TYPES[id]) return c.json({ ok: false, error: `알 수 없는 첨부 항목: ${id}` }, 400)
    }

    // ── 선택된 항목들을 순서대로 생성 (제목 앞 번호는 선택 순서 그대로: 1. 2. 3. ...) ────
    const sectionZips: JSZip[] = []
    const summaries: AttachmentItemSummary[] = []
    for (let i = 0; i < order.length; i++) {
      const id = order[i]
      const file = form.get(id) as File | null
      if (!file || file.size === 0) {
        return c.json({ ok: false, error: `"${ATTACHMENT_TYPES[id].label}" 템플릿(.pptx) 파일이 필요합니다` }, 400)
      }
      const buf = Buffer.from(await file.arrayBuffer())
      const { zip, summary } = await ATTACHMENT_TYPES[id].build(buf, projectId, form, `${i + 1}. `)
      sectionZips.push(zip)
      summaries.push({
        key: id,
        label: ATTACHMENT_TYPES[id].label,
        isPersonBased: ATTACHMENT_TYPES[id].isPersonBased,
        ...summary,
      })
    }

    // ── 표지: 선택된 순서 그대로 라벨 목록을 만들어 번호를 새로 매긴다 ──────
    const coverBuf = Buffer.from(await coverFile.arrayBuffer())
    const labels = order.map(id => ATTACHMENT_TYPES[id].label)
    const { zip: coverZip, projectName } = await buildCoverZip(coverBuf, projectId, labels)

    const merged = await mergeDecksSharingMaster([coverZip, ...sectionZips])
    const outBuffer = await merged.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })

    const safeName = (projectName || '자유생성').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    c.header('Content-Disposition', `attachment; filename="${encodeURIComponent('A_첨부_' + safeName)}.pptx"`)
    // 항목별 생성 결과 요약 — 프론트에서 팝업으로 표시
    c.header('X-Bundle-Summary', encodeURIComponent(JSON.stringify(summaries)))
    return c.body(new Uint8Array(outBuffer))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ppt-attachment-bundle] 오류:', e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

export default app
