/**
 * [ppt-portal 추가 기능 — 시험 적용] Synology NAS(QuickConnect)에서 PPT 생성에 필요한
 * 파일(인력 개인도장 이미지, 회사 표준재무제표 pptx, 사업자등록증 pptx, 회사 도장 이미지)을
 * 가져오는 클라이언트. 2026-09-02 사용자 확인 — NAS를 "유사 DB" 개념으로 써서, PPT 생성
 * 시점에 필요한 파일을 그때그때 조회해 쓰는 실험적 연동입니다.
 *
 * 인증 정보(NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD)는 .env로만 관리하고 절대 코드에
 * 하드코딩하지 않습니다 (.env는 .gitignore에 이미 등록되어 커밋되지 않음).
 *
 * 동작 방식: Synology File Station API(webapi/entry.cgi)를 그대로 호출합니다.
 *   1) SYNO.API.Auth로 로그인 → 세션 id(sid) 발급 (호출자가 넘긴 인원 전체에 대해 딱 1번)
 *   2) SYNO.FileStation.Download로 인원별 파일 원본 바이트를 동시에(Promise.all) 받음 —
 *      같은 sid를 재사용하므로 인원수만큼 로그인하지 않는다 (2026-09-02 사용자 확인 —
 *      "사람마다 따로 로그인/다운/로그아웃 할 필요 없게 최적화").
 *   3) SYNO.API.Auth로 로그아웃 (세션 정리) — 인원 전체 처리 후 딱 1번
 */

const NAS_BASE_URL = process.env.NAS_BASE_URL
const NAS_USERNAME = process.env.NAS_USERNAME
const NAS_PASSWORD = process.env.NAS_PASSWORD

// Synology 자체 서명 인증서 대응 — Railway 등 외부 서버에서 호출 시 필요
if (process.env.NODE_ENV !== 'production' || NAS_BASE_URL?.includes('synology.me')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

// 인력별 개인도장 이미지가 있는 폴더. 사람은 "상근"(회사 소속 정규 인력)과 "비상근"(외부
// 인력)으로 나뉘어 각각 다른 하위 폴더에 저장되어 있고, 이 사업에서의 참여 형태(상근/비상근)와
// 무관하게 그 "사람"이 어느 쪽으로 분류돼 있는지에 따라 파일이 있는 폴더가 정해집니다.
// 이 기능을 쓰는 문서(비상근 감리원 참여 동의서)는 비상근 인력이 압도적으로 많으므로,
// "비상근" 폴더를 먼저 찾고 없으면 "상근" 폴더로 넘어간다(2026-09-02 사용자 확인 — 순서 변경).
const STAMP_BASE_PATH = '/activo/04.제안팀/99.악티보포털참조용/04.도장/02.인력도장/개인도장_상근_마진작업'
const STAMP_SUBFOLDERS = ['비상근', '상근'] as const

async function login(): Promise<string> {
  const body = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: '6',
    method: 'login',
    account: NAS_USERNAME ?? '',
    passwd: NAS_PASSWORD ?? '',
    session: 'FileStation',
    format: 'sid',
  })
  const res = await fetch(`${NAS_BASE_URL}/webapi/entry.cgi`, { method: 'POST', body })
  const json = (await res.json()) as { success: boolean; data?: { sid: string } }
  if (!json.success || !json.data) throw new Error('NAS 로그인 실패')
  return json.data.sid
}

async function logout(sid: string): Promise<void> {
  const url = new URL(`${NAS_BASE_URL}/webapi/entry.cgi`)
  url.searchParams.set('api', 'SYNO.API.Auth')
  url.searchParams.set('version', '6')
  url.searchParams.set('method', 'logout')
  url.searchParams.set('session', 'FileStation')
  url.searchParams.set('_sid', sid)
  await fetch(url).catch(() => {}) // 로그아웃 실패는 무시 — 세션은 어차피 타임아웃되면 정리됨
}

async function downloadFile(sid: string, path: string): Promise<Buffer | null> {
  const url = new URL(`${NAS_BASE_URL}/webapi/entry.cgi`)
  url.searchParams.set('api', 'SYNO.FileStation.Download')
  url.searchParams.set('version', '2')
  url.searchParams.set('method', 'download')
  url.searchParams.set('path', path)
  url.searchParams.set('mode', 'open')
  url.searchParams.set('_sid', sid)
  const res = await fetch(url)
  // 파일이 없으면 Synology가 200 + JSON 에러 바디를 주는 경우가 있어, content-type으로 판별합니다.
  const contentType = res.headers.get('content-type') ?? ''
  if (!res.ok || contentType.includes('application/json')) return null
  return Buffer.from(await res.arrayBuffer())
}

async function listFolder(sid: string, folderPath: string): Promise<{ name: string; isdir: boolean }[]> {
  const url = new URL(`${NAS_BASE_URL}/webapi/entry.cgi`)
  url.searchParams.set('api', 'SYNO.FileStation.List')
  url.searchParams.set('version', '2')
  url.searchParams.set('method', 'list')
  url.searchParams.set('folder_path', folderPath)
  url.searchParams.set('_sid', sid)
  const res = await fetch(url)
  const json = (await res.json()) as { success: boolean; data?: { files: { name: string; isdir: boolean }[] } }
  // 실패를 조용히 빈 배열로 넘기면 "파일이 진짜 없음"과 "일시적 조회 실패"를 구분할 수 없어서
  // withNasRetry가 재시도할 수 있도록 예외로 던진다.
  if (!json.success) throw new Error('NAS 폴더 조회 실패: ' + folderPath)
  return json.data ? json.data.files : []
}

