/**
 * [ppt-portal 추가 기능 — 첨부PPT 생성 세트] "자격증사본" PPT 생성
 *
 * 동작 흐름:
 *   1. proposal_members 에서 이 사업 투입 인력 이름 목록 조회
 *   2. fetchAuditorCertificatePptxs(names) — NAS 서브폴더 탐색, 이름별 PPTX 취득
 *   3. 인원별 PPTX의 각 슬라이드 콘텐츠(graphicFrame + p:pic들)를 템플릿 슬라이드에 이식
 *      - 템플릿의 [제목] sp → 치환 후 유지
 *      - NAS pptx 슬라이드의 graphicFrame(표) + p:pic들(자격증 이미지) → spTree에 복사
 *      - 미디어 파일(image*.png) → 템플릿 zip에 복사, rId 충돌 방지 리매핑
 *      - 도장(withStamp=true) → 미디어 복사 후 p:pic을 spTree 맨 마지막에 삽입 (최상위 레이어)
 *   4. 인원별 슬라이드를 하나의 PPTX로 조립
 *
 * POST /api/ppt-license-certificate/:projectId
 *   multipart/form-data:
 *     - template  : File (.pptx, 제목 [제목] sp + 도장 p:pic 포함 템플릿)
 *     - withStamp : "true" | "false"
 *     - stampType : "원본대조필" | "사실과상위없음"
 */
import { Hono } from 'hono'
import JSZip from 'jszip'
import type { CompanyStampType } from '../lib/nas-client.js'
import { fetchAuditorCertificatePptxs, fetchCompanyStampPng } from '../lib/nas-client.js'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

const PAGE_TITLE = '자격증사본'
const STAMP_TYPES: CompanyStampType[] = ['원본대조필', '사실과상위없음', '사용인감']

