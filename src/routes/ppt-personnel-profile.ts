/**
 * [ppt-portal 추가 기능 — 첨부PPT 생성 세트] "전문 역량" PPT 생성
 * — 단계 감리원(3.1) / 핵심기술 점검팀(3.2) / 필수기술·보안·테스트팀(3.3)
 *
 * 1슬라이드짜리 템플릿을 인력 수만큼 복제하고, 각 슬라이드를:
 *   ① [이름], [직위], [소속], [담당분야], [주요이력], [감리수행횟수], [자격보유수]
 *      등 텍스트 플레이스홀더를 applyPlaceholderMap으로 치환
 *   ② 첫 번째 이미지 자리(placeholder 이미지)를 NAS 증명사진으로 교체
 *      (NAS 경로: /activo/04.제안팀/99.악티보포털참조용/02.제안/04.증명사진/증명사진(이름).png)
 *      사진을 못 구한 인력은 템플릿 placeholder 이미지를 그대로 둡니다.
 *
 * 플레이스홀더 목록 (템플릿 pptx에 그대로 입력):
 *   [제목]        섹션 제목 (예: "단계 감리원의 전문 역량") — 호출 쪽에서 지정
 *   [감리사업명]  audit_projects.project_name
 *   [이름]        인력 이름
 *   [직위]        personnel.position (수석감리원/감리원/전문가 등)
 *   [소속]        personnel.company (없으면 "악티보")
 *   [담당분야]    proposal_members.domain
 *   [주요이력]    member_type이 '전문가'이면 personnel.career_expert,
 *                 아니면 personnel.career_summary
 *                 (둘 다 없으면 personnel.career_qualif)
 *   [감리수행횟수] personnel_audit_history 건수 "N 회"
 *   [자격보유수]   personnel_certifications 건수 "N 개"
 *   [유사사업감리경험N] (N=1~5) 유사 감리 이력 최대 5건
 *                       "[카테고리] 사업명 (연도)" 형식
 *                       없으면 빈 문자열 → 해당 행 텍스트 비워줌
 *
 * POST /api/ppt-personnel-profile/:projectId
 *   multipart/form-data:
 *     template   .pptx (1슬라이드)
 *     profileType  'auditor' | 'core' | 'expert' (기본값 'auditor')
 *     titlePrefix  슬라이드 [제목] 앞에 붙을 접두사 (예: "3.1 ")
 *
 * ⚠️ 템플릿 파일은 이 요청 처리 중에만 메모리에 존재하고 저장하지 않습니다.
 */
import { Hono } from 'hono'
import JSZip from 'jszip'
import { query, queryOne } from '../db/client.js'
import { applyPlaceholderMap } from '../lib/pptx-runtext.js'
import { buildMultiSlideDeck } from '../lib/pptx-deck.js'
import {
  findPlaceholderImageTarget,
  replaceSlideImages,
} from '../lib/pptx-image-swap.js'
import { fetchPersonnelPhotos } from '../lib/nas-client.js'

const app = new Hono()

// profileType → 기본 섹션 제목
const SECTION_TITLES: Record<string, string> = {
  auditor: '단계 감리원의 전문 역량',
  core:    '핵심기술 점검팀의 전문 역량',
  expert:  '필수기술, 보안 점검팀 및 테스트팀의 전문 역량',
}

// profileType → proposal_members.member_type 필터
// auditor: 감리원, core: 전문가(핵심기술), expert: 전문가(필수/보안/테스터)
// 필터는 member_group 컬럼 기준으로 구분 (없으면 member_type fallback)
const MEMBER_FILTERS: Record<string, (group: string | null, type: string) => boolean> = {
  auditor: (g, t) => (g ? g.includes('감리') : t === '감리원'),
  core:    (g, _t) => !!(g && g.includes('핵심')),
  expert:  (g,  t) => (g ? (g.includes('필수') || g.includes('보안') || g.includes('테스터'))
                          : t === '전문가' || t === '테스터'),
}

interface MemberRow {
  person_name: string
  domain:      string | null
  member_group: string | null
  member_type:  string
}