/**
 * QuickConnect 경유라 가끔 일시적으로 로그인/조회/다운로드가 실패할 때가 있어서
 * (2026-09-03 실측 — 방금 성공했던 조회가 바로 다음 요청에서 실패), 세션 하나를 통째로
 * (로그인 → fn 실행 → 로그아웃) 한 번 더 재시도한다. 그래도 실패하면 null — 호출 쪽에서
 * "이 항목만 건너뛴다"로 처리하므로 NAS 문제가 PPT 생성 전체를 막지는 않는다.
 */
async function withNasRetry<T>(label: string, fn: (sid: string) => Promise<T>): Promise<T | null> {
  const attempts = 2
  for (let i = 0; i < attempts; i++) {
    try {
      const sid = await login()
      try {
        return await fn(sid)
      } finally {
        await logout(sid)
      }
    } catch (e) {
      if (i === attempts - 1) {
        console.warn(`[nas-client] ${label} 실패(${attempts}회 시도):`, (e as Error).message)
        return null
      }
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return null
}

/** 폴더 안에서 .pptx 확장자인 파일 하나를 찾아 통째로 받아온다 — 표준재무제표/사업자등록증/
 *  국세 납세증명서처럼 "회사 서류 원본이 pptx 한 장짜리로 폴더에 들어있고, 파일명에 갱신
 *  날짜가 박혀 있어 계속 바뀌므로 파일명을 하드코딩하지 않는" 항목들이 공유하는 패턴
 *  (2026-09-03 — 3번째 중복이라 공용 함수로 추출). label은 실패 로그에 쓸 이름. */
async function fetchPptxFromFolder(folder: string, label: string): Promise<Buffer | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn(`[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 ${label} 조회를 건너뜁니다.`)
    return null
  }
  return withNasRetry(`${label} 조회`, async sid => {
    const files = await listFolder(sid, folder)
    const pptxFile = files.find(f => !f.isdir && /\.pptx$/i.test(f.name))
    if (!pptxFile) throw new Error('폴더에서 .pptx 파일을 찾지 못함: ' + folder)
    const buf = await downloadFile(sid, `${folder}/${pptxFile.name}`)
    if (!buf) throw new Error('다운로드 실패: ' + pptxFile.name)
    return buf
  })
}

/** 폴더 안에서 predicate를 만족하는 .pdf 파일 중, 파일이름 기준으로 가장 최신(문자열
 *  오름차순 정렬했을 때 마지막) 것 하나를 찾아 통째로 받아온다 — 지방세 납세증명서/
 *  법인등기부등본처럼 "날짜가 파일명 뒤에 붙어서 계속 새 파일이 추가되는" 폴더에서
 *  "가장 최신 파일"을 고를 때 쓰는 공용 패턴(2026-09-03 사용자 확인 — "파일이름상으로"
 *  가장 최신). */
async function fetchLatestPdfFromFolder(
  folder: string,
  label: string,
  predicate: (name: string) => boolean = () => true
): Promise<Buffer | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn(`[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 ${label} 조회를 건너뜁니다.`)
    return null
  }
  return withNasRetry(`${label} 조회`, async sid => {
    const files = await listFolder(sid, folder)
    const latest = files
      .filter(f => !f.isdir && /\.pdf$/i.test(f.name) && predicate(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .pop()
    if (!latest) throw new Error('조건에 맞는 .pdf 파일을 찾지 못함: ' + folder)
    const buf = await downloadFile(sid, `${folder}/${latest.name}`)
    if (!buf) throw new Error('다운로드 실패: ' + latest.name)
    return buf
  })
}

/** 폴더 안에서 .pptx 또는 .pdf 확장자 파일 중, 파일이름 기준으로 가장 최신(문자열
 *  오름차순 정렬했을 때 마지막) 것 하나를 찾아 통째로 받아온다. 확장자가 섞여있어도
 *  날짜가 파일명에 고정폭으로 박혀있는 한 문자열 정렬로 최신 판단이 가능하다(2026-09-09
 *  — 국세 납세증명서: pptx/pdf 섞여있는 폴더에서 최신 파일 고르기용으로 추가). */
async function fetchLatestPptxOrPdfFromFolder(
  folder: string,
  label: string
): Promise<{ buf: Buffer; isPdf: boolean } | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn(`[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 ${label} 조회를 건너뜁니다.`)
    return null
  }
  return withNasRetry(`${label} 조회`, async sid => {
    const files = await listFolder(sid, folder)
    const latest = files
      .filter(f => !f.isdir && /\.(pptx|pdf)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .pop()
    if (!latest) throw new Error('폴더에서 .pptx/.pdf 파일을 찾지 못함: ' + folder)
    const buf = await downloadFile(sid, `${folder}/${latest.name}`)
    if (!buf) throw new Error('다운로드 실패: ' + latest.name)
    return { buf, isPdf: /\.pdf$/i.test(latest.name) }
  })
}

