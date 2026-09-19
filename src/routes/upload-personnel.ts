/**
 * 인력 HTML 업로드 → 파싱 → PostgreSQL 저장 API
 * POST /api/upload/personnel
 * 중복 처리: personnel.name 동일 시 UPSERT (덮어쓰기)
 */
import { Hono } from 'hono'
import { parsePersonnelHtml, type MemberProfileUpdates } from '../parsers/personnel-parser.js'
import { transaction } from '../db/client.js'
import type pg from 'pg'

const app = new Hono()

/** 반드시 인력 저장과 같은 트랜잭션에서 호출한다. 사업 정보 UPDATE/DELETE/INSERT 금지. */
export async function syncProposalMemberProfile(client: pg.PoolClient, pid: number, name: string, updates: MemberProfileUpdates) {
  const matches = await client.query<{ id: number }>(
    'SELECT id FROM personnel WHERE TRIM(name) = TRIM($1) ORDER BY id', [name]
  )
  const uniqueName = matches.rows.length === 1 && matches.rows[0].id === pid
  const candidates = await client.query<{ id: number; project_id: number; personnel_id: number | null; name_matches: boolean }>(`
    SELECT id, project_id, personnel_id, TRIM(person_name) = TRIM($2) AS name_matches
    FROM proposal_members
    WHERE personnel_id = $1 OR TRIM(person_name) = TRIM($2)
    ORDER BY id FOR UPDATE
  `, [pid, name])
  const eligible = candidates.rows.filter(row => row.name_matches &&
    (row.personnel_id === pid || (row.personnel_id === null && uniqueName)))
  const skipped = candidates.rows.length - eligible.length
  const fields = (['auditor_grade', 'auditor_cert_no', 'phone', 'education_hours'] as const)
    .filter(key => updates[key] !== undefined)
  let changed: { id: number; project_id: number }[] = []
  if (eligible.length) {
    // 고정 허용 목록 4개 + 빈 인력 연결만 변경. is_fulltime은 반드시 사업 HTML 값 유지.
    // 이름/사업/소속팀/구분/분야/공수/단계/일정에는 절대 대입하지 않는다.
    const result = await client.query<{ id: number; project_id: number }>(`
      UPDATE proposal_members AS pm SET
        personnel_id = $1,
        auditor_grade = COALESCE($3, pm.auditor_grade),
        auditor_cert_no = COALESCE($4, pm.auditor_cert_no),
        phone = COALESCE($5, pm.phone),
        education_hours = COALESCE($6, pm.education_hours)
      WHERE pm.id = ANY($7::int[])
        AND TRIM(pm.person_name) = TRIM($2)
        AND (pm.personnel_id = $1 OR pm.personnel_id IS NULL)
        AND (pm.personnel_id, pm.auditor_grade, pm.auditor_cert_no, pm.phone, pm.education_hours)
          IS DISTINCT FROM ($1, COALESCE($3, pm.auditor_grade), COALESCE($4, pm.auditor_cert_no),
            COALESCE($5, pm.phone), COALESCE($6, pm.education_hours))
      RETURNING pm.id, pm.project_id
    `, [pid, name, updates.auditor_grade ?? null, updates.auditor_cert_no ?? null,
      updates.phone ?? null, updates.education_hours ?? null, eligible.map(row => row.id)])
    changed = result.rows
  }
  const oldUnlinked = new Set(eligible.filter(row => row.personnel_id === null).map(row => row.id))
  return {
    matched_rows: eligible.length,
    updated_rows: changed.length,
    updated_projects: new Set(changed.map(row => row.project_id)).size,
    linked_rows: changed.filter(row => oldUnlinked.has(row.id)).length,
    skipped_rows: skipped,
    fields,
    warnings: skipped ? ['이름 중복·기존 연결 충돌·이름 불일치가 있는 사업 인력은 변경하지 않았습니다.'] : [],
  }
}

