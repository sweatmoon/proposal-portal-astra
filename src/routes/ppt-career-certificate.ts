/**
 * [ppt-portal 추가 기능 — 첨부PPT 생성 세트] "경력증명서(감리협회)" PPT 생성
 *
 * 기존 방식(재직증명서 엑셀 기반 텍스트 플레이스홀더)에서 변경됨(2026-09-10):
 *   NAS "99.악티보포털참조용/02.제안/06.경력증명서(감리협회)" 폴더에서
 *   파일명에 인력 이름이 포함된 PDF를 찾아 → pdfAllPagesToPng()로 렌더링 →
 *   범용 템플릿(도장O/도장X 선택 가능)의 큰 이미지 자리에 슬라이드로 삽입한다.
 *
 * 동작 흐름:
 *   1. proposal_members 에서 이 사업 투입 인력 이름 목록 조회
 *   2. fetchCareerCertPdfs(names) — NAS 폴더에서 이름별 최신 PDF 일괄 취득
 *   3. 이름 순서대로 각 PDF → pdfAllPagesToPng() → PNG 배열
 *   4. buildStampedDeckZip() 으로 슬라이드 조립
 *      - withStamp=true  → fetchCompanyStampPng() 결과를 작은 자리에 삽입
 *      - withStamp=false → 작은 자리 비움(null 전달)
 *   5. 인원별 슬라이드를 하나의 PPTX에 순서대로 합산
 *   6. PDF를 찾지 못한 인력은 skipped 배열에 수집
 *
 * POST /api/ppt-career-certificate/:projectId
 *   multipart/form-data:
 *     - template  : File (.pptx, 범용 템플릿 — 큰 이미지 자리 + 작은 이미지 자리)
 *     - withStamp : "true" | "false"  (도장 첨부 여부, 기본 "false")
 *     - stampType : "원본대조필" | "사실과상위없음"  (withStamp=true일 때만 사용)
 */
import { Hono } from 'hono'
import type JSZip from 'jszip'
import type { CompanyStampType } from '../lib/nas-client.js'
import { fetchCareerCertPdfs, fetchCompanyStampPng } from '../lib/nas-client.js'
import { pdfAllPagesToPng } from '../lib/pdf-render.js'
import { buildStampedDeckZip } from '../lib/pptx-stamped-doc.js'
import { applyPlaceholderMap } from '../lib/pptx-runtext.js'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

const PAGE_TITLE = '경력증명서'
const STAMP_TYPES: CompanyStampType[] = ['원본대조필', '사실과상위없음', '사용인감']

export interface CareerCertificateZipResult {
  zip: JSZip
  personCount: number
  skipped: string[]
  projectName: string
}

/**
 * 이 파일의 핵심 로직 — 단독 다운로드 라우트와 첨부 묶음 라우트 양쪽에서 호출한다.
 *
 * @param templateBuf        범용 템플릿 pptx 바이트 (큰 이미지 자리 + 작은 이미지 자리 2개)
 * @param projectId          사업 ID (0이면 자유 생성 — freePersonnelNames 필수)
 * @param withStamp          도장 이미지를 작은 자리에 삽입할지 여부
 * @param stampType          withStamp=true 일 때 사용할 도장 종류
 * @param titlePrefix        첨부PPT 묶음에서 이 항목이 몇 번째인지 앞 번호 ("3. " 등), 단독이면 ""
 * @param freePersonnelNames projectId=0(자유 생성) 시 직접 전달하는 인력 이름 배열
 */