// 회사 표준재무제표 pptx가 있는 폴더. 파일명에 갱신 날짜가 박혀 있어("표준재무제표(3년)_
// 260720.pptx") 계속 바뀌므로 파일명을 하드코딩하지 않고, 이 폴더에서 .pptx 확장자인
// 파일을 찾아 그때그때 사용한다(2026-09-02 확인 — 폴더 안에 연도별 .pdf도 같이 있지만
// 이미지가 들어있는 3개년 통합본은 .pptx 하나뿐).
const FINANCIAL_STATEMENT_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.회사/18.표준재무제표'

/**
 * NAS에서 회사 표준재무제표 pptx 원본을 통째로 받아옵니다. 이 문서는 사업과 무관하게
 * 항상 똑같은 회사 재무제표라, 인력 이름 같은 조회 키가 필요 없습니다.
 * 못 찾거나 NAS 연동이 실패하면 null (호출 쪽에서 이 첨부 항목만 건너뛰도록 처리).
 */
export async function fetchStandardFinancialStatementPptx(): Promise<Buffer | null> {
  return fetchPptxFromFolder(FINANCIAL_STATEMENT_FOLDER, '표준재무제표')
}

// 사업자등록증 pptx가 있는 폴더 — 표준재무제표와 같은 이유로 파일명을 고정하지 않고
// 이 폴더에서 .pptx 확장자 파일을 찾는다(폴더 안에 날짜별 .pdf도 같이 있음, 2026-09-03 확인).
const BUSINESS_REGISTRATION_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.회사/01.사업자등록증'

/** NAS에서 사업자등록증 pptx 원본을 통째로 받아옵니다. 표준재무제표처럼 사업과 무관하게
 *  항상 같은 회사 서류라 조회 키가 필요 없습니다. 못 찾으면 null. */
export async function fetchBusinessRegistrationPptx(): Promise<Buffer | null> {
  return fetchPptxFromFolder(BUSINESS_REGISTRATION_FOLDER, '사업자등록증')
}

// 국세 납세증명서가 있는 폴더 — 이미지가 들어있는 pptx 원본 하나와, 유효기한이 지날
// 때마다 새로 추가되는 .pdf들이 같이 있다. 처음엔 pptx만 썼는데, pptx는 안 갱신되고
// 최신 내용은 계속 .pdf로만 올라와서 pptx가 오래돼 못 쓰게 되는 문제가 있었다(2026-09-09
// 사용자 확인 — "ppt든 pdf든 상관없이 가져올 수 있도록... 가장 최신 파일"). 그래서 확장자
// 상관없이 파일이름 기준 가장 최신 것 하나를 고른다.
const TAX_CERTIFICATE_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.회사/11.국세 납세증명서'

/** NAS에서 국세 납세증명서 중 파일이름 기준 가장 최신 파일(.pptx 또는 .pdf)을 통째로
 *  받아옵니다. 확장자에 따라 이미지 추출 방식이 다르므로(pptx=임베드 이미지 추출,
 *  pdf=페이지 렌더링) isPdf를 같이 반환합니다. 못 찾으면 null. */
export async function fetchTaxCertificateFile(): Promise<{ buf: Buffer; isPdf: boolean } | null> {
  return fetchLatestPptxOrPdfFromFolder(TAX_CERTIFICATE_FOLDER, '국세 납세증명서')
}

// 지방세 납세증명서 .pdf가 있는 폴더 — pptx 없이 유효기한별 .pdf만 계속 추가되므로,
// 파일이름 기준 가장 최신 것을 그때그때 골라 쓴다(2026-09-03 사용자 확인).
const LOCAL_TAX_CERTIFICATE_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.회사/12.지방세 납세증명서'

/** NAS에서 지방세 납세증명서 중 파일이름 기준 가장 최신 .pdf를 받아옵니다. 못 찾으면 null. */
export async function fetchLocalTaxCertificatePdf(): Promise<Buffer | null> {
  return fetchLatestPdfFromFolder(LOCAL_TAX_CERTIFICATE_FOLDER, '지방세 납세증명서')
}

// 법인등기부등본 .pdf가 있는 폴더 — "말소사항포함"이 파일명에 들어간 것과 안 들어간 것
// 두 종류가 같이 있어, 사용자가 첨부PPT 생성 시 고른 종류에 맞춰 그중 파일이름 기준 가장
// 최신 것을 쓴다(2026-09-03 사용자 확인).
const CORPORATE_REGISTRY_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.회사/07.법인등기부등본'

/** NAS에서 법인등기부등본 .pdf를 받아옵니다. includeCancelled가 true면 파일명에
 *  "말소사항포함"이 들어간 것 중, false면 안 들어간 것 중 파일이름 기준 가장 최신 것을
 *  씁니다. 못 찾으면 null. */
export async function fetchCorporateRegistryPdf(includeCancelled: boolean): Promise<Buffer | null> {
  const predicate = includeCancelled
    ? (name: string) => name.includes('말소사항포함')
    : (name: string) => !name.includes('말소사항포함')
  return fetchLatestPdfFromFolder(CORPORATE_REGISTRY_FOLDER, '법인등기부등본', predicate)
}

