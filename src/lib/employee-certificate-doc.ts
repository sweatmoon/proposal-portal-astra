/**
 * [ppt-portal 추가 기능 — 첨부PPT 생성 세트의 공용 유틸] "재직증명서" / "경력증명서"가
 * 완전히 같은 조립 절차를 쓰므로(2026-09-04 — 두 번째 항목인 경력증명서 템플릿을 받아보니
 * 필드 구성이 재직증명서와 거의 동일해서 공용 함수로 뺐다) 공통 로직을 여기 모았다.
 *
 * 경력표/동의서와 같은 패턴 — 이 사업에 투입된 proposal_members 전원에 대해 슬라이드를
 * 한 장씩 복제해서 채운다. 사람 데이터 출처가 personnel DB가 아니라 NAS의
 * "00.재직증명서발행파일v4.xlsm"(회사 HR 담당자가 수동으로 관리하는 엑셀, 2026-09-04
 * 확인 — 이 참조용 폴더에 새로 올라와서 웹에서도 접근 가능해짐)라는 점만 다르다.
 * 엑셀 프로그램이나 그 안의 매크로는 실행하지 않고, src/lib/xlsx-employee-lookup.ts로
 * "직원정보" 시트의 값만 데이터로 읽어서 쓴다.
 *
 * 필드 매핑 (2026-09-04 사용자 확인):
 *   [제목]           호출한 쪽이 넘긴 pageTitle ("재직증명서" 또는 "경력증명서")
 *   [이름]           직원정보.이름 그대로 표시 — 동명이인 구분용 접미사(예: "김영범A")가
 *                    있어도 그대로 나온다("이름 표시는 그냥 따로 바꿀게 아무것도 하지
 *                    말고 그냥 김영범A로 표시해"). 나중에 접미사를 뗀 진짜 이름으로
 *                    바꾸고 싶어지면 xlsx-employee-lookup.ts의 formatDisplayName()만
 *                    고치면 된다.
 *   [입사일자]        직원정보.입사일(YYYY.MM.DD) + "." — 원본 엑셀 형식 그대로
 *   [생년월일]        직원정보.주민번호 앞 6자리 → "YYYY년 MM월 DD일"
 *   [직위]           직원정보.직위
 *   [근무부서]        직원정보.근무부서
 *   [입사일]         직원정보.입사일을 "YYYY년 MM월 DD일"로 (재직/경력 기간 문장에 사용)
 *   [제출마감하루전]   audit_projects.bid_deadline(YYYY-MM-DD) - 1일 → "YYYY년 MM월 DD일"
 *                    projectId=0(자유 생성)일 때는 오늘 날짜를 그대로 사용.
 *                    (2026-09-04 사용자 확인 — 입찰마감일 하루 전 날짜. 경력증명서 템플릿도
 *                    "재직하였음을 증명합니다"(과거형)면서 이 값을 그대로 쓰는데, 원본
 *                    엑셀도 TODAY() 기준으로 똑같이 설계돼 있어 의도된 동작이다)
 *   담당업무/주요업무, 용도 등은 각 템플릿에 고정 텍스트로 이미 박혀있어 손대지 않는다
 *   (2026-09-04 사용자 확인 — "재직기간이나 용도 입력창 추가하지 마").
 *
 * 직원정보에 이름이 없거나(엑셀에 없는 사람) 퇴직 처리돼있으면(현재 재직 중이 아님) 그
 * 사람은 건너뛴다 — personnel DB 매칭 실패를 건너뛰는 ppt-career.ts와 같은 원칙.
 */
import JSZip from 'jszip'
import { query, queryOne } from '../db/client.js'
import { applyPlaceholderMap } from './pptx-runtext.js'
import { buildMultiSlideDeck } from './pptx-deck.js'
import { fetchEmploymentCertificateSourceXlsx } from './nas-client.js'
import {
  loadEmployeeDirectory,
  formatBirthdate,
  formatDateKorean,
  formatHireDateWithDot,
  dayBeforeDeadlineKorean,
  formatDisplayName,
} from './xlsx-employee-lookup.js'

interface ProjectMember {
  person_name: string
}

interface PersonChunk {
  name: string
  hireDateWithDot: string
  birthdate: string
  position: string
  department: string
  hireDateKorean: string
}