interface PersonnelRow {
  id:            number
  name:          string
  position:      string | null
  company:       string | null
  career_summary: string | null
  career_expert:  string | null
  career_qualif:  string | null
}

export interface ProfileZipResult {
  zip:         JSZip
  personCount: number
  skipped:     string[]
}

export async function buildPersonnelProfileZip(
  templateBuf: Buffer,
  projectId:   number,
  profileType  = 'auditor',
  titlePrefix  = '',
): Promise<ProfileZipResult> {

  const sectionTitle = SECTION_TITLES[profileType] ?? SECTION_TITLES.auditor
  const pageTitle    = `${titlePrefix}${sectionTitle}`
  const filterFn     = MEMBER_FILTERS[profileType] ?? MEMBER_FILTERS.auditor

  // ── 1. 사업 + 인력 조회 ─────────────────────────────────────
  const [project, allMembers] = await Promise.all([
    queryOne<{ project_name: string }>(
      `SELECT project_name FROM audit_projects WHERE id = $1`,
      [projectId]
    ),
    query<MemberRow>(
      `SELECT person_name, domain, member_group, member_type
       FROM proposal_members WHERE project_id = $1 ORDER BY id ASC`,
      [projectId]
    ),
  ])
  if (!project) throw new Error('사업을 찾을 수 없습니다')

  // profileType에 맞는 인력만 필터링
  const members = allMembers.filter(m => filterFn(m.member_group, m.member_type))
  if (!members.length) throw new Error(`[${sectionTitle}] 해당 유형의 인력이 없습니다`)

  // ── 2. personnel 및 이력/자격증 한 번에 조회 ─────────────────
  const names = [...new Set(members.map(m => m.person_name))]

  const [personnelRows, allHistory, allCerts] = await Promise.all([
    query<PersonnelRow>(
      `SELECT id, name, position, company, career_summary, career_expert, career_qualif
       FROM personnel WHERE name = ANY($1)`,
      [names]
    ),
    query<{ personnel_id: number; audit_yearmonth: string | null; project_name: string; domain: string | null }>(
      `SELECT pah.personnel_id, pah.audit_yearmonth, pah.project_name, pah.domain
       FROM personnel_audit_history pah
       JOIN personnel p ON pah.personnel_id = p.id
       WHERE p.name = ANY($1)
       ORDER BY pah.audit_yearmonth DESC NULLS LAST`,
      [names]
    ),
    query<{ personnel_id: number }>(
      `SELECT pah.personnel_id
       FROM personnel_certifications pah
       JOIN personnel p ON pah.personnel_id = p.id
       WHERE p.name = ANY($1)`,
      [names]
    ),
  ])

  const personnelByName = new Map<string, PersonnelRow>()
  for (const p of personnelRows) {
    if (!personnelByName.has(p.name)) personnelByName.set(p.name, p)
  }

  // personnel_id별 이력/자격증 카운트
  const historyByPid  = new Map<number, typeof allHistory>()
  for (const h of allHistory) {
    if (!historyByPid.has(h.personnel_id)) historyByPid.set(h.personnel_id, [])
    historyByPid.get(h.personnel_id)!.push(h)
  }
  const certCountByPid = new Map<number, number>()
  for (const c of allCerts) {
    certCountByPid.set(c.personnel_id, (certCountByPid.get(c.personnel_id) ?? 0) + 1)
  }

  // ── 3. NAS 증명사진 조회 ──────────────────────────────────────
  const photoMap = await fetchPersonnelPhotos(names)

  // ── 4. 슬라이드 복제 + 텍스트 치환 ─────────────────────────────
  const zip          = await JSZip.loadAsync(templateBuf)
  const placeholderTarget = await findPlaceholderImageTarget(zip)

  const skipped: string[] = []
  const photoBuffers: (Buffer | null)[] = []

  // buildMultiSlideDeck용 청크: 인력 1명 = 슬라이드 1장
  const chunks: Array<{ name: string; personMap: Record<string, string> }> = []

  for (const m of members) {
    const p = personnelByName.get(m.person_name)
    if (!p) { skipped.push(m.person_name); continue }

    const histories  = historyByPid.get(p.id)  ?? []
    const certCount  = certCountByPid.get(p.id) ?? 0
    const auditCount = histories.length

    // 주요이력: 전문가면 career_expert 우선, 아니면 career_summary, 최후 career_qualif
    const isExpert = m.member_type === '전문가' || m.member_type === '테스터'
    const mainCareer = isExpert
      ? (p.career_expert || p.career_summary || p.career_qualif || '')
      : (p.career_summary || p.career_qualif || '')

    // 유사 감리 경험 최대 5건: "[도메인] 사업명 (연도)" 형식
    const top5 = histories.slice(0, 5)
    const experienceMap: Record<string, string> = {}
    for (let i = 1; i <= 5; i++) {
      const h = top5[i - 1]
      if (h) {
        const year = h.audit_yearmonth ? h.audit_yearmonth.slice(0, 4) : ''
        const cat  = h.domain ? `[${h.domain}] ` : ''
        experienceMap[`[유사사업감리경험${i}]`] = `${cat}${h.project_name}${year ? ` (${year})` : ''}`
      } else {
        experienceMap[`[유사사업감리경험${i}]`] = ''
      }
    }

    const personMap: Record<string, string> = {
      '[제목]':       pageTitle,
      '[감리사업명]': project.project_name,
      '[이름]':       m.person_name,
      '[직위]':       p.position || '',
      '[소속]':       p.company  || '악티보',
      '[담당분야]':   m.domain   || '',
      '[주요이력]':   mainCareer,
      '[감리수행횟수]': `${auditCount} 회`,
      '[자격보유수]':  `${certCount} 개`,
      ...experienceMap,
    }

    chunks.push({ name: m.person_name, personMap })
    photoBuffers.push(photoMap.get(m.person_name) ?? null)
  }

  if (!chunks.length) throw new Error('생성할 인력이 없습니다 (모두 personnel DB 미등록)')

  // ── 5. buildMultiSlideDeck: 슬라이드 복제 + personMap 적용 ────
  await buildMultiSlideDeck(
    zip,
    (templateSlideXml, chunk: { name: string; personMap: Record<string, string> }) => {
      return applyPlaceholderMap(templateSlideXml, chunk.personMap)
    },
    chunks
  )

  // ── 6. 증명사진 교체 ─────────────────────────────────────────
  if (placeholderTarget) {
    await replaceSlideImages(zip, photoBuffers, placeholderTarget, 'profile')
  }

  return { zip, personCount: chunks.length, skipped }
}