// 4대보험 가입확인서(4대 사회보험 사업장 가입자명부) .pdf가 있는 폴더 — 지방세 납세증명서와
// 같은 이유로 파일이름 기준 가장 최신 것을 그때그때 골라 쓴다(2026-09-04 사용자 확인).
const INSURANCE_ENROLLMENT_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.회사/14.4대 사회보험 사업장 가입자명부'

/** NAS에서 4대보험 가입확인서 중 파일이름 기준 가장 최신 .pdf를 받아옵니다. 못 찾으면 null. */
export async function fetchInsuranceEnrollmentPdf(): Promise<Buffer | null> {
  return fetchLatestPdfFromFolder(INSURANCE_ENROLLMENT_FOLDER, '4대보험 가입확인서')
}

// 재직증명서 발행용 직원정보가 들어있는 엑셀(매크로 포함, .xlsm) — 다른 항목과 달리 파일명이
// 고정돼있고 폴더가 아니라 파일 경로 자체가 확정적이다(2026-09-04 사용자 확인 — 이 파일이
// 최근 이 참조용 폴더에 새로 올라와서 웹에서도 접근 가능해짐). "직원정보" 시트의 내용을
// src/lib/xlsx-employee-lookup.ts에서 파싱해서 쓴다 — 엑셀 프로그램이나 매크로는 전혀
// 실행하지 않고, 그 안의 값만 데이터로 읽어온다.
const EMPLOYMENT_CERT_SOURCE_FILE = '/activo/04.제안팀/99.악티보포털참조용/00.재직증명서발행파일v4.xlsm'

/** NAS에서 재직증명서 발행용 엑셀(.xlsm) 원본을 통째로 받아옵니다. 못 찾으면 null. */
export async function fetchEmploymentCertificateSourceXlsx(): Promise<Buffer | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 재직증명서 발행파일 조회를 건너뜁니다.')
    return null
  }
  return withNasRetry('재직증명서 발행파일 조회', async sid => {
    const buf = await downloadFile(sid, EMPLOYMENT_CERT_SOURCE_FILE)
    if (!buf) throw new Error('다운로드 실패: ' + EMPLOYMENT_CERT_SOURCE_FILE)
    return buf
  })
}

// 상근인력현황 .xlsx가 있는 폴더 — 파일명이 완전히 같은 날짜로 "상근인력현황_YYMMDD.xlsx"
// (전체 인력, 구분 필터링 전)와 "상근인력현황(감리원만)_YYMMDD.xlsx"(이미 감리원만 걸러둔
// 별도 파일) 두 종류가 같이 있다(2026-09-04 확인). 이 기능은 우리가 직접 구분(I열)을
// 필터링하는 게 목적이라 반드시 "필터링 전" 파일("상근인력현황_날짜.xlsx" 형식, 괄호 없는
// 파일명)만 골라야 한다 — "(감리원만)" 같은 접미사가 붙은 변형은 제외.
const STAFFING_STATUS_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/02.제안/07.상근인력보유현황'

/** NAS에서 상근인력현황 중 "상근인력현황_날짜.xlsx" 형식(괄호 접미사 없는 것)만 대상으로
 *  파일이름 기준 가장 최신 것을 받아옵니다. 못 찾으면 null. */
export async function fetchStaffingStatusXlsx(): Promise<Buffer | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 상근인력현황 조회를 건너뜁니다.')
    return null
  }
  return withNasRetry('상근인력현황 조회', async sid => {
    const files = await listFolder(sid, STAFFING_STATUS_FOLDER)
    const latest = files
      .filter(f => !f.isdir && /^상근인력현황_\d+\.xlsx$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .pop()
    if (!latest) throw new Error('폴더에서 "상근인력현황_날짜.xlsx" 형식의 파일을 찾지 못함: ' + STAFFING_STATUS_FOLDER)
    const buf = await downloadFile(sid, `${STAFFING_STATUS_FOLDER}/${latest.name}`)
    if (!buf) throw new Error('다운로드 실패: ' + latest.name)
    return buf
  })
}

// "원본대조필"/"사실과상위없음" 도장 이미지가 있는 폴더 — 같은 도장이 배경 제거 버전으로
// 여러 장(_1~_5) 들어있는데, 번호를 지정하지 않으면 이름순으로 첫 번째 것만 쓴다.
// "사용인감" 도장은 같은 폴더에 사용인감01.png~사용인감05.png 로 들어있다.
const COMPANY_STAMP_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/04.도장/01.회사도장/원본대조필, 사실과상위없음도장'

export type CompanyStampType = '원본대조필' | '사실과상위없음' | '사용인감'

/** NAS에서 회사 도장 이미지를 받아옵니다. 못 찾으면 null.
 *  - 원본대조필 / 사실과상위없음: stampNumber(1~5)로 _1~_5 버전 지정. 생략 시 이름순 첫 번째.
 *  - 사용인감: stampNumber(1~5)로 01~05 파일 지정. 생략 시 01. */