export interface EmployeeCertificateZipResult {
  zip: JSZip
  personCount: number
  skipped: string[]
  projectName: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼: 이름 목록 + 직원 디렉터리가 준비된 뒤 실제 PPTX 조립
// ─────────────────────────────────────────────────────────────────────────────
async function _buildWithDirectory(
  templateBuf: Buffer,
  names: string[],
  directory: Awaited<ReturnType<typeof loadEmployeeDirectory>>,
  deadlineMinusOne: string,
  projectName: string,
  pageTitle: string,
  titlePrefix: string
): Promise<EmployeeCertificateZipResult> {
  const chunks: PersonChunk[] = []
  const skipped: string[] = []

  for (const name of names) {
    const record = directory.get(name)
    if (!record || record.resigned) {
      skipped.push(name)
      continue
    }
    chunks.push({
      name: formatDisplayName(record.name),
      hireDateWithDot: formatHireDateWithDot(record.hireDateRaw),
      birthdate: formatBirthdate(record.residentNumberPrefix),
      position: record.position,
      department: record.department,
      hireDateKorean: formatDateKorean(record.hireDateRaw),
    })
  }

  if (!chunks.length) {
    throw new Error(`재직증명서 발행파일에서 매칭되는(재직 중인) 인력이 한 명도 없습니다 (${skipped.join(', ')})`)
  }

  const commonMap: Record<string, string> = {
    '[제목]': `${titlePrefix}${pageTitle}`,
    '[제출마감하루전]': deadlineMinusOne,
  }

  const zip = await JSZip.loadAsync(templateBuf)

  const sharedPartNames = Object.keys(zip.files).filter(
    f => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f) || /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f)
  )
  for (const partName of sharedPartNames) {
    const partXml = await zip.file(partName)!.async('string')
    const patched = applyPlaceholderMap(partXml, commonMap)
    if (patched !== partXml) zip.file(partName, patched)
  }

  await buildMultiSlideDeck(
    zip,
    (templateSlideXml, person: PersonChunk) => {
      // 제목: "재직증명서 – 김현호" (총인원이 1명이든 N명이든 페이지 번호 없음)
      const personMap: Record<string, string> = {
        ...commonMap,
        '[제목]': `${titlePrefix}${pageTitle} – ${person.name}`,
        '[이름]': person.name,
        '[입사일자]': person.hireDateWithDot,
        '[생년월일]': person.birthdate,
        '[직위]': person.position,
        '[근무부서]': person.department,
        '[입사일]': person.hireDateKorean,
      }
      return applyPlaceholderMap(templateSlideXml, personMap)
    },
    chunks
  )

  return { zip, personCount: chunks.length, skipped, projectName }
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────────────────────────────────────────

/** titlePrefix: 첨부PPT 묶음에서 이 항목이 몇 번째로 선택됐는지("6. " 등)를 제목 앞에 붙인다
 *  (단독 다운로드일 때는 생략되어 빈 문자열 — 기존과 동일하게 번호 없이 나온다).
 *  freePersonnelNames: projectId=0(자유 생성) 시 직접 전달하는 인력 이름 배열.
 *  freeDeadlineDate: 자유 생성 시 [제출마감하루전]에 넣을 날짜(YYYY-MM-DD 또는 빈 문자열).
 *                   비어있으면 오늘 날짜 fallback. */
export async function buildEmployeeCertificateZip(
  templateBuf: Buffer,
  projectId: number,
  pageTitle: string,
  titlePrefix = '',
  freePersonnelNames: string[] = [],
  freeDeadlineDate = ''
): Promise<EmployeeCertificateZipResult> {
  if (projectId === 0) {
    // ── 자유 생성 — DB 조회 없이 전달받은 이름 목록 사용 ───────────────────
    if (!freePersonnelNames.length) throw new Error('자유 생성 시 인력 이름 목록(personnelNames)이 필요합니다')
    const sourceXlsx = await fetchEmploymentCertificateSourceXlsx()
    if (!sourceXlsx) throw new Error('NAS에서 재직증명서 발행파일을 가져오지 못했습니다')
    const directory = await loadEmployeeDirectory(sourceXlsx)
    // freeDeadlineDate(YYYY-MM-DD)가 있으면 변환, 없으면 오늘 날짜 fallback
    let deadlineMinusOne: string
    if (freeDeadlineDate && /^\d{4}-\d{2}-\d{2}$/.test(freeDeadlineDate)) {
      const [y, mo, da] = freeDeadlineDate.split('-')
      deadlineMinusOne = `${y}년 ${mo}월 ${da}일`
    } else {
      const today = new Date()
      const y = today.getFullYear()
      const mo = String(today.getMonth() + 1).padStart(2, '0')
      const da = String(today.getDate()).padStart(2, '0')
      deadlineMinusOne = `${y}년 ${mo}월 ${da}일`
    }
    return _buildWithDirectory(templateBuf, freePersonnelNames, directory, deadlineMinusOne, '자유생성', pageTitle, titlePrefix)
  }

  // ── 사업 연동 생성 — DB 조회 ────────────────────────────────────────────
  const [project, members, sourceXlsx] = await Promise.all([
    queryOne<{ project_name: string; bid_deadline: string | null }>(
      `SELECT project_name, bid_deadline FROM audit_projects WHERE id = $1`,
      [projectId]
    ),
    query<ProjectMember>(`SELECT person_name FROM proposal_members WHERE project_id = $1 ORDER BY id ASC`, [projectId]),
    fetchEmploymentCertificateSourceXlsx(),
  ])
  if (!project) throw new Error('사업을 찾을 수 없습니다')
  if (!members.length) throw new Error('이 사업에 투입된 인력이 없습니다')
  if (!sourceXlsx) throw new Error('NAS에서 재직증명서 발행파일을 가져오지 못했습니다')
  if (!project.bid_deadline) throw new Error('이 사업의 입찰마감일이 등록돼 있지 않습니다 (재직기간 계산에 필요합니다)')

  const deadlineMinusOne = dayBeforeDeadlineKorean(project.bid_deadline)
  const directory = await loadEmployeeDirectory(sourceXlsx)
  return _buildWithDirectory(
    templateBuf,
    members.map(m => m.person_name),
    directory,
    deadlineMinusOne,
    project.project_name,
    pageTitle,
    titlePrefix
  )
}