// ── HTTP 라우트 ──────────────────────────────────────────────
app.post('/:projectId', async (c) => {
  try {
    const projectId = Number(c.req.param('projectId'))
    if (!projectId) return c.json({ ok: false, error: 'projectId가 필요합니다' }, 400)

    const contentType = c.req.header('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return c.json({ ok: false, error: 'multipart/form-data로 template 파일을 보내주세요' }, 400)
    }

    const form        = await c.req.formData()
    const file        = form.get('template') as File | null
    const profileType = (form.get('profileType') as string | null) || 'auditor'
    const titlePrefix = (form.get('titlePrefix') as string | null) || ''

    if (!file || file.size === 0) {
      return c.json({ ok: false, error: '첨부 템플릿(.pptx) 파일이 필요합니다' }, 400)
    }

    const templateBuf = Buffer.from(await file.arrayBuffer())
    const { zip, personCount, skipped } = await buildPersonnelProfileZip(
      templateBuf, projectId, profileType, titlePrefix
    )

    const outBuf = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const label: Record<string, string> = {
      auditor: '단계감리원전문역량',
      core:    '핵심기술점검팀전문역량',
      expert:  '전문가전문역량',
    }
    const fileName = label[profileType] ?? '전문역량'

    c.header('Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    c.header('Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}.pptx"`)
    c.header('X-Person-Count', String(personCount))
    if (skipped.length) c.header('X-Skipped', skipped.join(','))
    return c.body(new Uint8Array(outBuf))

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ppt-personnel-profile] 오류:', e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

export default app