export interface LicenseCertificateZipResult {
  zip: JSZip
  personCount: number
  slideCount: number
  skipped: string[]
  projectName: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: [제목] 텍스트 치환 — 런이 여러 개로 분리된 경우도 처리
// "["  "제목"  "]" 가 각각 별도 <a:r>로 분리돼 있을 수 있으므로
// 모든 <a:t> 텍스트를 이어붙인 문자열에서 [제목] 패턴을 찾아
// 첫 번째 런에 전체 치환값을 쓰고 나머지 런 제거
// ─────────────────────────────────────────────────────────────────────────────
function replaceTitleInSpXml(spXml: string, replacement: string): string {
  // 모든 a:r 블록 목록
  const runs = [...spXml.matchAll(/<a:r>[\s\S]*?<\/a:r>/g)]
  if (!runs.length) return spXml

  // 각 런의 텍스트 이어붙이기
  const fullText = runs.map(r => {
    const m = r[0].match(/<a:t>([^<]*)<\/a:t>/)
    return m ? m[1] : ''
  }).join('')

  if (!fullText.includes('[제목]')) return spXml

  // 분리된 런들을 제거하고, 첫 번째 런의 <a:t>에 치환값을 넣는다
  // 1) 기존 런 전체 제거
  let result = spXml.replace(/<a:r>[\s\S]*?<\/a:r>/g, '___RUNS___')
  // 2) 첫 번째 런만 치환값으로 교체
  const firstRun = runs[0][0].replace(/<a:t>[^<]*<\/a:t>/, `<a:t>${escapeXml(replacement)}</a:t>`)
  result = result.replace('___RUNS___', firstRun)
  // 3) 나머지 ___RUNS___ 제거
  result = result.replace(/___RUNS___/g, '')
  return result
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ─────────────────────────────────────────────────────────────────────────────
// 핵심: 자격증 pptx의 슬라이드 1장을 템플릿 기반으로 조립해 zip에 추가
// ─────────────────────────────────────────────────────────────────────────────
async function buildOneSlide(params: {
  outZip: JSZip            // 결과 zip (누적)
  templateSlideXml: string // 템플릿 slide1.xml 원본
  templateRelsXml: string  // 템플릿 slide1.xml.rels 원본
  templateMediaFiles: Map<string, Uint8Array> // 템플릿 미디어 (도장 등)
  srcZip: JSZip            // NAS 자격증 pptx zip
  srcSlidePath: string     // 'ppt/slides/slideN.xml'
  slideIndex: number       // 결과에서 몇 번째 슬라이드인지 (1-based)
  titleText: string        // [제목] 치환 텍스트
  stampPng: Buffer | null  // 도장 이미지 (null이면 도장 없음)
  stampRid: string         // 템플릿에서 도장 rId (없으면 '')
}): Promise<void> {
  const {
    outZip, templateSlideXml, templateRelsXml, templateMediaFiles,
    srcZip, srcSlidePath, slideIndex, titleText, stampPng, stampRid,
  } = params

  const slideNum = slideIndex
  const outSlidePath = `ppt/slides/slide${slideNum}.xml`
  const outRelsPath  = `ppt/slides/_rels/slide${slideNum}.xml.rels`

  // ── 1. 소스 슬라이드 XML / rels 읽기 ─────────────────────────────────────
  const srcXml  = (await srcZip.file(srcSlidePath)!.async('string'))
  const srcRelsPath = srcSlidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
  const srcRelsFile = srcZip.file(srcRelsPath)
  const srcRelsXml  = srcRelsFile ? (await srcRelsFile.async('string')) : ''


  // ── 2. 소스 rels에서 미디어 rId → Target 맵 ─────────────────────────────
  // <Relationship ... /> 전체를 따옴표 인식 방식으로 파싱
  // [^/]* 패턴은 Target="../media/..." 안의 '/'에서 잘려서 사용 불가
  // → 대신 태그 끝(/> 또는 >)을 따옴표 밖에서만 인식하도록 수동 파싱
  const srcRidToTarget = new Map<string, string>()
  // 각 Relationship 요소를 "/>", ">" 단위로 추출 (따옴표 내부 / 무시)
  for (const relM of srcRelsXml.matchAll(/<Relationship\b([^>]*(?:"[^"]*"[^>]*)*)\/>/g)) {
    const attrs = relM[1]
    const idM  = attrs.match(/\bId="([^"]+)"/)
    const tgtM = attrs.match(/\bTarget="([^"]+)"/)
    if (idM && tgtM && tgtM[1].startsWith('../media/')) {
      srcRidToTarget.set(idM[1], tgtM[1])
    }
  }

  // ── 3. 소스 미디어를 outZip에 복사, rId 리매핑 ───────────────────────────
  // 충돌 방지: 결과 pptx 내 media 파일명을 slide별로 고유하게 만든다
  const ridRemap = new Map<string, string>() // 소스 rId → 새 rId
  const newRels: string[] = []

  // 템플릿 rels에 이미 있는 rId 목록 수집
  const existingRids = new Set<string>()
  for (const m of templateRelsXml.matchAll(/Id="([^"]+)"/g)) existingRids.add(m[1])

  let ridCounter = 100 + slideNum * 100 // 슬라이드별 고유 시작 번호

  for (const [srcRid, srcTarget] of srcRidToTarget) {
    // '../media/image1.png' → 'ppt/media/image1.png'
    const srcMediaPath = 'ppt/' + srcTarget.replace('../', '')
    const srcMediaFile = srcZip.file(srcMediaPath)
    if (!srcMediaFile) continue

    const mediaData = await srcMediaFile.async('uint8array')
    // 새 파일명: slide{N}_img{M}.png
    const ext = srcMediaPath.split('.').pop() ?? 'png'
    const newMediaName = `slide${slideNum}_img${ridCounter}.${ext}`
    const newMediaPath = `ppt/media/${newMediaName}`

    outZip.file(newMediaPath, mediaData)

    const newRid = `rId_s${slideNum}_${ridCounter}`
    ridRemap.set(srcRid, newRid)
    newRels.push(
      `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${newMediaName}"/>`
    )
    ridCounter++
  }

  // ── 4. 소스 XML에서 콘텐츠 노드 추출 (graphicFrame + p:pic들, sp는 제외) ─
  // sp는 제목 텍스트박스이므로 복사 제외 — 템플릿의 [제목] sp를 사용
  const contentNodes: string[] = []

  // graphicFrame (표)
  for (const m of srcXml.matchAll(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g)) {
    contentNodes.push(m[0])
  }
  // p:pic (자격증 이미지들) — rId 리매핑 적용
  for (const m of srcXml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)) {
    let picXml = m[0]
    // r:embed="rIdX" → 새 rId로 치환
    picXml = picXml.replace(/r:embed="([^"]+)"/g, (_, rid) => {
      const newRid = ridRemap.get(rid)
      return newRid ? `r:embed="${newRid}"` : `r:embed="${rid}"`
    })
    contentNodes.push(picXml)
  }

  // ── 5. 템플릿 슬라이드 XML 기반으로 결과 슬라이드 조립 ───────────────────
  // 5a. [제목] 치환
  let slideXml = templateSlideXml
  const spMatch = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/)
  if (spMatch) {
    const replacedSp = replaceTitleInSpXml(spMatch[0], titleText)
    slideXml = slideXml.replace(spMatch[0], replacedSp)
  }

  // 5b. 템플릿의 도장 p:pic 추출 (맨 마지막 레이어로 올리기 위해 분리)
  let stampPicXml = ''
  if (stampPng && stampRid) {
    const stampMatch = slideXml.match(new RegExp(`<p:pic>[\\s\\S]*?r:embed="${stampRid}"[\\s\\S]*?<\/p:pic>`))
    if (stampMatch) {
      stampPicXml = stampMatch[0]
      // 템플릿에서 도장 pic 제거 (나중에 맨 마지막에 재삽입)
      slideXml = slideXml.replace(stampMatch[0], '')
    }
  } else {
    // 도장 없음: 템플릿의 도장 p:pic 제거
    slideXml = slideXml.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, '')
  }

  // 5c. </p:spTree> 직전에 콘텐츠 노드들 삽입, 그 다음 도장 pic (최상위 레이어)
  const insertBefore = '</p:spTree>'
  const insertion = contentNodes.join('') + (stampPicXml ? stampPicXml : '')
  slideXml = slideXml.replace(insertBefore, insertion + insertBefore)

  // ── 6. rels 조립 ──────────────────────────────────────────────────────────
  // 템플릿 rels에서 slideLayout rel은 유지, 이미지 rel은 신규 것으로 교체
  const layoutRelMatch = templateRelsXml.match(/<Relationship[^>]+slideLayouts[^>]+\/>/)
  const layoutRel = layoutRelMatch ? layoutRelMatch[0] : ''

  // 도장 rel: withStamp=true 이고 도장 미디어가 templateMediaFiles에 있으면 유지
  let stampRel = ''
  if (stampPng && stampRid) {
    // 템플릿 rels에서 도장(rId2) rel 찾기
    const stampRelMatch = templateRelsXml.match(new RegExp(`<Relationship[^>]+Id="${stampRid}"[^>]+/>`))
    if (stampRelMatch) {
      // 도장 미디어는 이미 templateMediaFiles에서 outZip에 복사됨
      stampRel = stampRelMatch[0]
    }
  }

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${layoutRel}${stampRel}${newRels.join('')}</Relationships>`

  // ── 7. outZip에 슬라이드 파일 저장 ───────────────────────────────────────
  outZip.file(outSlidePath, slideXml)
  outZip.file(outRelsPath, relsXml)
}

// ─────────────────────────────────────────────────────────────────────────────
// presentation.xml 조립 — 슬라이드 목록 + sldMaster/sldLayout 참조
// ─────────────────────────────────────────────────────────────────────────────
async function buildPresentationXml(
  templateZip: JSZip,
  slideCount: number
): Promise<{ presXml: string; presRelsXml: string }> {
  const presXml = await templateZip.file('ppt/presentation.xml')!.async('string')
  const presRelsXml = await templateZip.file('ppt/_rels/presentation.xml.rels')!.async('string')

  // 기존 sldIdLst 제거 후 재구성
  const sldIdEntries = Array.from({ length: slideCount }, (_, i) => {
    const id = 256 + i
    const rId = `rId_slide${i + 1}`
    return `<p:sldId id="${id}" r:id="${rId}"/>`
  }).join('')

  let newPresXml = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${sldIdEntries}</p:sldIdLst>`)

  // presentation.xml.rels: 슬라이드 rel 재구성
  // 기존 슬라이드 rel 제거
  let newPresRels = presRelsXml.replace(/<Relationship[^>]+\/slides\/[^>]+\/>/g, '')
  // 닫는 태그 직전에 새 슬라이드 rel 삽입
  const slideRels = Array.from({ length: slideCount }, (_, i) =>
    `<Relationship Id="rId_slide${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('')
  newPresRels = newPresRels.replace('</Relationships>', slideRels + '</Relationships>')

  return { presXml: newPresXml, presRelsXml: newPresRels }
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────────────────────────────────────────
export async function buildLicenseCertificateZip(
  templateBuf: Buffer,
  projectId: number,
  withStamp = false,
  stampType: CompanyStampType = '원본대조필',
  titlePrefix = '',
  freePersonnelNames: string[] = [],
  stampNumber = 1
): Promise<LicenseCertificateZipResult> {

  // ── 인력 목록 / 사업명 조회 ──────────────────────────────────────────────
  let names: string[]
  let projectName: string

  if (projectId === 0) {
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

  // ── NAS 병렬 취득 ────────────────────────────────────────────────────────
  const [pptxMap, stampPng] = await Promise.all([
    fetchAuditorCertificatePptxs(names),
    withStamp ? fetchCompanyStampPng(stampType, stampNumber) : Promise.resolve(null),
  ])

  const skipped: string[] = []
  const personCount = names.filter(n => !!pptxMap.get(n)).length
  if (personCount === 0) {
    throw new Error(`NAS 자격증사본 폴더에서 매칭되는 PPTX가 없습니다 (${names.join(', ')})`)
  }

  // ── 템플릿 zip 파싱 ───────────────────────────────────────────────────────
  const templateZip = await JSZip.loadAsync(templateBuf)
  const templateSlideXml  = await templateZip.file('ppt/slides/slide1.xml')!.async('string')
  const templateRelsXml   = await templateZip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string')

  // 도장 rId 파악 (템플릿의 p:pic r:embed 값)
  const stampRidMatch = templateSlideXml.match(/<p:pic>[\s\S]*?r:embed="([^"]+)"[\s\S]*?<\/p:pic>/)
  const stampRid = stampRidMatch ? stampRidMatch[1] : ''

  // 템플릿 미디어 수집 (도장 파일 등)
  const templateMediaFiles = new Map<string, Uint8Array>()
  for (const [path, file] of Object.entries(templateZip.files)) {
    if (path.startsWith('ppt/media/')) {
      templateMediaFiles.set(path, await file.async('uint8array'))
    }
  }

  // ── 결과 zip 초기화 (템플릿 전체 복사, 슬라이드 관련 파일은 재구성) ──────
  const outZip = await JSZip.loadAsync(templateBuf)

  // 도장 미디어: withStamp=true이면 템플릿 것 유지, false이면 제거
  // 템플릿 rels에서 stampRid 에 해당하는 Target 추출 (속성 순서 무관)
  function extractTargetForRid(relsXml: string, rid: string): string | null {
    for (const relM of relsXml.matchAll(/<Relationship\b([^>]*(?:"[^"]*"[^>]*)*)\/>/g)) {
      const attrs = relM[1]
      const idM  = attrs.match(/\bId="([^"]+)"/)
      const tgtM = attrs.match(/\bTarget="([^"]+)"/)
      if (idM && tgtM && idM[1] === rid) return tgtM[1]
    }
    return null
  }

  if (!stampPng) {
    // 도장 없음 — 템플릿 미디어 중 도장 파일 제거 (slide rels에서 참조하는 이미지)
    if (stampRid) {
      const target = extractTargetForRid(templateRelsXml, stampRid)
      if (target) {
        const stampMediaPath = 'ppt/' + target.replace('../', '')
        outZip.remove(stampMediaPath)
      }
    }
  } else if (stampPng && stampRid) {
    // 도장 있음 — 템플릿에 있는 도장 미디어 파일을 새 도장 png로 교체
    const target = extractTargetForRid(templateRelsXml, stampRid)
    if (target) {
      const stampMediaPath = 'ppt/' + target.replace('../', '')
      outZip.file(stampMediaPath, stampPng)
    }
  }

  // ── 슬라이드별 조립 ───────────────────────────────────────────────────────
  // 기존 슬라이드 파일 제거 (템플릿의 slide1.xml)
  outZip.remove('ppt/slides/slide1.xml')
  outZip.remove('ppt/slides/_rels/slide1.xml.rels')

  let slideIndex = 1

  for (const name of names) {
    const pptxBuf = pptxMap.get(name) ?? null
    if (!pptxBuf) { skipped.push(name); continue }

    const srcZip = await JSZip.loadAsync(pptxBuf)
    const srcSlides = Object.keys(srcZip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => {
        const na = Number(a.match(/\d+/)![0])
        const nb = Number(b.match(/\d+/)![0])
        return na - nb
      })

    if (!srcSlides.length) { skipped.push(name); continue }

    const totalPages = srcSlides.length

    for (let pi = 0; pi < srcSlides.length; pi++) {
      const srcSlidePath = srcSlides[pi]
      // 1장이면 "자격증사본 – 김현호", 2장 이상이면 "자격증사본 – 김현호 (1/2)" 형식
      const pageSuffix = totalPages > 1 ? ` (${pi + 1}/${totalPages})` : ''
      const titleText = `${titlePrefix}${PAGE_TITLE} – ${name}${pageSuffix}`
      await buildOneSlide({
        outZip,
        templateSlideXml,
        templateRelsXml,
        templateMediaFiles,
        srcZip,
        srcSlidePath,
        slideIndex,
        titleText,
        stampPng,
        stampRid,
      })
      slideIndex++
    }
  }

  const totalSlides = slideIndex - 1
  if (totalSlides === 0) throw new Error('생성된 슬라이드가 없습니다')

  // ── presentation.xml 재구성 ──────────────────────────────────────────────
  const { presXml, presRelsXml } = await buildPresentationXml(templateZip, totalSlides)
  outZip.file('ppt/presentation.xml', presXml)
  outZip.file('ppt/_rels/presentation.xml.rels', presRelsXml)

  // ── [Content_Types].xml — 슬라이드 Override 재구성 ───────────────────────
  const ctXml = await templateZip.file('[Content_Types].xml')!.async('string')
  // 기존 슬라이드 Override 제거 후 재구성
  let newCtXml = ctXml.replace(/<Override[^>]+\/slides\/[^>]+\/>/g, '')
  const slideOverrides = Array.from({ length: totalSlides }, (_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('')
  newCtXml = newCtXml.replace('</Types>', slideOverrides + '</Types>')
  outZip.file('[Content_Types].xml', newCtXml)

  return { zip: outZip, personCount, slideCount: totalSlides, skipped, projectName }
}

// ─────────────────────────────────────────────────────────────────────────────
// 라우트
// ─────────────────────────────────────────────────────────────────────────────
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
    const { zip, personCount, slideCount, skipped, projectName } =
      await buildLicenseCertificateZip(templateBuf, projectId, withStamp, stampType)

    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const safeName = projectName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    c.header('Content-Disposition', `attachment; filename="${encodeURIComponent('자격증사본_' + safeName)}.pptx"`)
    c.header('X-Slide-Count', String(slideCount))
    c.header('X-Person-Count', String(personCount))
    c.header('X-Skipped', encodeURIComponent(skipped.join(',')))
    return c.body(new Uint8Array(outBuffer))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ppt-license-certificate] 오류:', e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

export default app