export async function fetchCompanyStampPng(stampType: CompanyStampType, stampNumber = 1): Promise<Buffer | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 도장 조회를 건너뜁니다.')
    return null
  }
  return withNasRetry(`도장(${stampType}${stampType === '사용인감' ? stampNumber : ''}) 조회`, async sid => {
    const files = await listFolder(sid, COMPANY_STAMP_FOLDER)
    let matched: { name: string } | undefined

    if (stampType === '사용인감') {
      // 사용인감01.png ~ 사용인감05.png
      const num = String(Math.max(1, Math.min(5, stampNumber))).padStart(2, '0')
      matched = files.find(f => !f.isdir && f.name === `사용인감${num}.png`)
      if (!matched) throw new Error(`도장 파일을 찾지 못함: 사용인감${num}.png`)
    } else {
      // 원본대조필_N_-removebg-preview.png / 사실과상위없음_N_-removebg-preview.png
      const prefix = `${stampType}_`
      const candidates = files
        .filter(f => !f.isdir && f.name.startsWith(prefix))
        .sort((a, b) => a.name.localeCompare(b.name))
      const n = Math.max(1, Math.min(5, stampNumber)) - 1  // 0-based index
      matched = candidates[n] ?? candidates[0]
      if (!matched) throw new Error('도장 파일을 찾지 못함: ' + prefix)
    }

    const buf = await downloadFile(sid, `${COMPANY_STAMP_FOLDER}/${matched.name}`)
    if (!buf) throw new Error('다운로드 실패: ' + matched.name)
    return buf
  })
}

/**
 * 인력 이름 목록으로 개인도장 PNG를 NAS에서 한 번에 찾아 반환합니다 (이름 → 파일 바이트,
 * 못 찾은 사람은 null). 로그인/로그아웃은 전체 목록에 대해 한 번만 하고, 사람별 다운로드는
 * 같은 세션(sid)으로 동시에 처리합니다.
 *
 * NAS 연동 자체가 실패해도(로그인 실패 등) 예외를 던지지 않고 전원 null로 채워 반환합니다 —
 * 호출 쪽에서 "못 찾으면 원래 템플릿 placeholder 그대로 둔다"로 처리하므로, NAS 문제가
 * PPT 생성 자체를 막으면 안 되기 때문입니다.
 */
export async function fetchPersonalStampPngs(personNames: string[]): Promise<Map<string, Buffer | null>> {
  const result = new Map<string, Buffer | null>(personNames.map(name => [name, null]))
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 도장 조회를 건너뜁니다.')
    return result
  }

  let sid: string
  try {
    sid = await login()
  } catch (e) {
    console.warn('[nas-client] NAS 로그인 실패:', (e as Error).message)
    return result
  }

  try {
    await Promise.all(
      personNames.map(async name => {
        for (const sub of STAMP_SUBFOLDERS) {
          const path = `${STAMP_BASE_PATH}/${sub}/도장(${name}).png`
          const buf = await downloadFile(sid, path)
          if (buf) {
            result.set(name, buf)
            return
          }
        }
      })
    )
  } finally {
    await logout(sid)
  }

  return result
}

// 인력별 증명사진 PNG가 저장된 폴더.
// 파일명 패턴: "증명사진(이름).png" (2026-09-14 사용자 확인)
const PHOTO_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/02.제안/04.증명사진'

export type PersonnelPhotoResult = {
  name: string
  ok: boolean
  dataUri?: string
  error?: string
  stage?: string
  code?: number
}

export function validPhotoName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100
    && !/[\\/\\\\\x00-\x1f\x7f]/.test(name) && !name.includes('..')
}

class PhotoNasError extends Error {
  constructor(public stage: string, public code?: number, public kind = 'nas_error') {
    // URL, 비밀번호, SID, NAS 응답 원문은 로그/응답에 노출하지 않는다.
    super(`사진 NAS ${stage} 실패 (${kind}${code === undefined ? '' : ': ' + code})`)
  }
}

async function photoRequest(params: Record<string, string>, stage: string): Promise<Buffer> {
  try {
    const res = await fetch(`${NAS_BASE_URL}/webapi/entry.cgi`, {
      method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new PhotoNasError(stage, res.status, 'nas_http_error')
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    if (e instanceof PhotoNasError) throw e
    throw new PhotoNasError(stage, undefined, 'nas_connection_error')
  }
}

function photoJson(buf: Buffer, stage: string) {
  let json
  try { json = JSON.parse(buf.toString('utf8')) } catch { throw new PhotoNasError(stage, undefined, 'nas_invalid_response') }
  if (!json || json.success !== true) {
    const code = typeof json?.error?.code === 'number' ? json.error.code : undefined
    throw new PhotoNasError(stage, code)
  }
  return json
}

// 동시에 시작된 사진 생성 요청도 로그인/로그아웃이 겹치지 않게 처리한다.
// 데이터 캐시가 아닌 실행 잠금이며 파일·인력 데이터는 요청 종료 후 보관하지 않는다.
let photoQueue: Promise<unknown> = Promise.resolve()
export function fetchPersonnelPhotoResults(personNames: string[]): Promise<PersonnelPhotoResult[]> {
  const names = [...new Set(personNames.map(n => n.trim()))]
  const task = photoQueue.then(() => loadPersonnelPhotoResults(names))
  photoQueue = task.catch(() => {})
  return task
}

const CLIENT_LOGO_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/01.제안서 작성용 로고, 도장/주관기관 로고(누끼 딴거)'
export type ClientLogoResult = { ok: boolean; dataUri?: string; filename?: string; error?: string; stage?: string; code?: number }
const logoKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s._-]+/g, '')
const legalLogoKey = (s: string) => logoKey(s).replace(/^(?:\((?:재|사|주)\)|재단법인|사단법인|주식회사)/, '')