export async function buildCareerCertificateZip(
  templateBuf: Buffer,
  projectId: number,
  withStamp = false,
  stampType: CompanyStampType = '원본대조필',
  titlePrefix = '',
  freePersonnelNames: string[] = [],
  stampNumber = 1
): Promise<CareerCertificateZipResult> {
  let names: string[]
  let projectName: string

  if (projectId === 0) {
    // 자유 생성 — DB 조회 없이 전달받은 이름 목록 사용
    if (!freePersonnelNames.length) throw new Error('자유 생성 시 인력 이름 목록(personnelNames)이 필요합니다')
    names = freePersonnelNames
    projectName = '자유생성'
  } else {
    const [project, members] = await Promise.all([
      queryOne<{ project_name: string }>(`SELECT project_name FROM audit_projects WHERE id = $1`, [projectId]),
      query<{ person_name: string }>(`SELECT person_name FROM proposal_members WHERE project_id = $1 ORDER BY id ASC`, [projectId]),
    ])
    if (!project) throw new Error('사업을 찾을 수 없습니다')
    if (!members.length) throw new Error('이 사업에 투입된 인력이 없습니다')
    names = members.map(m => m.person_name)
    projectName = project.project_name
  }

  // NAS에서 이름별 PDF + 도장 이미지 병렬 취득
  const [pdfMap, stampPng] = await Promise.all([
    fetchCareerCertPdfs(names),
    withStamp ? fetchCompanyStampPng(stampType, stampNumber) : Promise.resolve(null),
  ])

  const skipped: string[] = []
  const personCount = names.filter(n => !!pdfMap.get(n)).length

  if (personCount === 0) {
    const nameList = Array.isArray(names) ? names.join(', ') : String(names)
    throw new Error(
      `NAS 경력증명서 폴더에서 투입 인력 중 매칭되는 PDF가 한 개도 없습니다 (${nameList})`
    )
  }

  // 공통 플레이스홀더 맵 (제목·사업명) — [제목]은 슬라이드별로 이름 포함 버전으로 덮어쓸 예정
  const baseTitle = `${titlePrefix}${PAGE_TITLE}`
  const commonMap: Record<string, string> = {
    '[제목]': baseTitle,
    '[감리사업명]': projectName,
  }

  // 인원별 PNG 배열 수집 (이름·페이지수 정보 보존)
  interface PersonPages { name: string; pages: Buffer[] }
  const perPerson: PersonPages[] = []
  const allBigImages: Buffer[] = []
  for (const name of names) {
    const pdfBuf = pdfMap.get(name) ?? null
    if (!pdfBuf) {
      skipped.push(name)
      continue
    }
    const pages = await pdfAllPagesToPng(pdfBuf)
    perPerson.push({ name, pages })
    allBigImages.push(...pages)
  }

  // buildStampedDeckZip 활용 — 전원 슬라이드를 한 PPTX에 조립
  const zip = await buildStampedDeckZip(
    templateBuf,
    commonMap,
    allBigImages,
    stampPng,
    'careercert'
  )

  // 슬라이드별 제목 패치 — "경력증명서 – 김현호" (1장) 또는 "경력증명서 – 김현호 (1/2)" (여러 장)
  let slideIdx = 1
  for (const { name, pages } of perPerson) {
    const total = pages.length
    for (let pi = 0; pi < total; pi++) {
      const pageSuffix = total > 1 ? ` (${pi + 1}/${total})` : ''
      const titleForSlide = `${baseTitle} – ${name}${pageSuffix}`
      const slideFile = `ppt/slides/slide${slideIdx}.xml`
      const slideXmlFile = zip.file(slideFile)
      if (slideXmlFile) {
        const xml = await slideXmlFile.async('string')
        const patched = applyPlaceholderMap(xml, { '[제목]': titleForSlide })
        if (patched !== xml) zip.file(slideFile, patched)
      }
      slideIdx++
    }
  }

  return { zip, personCount, skipped, projectName }
}

app.post('/:projectId', async (c) => {
  try {
    const projectId = Number(c.req.param('projectId'))
    if (!projectId) return c.json({ ok: false, error: 'projectId가 필요합니다' }, 400)

    const contentType = c.req.header('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return c.json({ ok: false, error: 'multipart/form-data 로 template 파일을 보내주세요' }, 400)
    }
    const form = await c.req.formData()
    const file = form.get('template') as File | null
    if (!file || file.size === 0) {
      return c.json({ ok: false, error: '첨부 템플릿(.pptx) 파일이 필요합니다' }, 400)
    }

    const withStamp = form.get('withStamp') === 'true'
    let stampType: CompanyStampType = '원본대조필'
    if (withStamp) {
      const raw = form.get('stampType')
      if (typeof raw !== 'string' || !STAMP_TYPES.includes(raw as CompanyStampType)) {
        return c.json({ ok: false, error: 'stampType은 "원본대조필" 또는 "사실과상위없음" 또는 "사용인감"이어야 합니다' }, 400)
      }
      stampType = raw as CompanyStampType
    }

    const templateBuf = Buffer.from(await file.arrayBuffer())
    const { zip, personCount, skipped, projectName } =
      await buildCareerCertificateZip(templateBuf, projectId, withStamp, stampType)

    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const safeName = projectName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    c.header('Content-Disposition', `attachment; filename="${encodeURIComponent('경력증명서_' + safeName)}.pptx"`)
    c.header('X-Slide-Count', String(personCount))
    c.header('X-Skipped', encodeURIComponent(skipped.join(',')))
    return c.body(new Uint8Array(outBuffer))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ppt-career-certificate] 오류:', e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

export default app