app.post('/', async (c) => {
  // ── 파일 수신 ──
  let html: string
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ ok: false, error: 'file 필드가 없습니다' }, 400)
    if (!file.name.toLowerCase().endsWith('.html'))
      return c.json({ ok: false, error: 'HTML 파일만 업로드 가능합니다' }, 400)
    html = await file.text()
  } catch (e) {
    return c.json({ ok: false, error: `파일 읽기 실패: ${String(e)}` }, 400)
  }

  // ── 파싱 ──
  let parsed
  try {
    parsed = parsePersonnelHtml(html)
  } catch (e) {
    return c.json({ ok: false, error: `파싱 실패: ${String(e)}` }, 422)
  }

  const { personnel, memberProfileUpdates, certifications, audit_history, it_career, project_career } = parsed
  if (!personnel.name)
    return c.json({ ok: false, error: '성명을 파싱할 수 없습니다. 인력 프로파일 HTML인지 확인하세요' }, 422)

  // ── DB 저장 ──
  try {
    const result = await transaction(async (client: pg.PoolClient) => {
      // email 중복 방지: 동일 email이 다른 인력에 이미 존재하면 NULL 처리
      let safeEmail: string | null = personnel.email || null
      if (safeEmail) {
        const existing = await client.query(
          `SELECT id FROM personnel WHERE email = $1 AND name != $2 LIMIT 1`,
          [safeEmail, personnel.name]
        )
        if (existing.rows.length > 0) safeEmail = null
      }

      // 1. personnel UPSERT (name 기준)
      const upsertRes = await client.query(`
        INSERT INTO personnel (
          name, position, is_fulltime, company,
          email, phone, birthdate,
          auditor_cert_no, auditor_grade, tech_grade,
          school, major, degree,
          career_summary, career_qualif, career_project, career_expert,
          education_name, education_hours, education_org,
          updated_at
        ) VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12,$13, $14,$15,$16,$17, $18,$19,$20, NOW())
        ON CONFLICT (name) DO UPDATE SET
          position        = EXCLUDED.position,
          is_fulltime     = EXCLUDED.is_fulltime,
          company         = EXCLUDED.company,
          email           = EXCLUDED.email,
          phone           = CASE WHEN $21 THEN EXCLUDED.phone ELSE personnel.phone END,
          birthdate       = EXCLUDED.birthdate,
          auditor_cert_no = CASE WHEN $22 THEN EXCLUDED.auditor_cert_no ELSE personnel.auditor_cert_no END,
          auditor_grade   = CASE WHEN $23 THEN EXCLUDED.auditor_grade ELSE personnel.auditor_grade END,
          tech_grade      = EXCLUDED.tech_grade,
          school          = EXCLUDED.school,
          major           = EXCLUDED.major,
          degree          = EXCLUDED.degree,
          career_summary  = EXCLUDED.career_summary,
          career_qualif   = EXCLUDED.career_qualif,
          career_project  = EXCLUDED.career_project,
          career_expert   = EXCLUDED.career_expert,
          education_name  = EXCLUDED.education_name,
          education_hours = CASE WHEN $24 THEN EXCLUDED.education_hours ELSE personnel.education_hours END,
          education_org   = EXCLUDED.education_org,
          updated_at      = NOW()
        RETURNING id
      `, [
        personnel.name, personnel.position, personnel.is_fulltime, personnel.company,
        safeEmail, personnel.phone, personnel.birthdate,
        personnel.auditor_cert_no, personnel.auditor_grade, personnel.tech_grade,
        personnel.school, personnel.major, personnel.degree,
        personnel.career_summary, personnel.career_qualif, personnel.career_project, personnel.career_expert,
        personnel.education_name, memberProfileUpdates.education_hours ?? 0, personnel.education_org,
        memberProfileUpdates.phone !== undefined, memberProfileUpdates.auditor_cert_no !== undefined,
        memberProfileUpdates.auditor_grade !== undefined, memberProfileUpdates.education_hours !== undefined,
      ])

      const pid: number = upsertRes.rows[0].id

      // 2. 하위 테이블 삭제
      await client.query('DELETE FROM personnel_certifications WHERE personnel_id = $1', [pid])
      await client.query('DELETE FROM personnel_audit_history WHERE personnel_id = $1', [pid])
      await client.query('DELETE FROM personnel_it_career WHERE personnel_id = $1', [pid])
      await client.query('DELETE FROM personnel_project_career WHERE personnel_id = $1', [pid])

      // 3. 자격증
      for (const cert of certifications) {
        await client.query(`
          INSERT INTO personnel_certifications (personnel_id, cert_name, cert_year, issuer, is_national, related_field)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [pid, cert.cert_name, cert.cert_year, cert.issuer, cert.is_national, cert.related_field])
      }

      // 4. 감리실적 (배치)
      const BATCH = 50
      for (let i = 0; i < audit_history.length; i += BATCH) {
        const chunk = audit_history.slice(i, i + BATCH)
        // VALUES 플레이스홀더 생성
        const values: unknown[] = []
        const placeholders = chunk.map((h, j) => {
          const base = j * 9
          values.push(pid, h.audit_yearmonth, h.project_name, h.client_org, h.sector, h.domain, h.role, h.phase, h.participation_rate)
          return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`
        }).join(',')
        await client.query(`
          INSERT INTO personnel_audit_history
            (personnel_id, audit_yearmonth, project_name, client_org, sector, domain, role, phase, participation_rate)
          VALUES ${placeholders}
        `, values)
      }

      // ── 감리경력 동적 계산 ──────────────────────────────────
      // audit_history 중 가장 오래된 audit_yearmonth → auditor_start_date
      // 현재까지 연수 = (현재년월 - 첫 감리년월) / 12
      if (audit_history.length > 0) {
        // "YYYY.MM" 또는 "YYYY년MM월" → 비교 가능 정렬 문자열로 변환
        const toSortable = (ym: string): string => {
          const m = ym.match(/(\d{4})[.\s년](\d{1,2})/)
          if (m) return `${m[1]}.${m[2].padStart(2, '0')}`
          return ym
        }
        const sorted = [...audit_history]
          .map(h => toSortable(h.audit_yearmonth))
          .filter(s => /^\d{4}\.\d{2}$/.test(s))
          .sort()  // 사전순 = 시간순

        if (sorted.length > 0) {
          const earliest = sorted[0]  // ex) "2003.07"
          const [startYear, startMonth] = earliest.split('.').map(Number)

          const now = new Date()
          const nowYear  = now.getFullYear()
          const nowMonth = now.getMonth() + 1  // 1-indexed

          const totalMonths = (nowYear - startYear) * 12 + (nowMonth - startMonth)
          const careerYrs   = Math.max(0, Math.round(totalMonths / 12 * 10) / 10)

          await client.query(`
            UPDATE personnel
            SET auditor_start_date = $1, auditor_career_yrs = $2
            WHERE id = $3
          `, [earliest, careerYrs, pid])
        }
      }

      // 5. IT 경력 (감리 이외의 IT 경력)
      for (const ic of it_career) {
        await client.query(`
          INSERT INTO personnel_it_career
            (personnel_id, period_start, period_end, career, duty, basis)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [pid, ic.period_start, ic.period_end, ic.career, ic.duty, ic.basis])
      }

      // 6. 프로젝트 및 기타 경력
      for (const pc of project_career) {
        await client.query(`
          INSERT INTO personnel_project_career
            (personnel_id, year_range, project_name, client_org, domain, role, company, remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [pid, pc.year_range, pc.project_name, pc.client_org, pc.domain, pc.role, pc.company, pc.remarks])
      }

      // 사업별 상근/비상근과 배정정보는 보존하고, 기존 모든 사업의 해당 인력만 동기화한다.
      // 실패하면 인력·이력 저장도 함께 롤백되어 부분 반영되지 않는다.
      const profileSync = await syncProposalMemberProfile(client, pid, personnel.name, memberProfileUpdates)

      return {
        profile_sync: profileSync,
        personnel_id: pid,
        name: personnel.name,
        certifications: certifications.length,
        audit_history: audit_history.length,
        it_career: it_career.length,
        project_career: project_career.length,
      }
    })

    const sync = result.profile_sync
    const review = sync.skipped_rows ? ` · 연결 검토 ${sync.skipped_rows}건 (변경 제외)` : ''
    return c.json({ ok: true, message: `인력 "${personnel.name}" 저장 완료 · 사업 ${sync.updated_projects}개/인력행 ${sync.updated_rows}건 갱신 · 신규 이름/(K) 연결 ${sync.linked_rows}건${review}`, data: result })
  } catch (e) {
    return c.json({ ok: false, error: `DB 저장 실패: ${String(e)}` }, 500)
  }
})

export default app