// 부분 문자열/약칭/숫자 접미사를 추정하지 않는다. 동일 점수 후보가 여러 개면 명시적 오류.
export function matchClientLogo(org: string, files: { name: string; isdir: boolean }[]): ClientLogoResult {
  if (!validPhotoName(org)) return { ok: false, error: 'invalid_client_org' }
  const names = [...new Set(files.filter(f => !f.isdir && typeof f.name === 'string' && validPhotoName(f.name) && /\.(png|jpe?g)$/i.test(f.name)).map(f => f.name))]
  const base = (n: string) => n.replace(/\.(png|jpe?g)$/i, '')
  const exact = names.filter(n => logoKey(base(n)) === logoKey(org))
  const candidates = exact.length ? exact : names.filter(n => legalLogoKey(base(n)) === legalLogoKey(org))
  return candidates.length === 1 ? { ok: true, filename: candidates[0] }
    : { ok: false, error: candidates.length ? 'client_logo_ambiguous' : 'client_logo_not_found' }
}

export function fetchClientLogo(org: string): Promise<ClientLogoResult> {
  // 사진 조회와 같은 FileStation 세션 잠금 사용. 데이터는 요청 사이에 보관하지 않는다.
  const task = photoQueue.then(() => loadClientLogo(org))
  photoQueue = task.catch(() => {})
  return task
}
async function loadClientLogo(org: string): Promise<ClientLogoResult> {
  if (!validPhotoName(org)) return { ok: false, error: 'invalid_client_org' }
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) return { ok: false, error: 'nas_not_configured', stage: 'configuration' }
  for (let attempt = 0; attempt < 2; attempt++) {
    let sid: string | undefined
    try {
      const auth = photoJson(await photoRequest({ api: 'SYNO.API.Auth', version: '6', method: 'login', account: NAS_USERNAME, passwd: NAS_PASSWORD, session: 'FileStation', format: 'sid' }, 'login'), 'login')
      if (typeof auth.data?.sid !== 'string' || !auth.data.sid) throw new PhotoNasError('login', undefined, 'nas_invalid_response')
      sid = auth.data.sid
      const files: { name: string; isdir: boolean }[] = []
      let offset = 0
      while (true) {
        const list = photoJson(await photoRequest({ api: 'SYNO.FileStation.List', version: '2', method: 'list', folder_path: CLIENT_LOGO_FOLDER, offset: String(offset), limit: '500', _sid: sid! }, 'list'), 'list')
        if (!Array.isArray(list.data?.files)) throw new PhotoNasError('list', undefined, 'nas_invalid_response')
        files.push(...list.data.files); offset += list.data.files.length
        const total = list.data.total
        if (typeof total === 'number' ? offset >= total : list.data.files.length < 500) break
        if (!list.data.files.length || offset >= 20000) throw new PhotoNasError('list', undefined, 'nas_incomplete_listing')
      }
      const match = matchClientLogo(org, files)
      if (!match.ok) return match
      const buf = await photoRequest({ api: 'SYNO.FileStation.Download', version: '2', method: 'download', mode: 'open', path: JSON.stringify([`${CLIENT_LOGO_FOLDER}/${match.filename}`]), _sid: sid! }, 'download')
      if (buf.length > 8 * 1024 * 1024) throw new PhotoNasError('download', undefined, 'client_logo_too_large')
      const png = buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpg = buf.length > 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255
      if (!png && !jpg) { photoJson(buf, 'download'); throw new PhotoNasError('download', undefined, 'nas_invalid_image') }
      return { ok: true, filename: match.filename, dataUri: `data:image/${png ? 'png' : 'jpeg'};base64,${buf.toString('base64')}` }
    } catch (e) {
      const err = e instanceof PhotoNasError ? e : new PhotoNasError('lookup', undefined, 'nas_invalid_response')
      if (attempt === 0 && (err.kind === 'nas_connection_error' || [106, 107, 119].includes(err.code ?? 0))) continue
      return { ok: false, error: err.kind, stage: err.stage, code: err.code }
    } finally {
      if (sid) await photoRequest({ api: 'SYNO.API.Auth', version: '6', method: 'logout', session: 'FileStation', _sid: sid }, 'logout').catch(() => {})
    }
  }
  return { ok: false, error: 'nas_connection_error' }
}

async function loadPersonnelPhotoResults(names: string[]): Promise<PersonnelPhotoResult[]> {
  const results = new Map<string, PersonnelPhotoResult>()
  for (const name of names) {
    if (!validPhotoName(name)) results.set(name, { name, ok: false, error: 'invalid_name' })
  }
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    return names.map(name => results.get(name) || { name, ok: false, error: 'nas_not_configured', stage: 'configuration' })
  }
  // 정해진 파일명을 직접 다운로드한다. 폴더 List 권한/목록 API 성공을 전제하지 않는다.
  // 세션/네트워크 오류만 한 차례 재시도하고 성공한 인력은 다시 받지 않는다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = names.filter(name => {
      const r = results.get(name)
      return !r || (!r.ok && (r.error === 'nas_connection_error' || (r.stage === 'download' && [106, 107, 119].includes(r.code ?? 0))))
    })
    if (!pending.length) break
    let sid: string | undefined
    try {
      const auth = photoJson(await photoRequest({
        api: 'SYNO.API.Auth', version: '6', method: 'login',
        account: NAS_USERNAME, passwd: NAS_PASSWORD, session: 'FileStation', format: 'sid',
      }, 'login'), 'login')
      if (typeof auth.data?.sid !== 'string' || !auth.data.sid) throw new PhotoNasError('login', undefined, 'nas_invalid_response')
      sid = auth.data.sid
      let next = 0
      await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (next < pending.length) {
          const name = pending[next++]
          try {
            const buf = await photoRequest({
              api: 'SYNO.FileStation.Download', version: '2', method: 'download', mode: 'open',
              path: JSON.stringify([`${process.env.NAS_PHOTO_FOLDER?.trim().replace(/\/$/, '') || PHOTO_FOLDER}/증명사진(${name}).png`]),
              _sid: sid!,
            }, 'download')
            // JSON 오류가 text/plain으로 와도 이미지로 넣지 않는다.
            if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
              photoJson(buf, 'download')
              throw new PhotoNasError('download', undefined, 'nas_invalid_image')
            }
            results.set(name, { name, ok: true, dataUri: `data:image/png;base64,${buf.toString('base64')}` })
          } catch (e) {
            const err = e instanceof PhotoNasError ? e : new PhotoNasError('download', undefined, 'nas_invalid_response')
            // File Station 408만 명시적인 파일/경로 없음. 권한/세션 오류와 구분한다.
            results.set(name, { name, ok: false, error: err.code === 408 && err.kind === 'nas_error' ? 'photo_path_not_found' : err.kind, stage: err.stage, code: err.code })
            console.warn('[nas-client]', err.message)
          }
        }
      }))
    } catch (e) {
      const err = e instanceof PhotoNasError ? e : new PhotoNasError('login', undefined, 'nas_invalid_response')
      for (const name of pending) results.set(name, { name, ok: false, error: err.kind, stage: err.stage, code: err.code })
      console.warn('[nas-client]', err.message)
    } finally {
      if (sid) await photoRequest({ api: 'SYNO.API.Auth', version: '6', method: 'logout', session: 'FileStation', _sid: sid }, 'logout').catch(() => {})
    }
  }
  return names.map(name => results.get(name)!)
}

/** 기존 첨부 호출자와의 호환용. 본문 API는 상세 오류가 포함된 결과를 사용한다. */
export async function fetchPersonnelPhotos(personNames: string[]): Promise<Map<string, Buffer | null>> {
  const rows = await fetchPersonnelPhotoResults(personNames)
  return new Map(personNames.map(name => {
    const row = rows.find(r => r.name === name.trim())
    return [name, row?.dataUri ? Buffer.from(row.dataUri.split(',')[1], 'base64') : null]
  }))
}

// 감리원 경력 확인서 발급요청 엑셀 템플릿 — 재직증명서 발행파일처럼 폴더가 아니라 파일
// 경로 자체가 고정돼있다(2026-09-08 사용자 확인 — "양식_변경X"라는 파일명 그대로 항상 이
// 파일 하나만 씀).
const AUDITOR_CAREER_REQUEST_TEMPLATE_FILE =
  '/activo/04.제안팀/99.악티보포털참조용/감리원 경력 확인서 발급요청(악티보)_yymmdd_n명(양식_변경X).xlsx'

// 경력증명서(감리협회) PDF가 인력 이름별로 모여있는 폴더.
// 파일명 패턴: "감리원 경력확인서(이름)_YYMMDD.pdf" — 이름이 파일명에 포함되어 있고,
// 동일 인물의 파일이 여러 개 있을 수 있으므로 날짜 숫자(파일이름 기준 문자열 내림차순)로
// 가장 최신 파일 하나만 쓴다(2026-09-10 사용자 확인).
const CAREER_CERT_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/02.제안/06.경력증명서(감리협회)'

/**
 * 인력 이름 목록으로 경력증명서(감리협회) PDF를 NAS에서 한 번에 찾아 반환합니다.
 * (이름 → Buffer | null, 못 찾은 사람은 null)
 *
 * 매칭 규칙: 파일명에 이름이 포함된 .pdf 파일 중 파일이름 문자열 기준 가장 최신 것 1개.
 * 예) "감리원 경력확인서(손정순)_260108.pdf" → "손정순" 이름으로 매칭.
 *
 * 로그인/로그아웃은 전체 목록에 대해 1회만 수행하고, 폴더 목록도 1회만 조회해서
 * 이름별로 필터링한다(fetchAuditorCertificatePptxs와 동일한 세션 공유 패턴).
 */
export async function fetchCareerCertPdfs(personNames: string[]): Promise<Map<string, Buffer | null>> {
  const result = new Map<string, Buffer | null>(personNames.map(name => [name, null]))
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 경력증명서 PDF 조회를 건너뜁니다.')
    return result
  }

  let sid: string
  try {
    sid = await login()
  } catch (e) {
    console.warn('[nas-client] NAS 로그인 실패:', (e as Error).message)
    return result
  }

  try {
    // 폴더 목록은 1회만 조회 — 이름별로 재사용
    // .catch로 삼키지 않고 실패 시 warn 로그 후 빈 배열로 계속 진행
    let files: { name: string; isdir: boolean }[] = []
    try {
      files = await listFolder(sid, CAREER_CERT_FOLDER)
    } catch (e) {
      console.warn('[nas-client] 경력증명서 폴더 목록 조회 실패:', (e as Error).message, '| 폴더:', CAREER_CERT_FOLDER)
    }
    console.log(`[nas-client] 경력증명서 폴더 파일 수: ${files.length}개, 검색 이름: ${personNames.join(', ')}`)
    if (files.length > 0) {
      // 이름 매칭 디버그: 첫 5개 파일명 + 각 검색 이름별 후보 수 출력
      console.log('[nas-client] 경력증명서 폴더 샘플 파일명:', files.slice(0, 5).map(f => f.name).join(' | '))
      for (const name of personNames) {
        const matched = files.filter(f => !f.isdir && /\.pdf$/i.test(f.name) && f.name.includes(name))
        console.log(`[nas-client] "${name}" 매칭 후보: ${matched.length}개 ${matched.map(f => f.name).join(', ')}`)
      }
    }

    await Promise.all(
      personNames.map(async name => {
        // 이름이 파일명에 포함된 .pdf 파일만 추려서 파일이름 문자열 기준 가장 최신 것 선택
        const candidates = files
          .filter(f => !f.isdir && /\.pdf$/i.test(f.name) && f.name.includes(name))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        const latest = candidates[candidates.length - 1]
        if (!latest) return // 해당 이름의 파일 없음 → null 유지

        const buf = await downloadFile(sid, `${CAREER_CERT_FOLDER}/${latest.name}`)
        if (buf) result.set(name, buf)
      })
    )
  } finally {
    await logout(sid)
  }

  return result
}

/** NAS에서 감리원 경력 확인서 발급요청 엑셀 템플릿 원본을 통째로 받아옵니다. 못 찾으면 null. */
export async function fetchAuditorCareerRequestTemplateXlsx(): Promise<Buffer | null> {
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 감리원 경력 확인서 템플릿 조회를 건너뜁니다.')
    return null
  }
  return withNasRetry('감리원 경력 확인서 템플릿 조회', async sid => {
    const buf = await downloadFile(sid, AUDITOR_CAREER_REQUEST_TEMPLATE_FILE)
    if (!buf) throw new Error('다운로드 실패: ' + AUDITOR_CAREER_REQUEST_TEMPLATE_FILE)
    return buf
  })
}

// 인력별 자격증 스캔본이 모여있는 폴더 — 도장과 마찬가지로 "상근"/"비상근"으로 나뉘어
// 저장돼있다. 이 기능(감리원 경력 확인서)은 상근 감리원을 우선 대상으로 하므로 "상근"을
// 먼저 찾고 없으면 "비상근"으로 넘어간다(2026-09-08 사용자 확인 — 도장 조회와 반대 순서:
// 여기서는 상근 인력이 압도적으로 많음).
const AUDITOR_CERTIFICATE_FOLDER = '/activo/04.제안팀/99.악티보포털참조용/02.제안/03.자격증사본'
const AUDITOR_CERTIFICATE_SUBFOLDERS = ['자격증(상근)', '자격증(비상근)'] as const

/**
 * 인력 이름 목록으로 "자격증(이름).pptx"를 NAS에서 한 번에 찾아 반환합니다 (이름 → 파일
 * 바이트, 못 찾은 사람은 null). fetchPersonalStampPngs와 동일한 패턴 — 로그인/로그아웃은
 * 전체 목록에 대해 한 번만 하고, 사람별 다운로드는 같은 세션(sid)으로 동시에 처리합니다.
 */
export async function fetchAuditorCertificatePptxs(personNames: string[]): Promise<Map<string, Buffer | null>> {
  const result = new Map<string, Buffer | null>(personNames.map(name => [name, null]))
  if (!NAS_BASE_URL || !NAS_USERNAME || !NAS_PASSWORD) {
    console.warn('[nas-client] NAS_BASE_URL/NAS_USERNAME/NAS_PASSWORD 환경변수가 없어 자격증 스캔본 조회를 건너뜁니다.')
    return result
  }

  let sid: string
  try {
    sid = await login()
  } catch (e) {
    console.warn('[nas-client] NAS 로그인 실패:', (e as Error).message)
    return result
  }

  try {
    await Promise.all(
      personNames.map(async name => {
        for (const sub of AUDITOR_CERTIFICATE_SUBFOLDERS) {
          const path = `${AUDITOR_CERTIFICATE_FOLDER}/${sub}/자격증(${name}).pptx`
          const buf = await downloadFile(sid, path)
          if (buf) {
            result.set(name, buf)
            return
          }
        }
      })
    )
  } finally {
    await logout(sid)
  }

  return result
}
