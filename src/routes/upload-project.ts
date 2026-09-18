/**
 * 사업 제안작업표 HTML 업로드 → 파싱 → PostgreSQL 저장 API
 * POST /api/upload/project
 * 중복 처리: audit_projects.project_name 동일 시 UPSERT (덮어쓰기)
 */
import { Hono } from 'hono'
import { parseProjectHtml } from '../parsers/project-parser.js'
import { parseHtmlTables } from '../parsers/html-table-parser.js'
import { transaction } from '../db/client.js'
import type pg from 'pg'

const app = new Hono()

/** 디버그: DB 저장 없이 파싱 결과만 반환 */
app.post('/debug', async (c) => {
  let html: string
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ ok: false, error: 'file 필드 없음' }, 400)
    html = await file.text()
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400)
  }

  // 테이블 raw 구조 확인
  const tables = parseHtmlTables(html)
  const tablesSummary = tables.map((t, i) => ({
    index: i,
    rowCount: t.rows.length,
    // 첫 3행 미리보기
    preview: t.rows.slice(0, 3).map(r => r.slice(0, 5)),
  }))

  let parsed
  try {
    parsed = parseProjectHtml(html)
  } catch (e) {
    return c.json({ ok: false, error: `파싱 실패: ${String(e)}`, tablesSummary }, 422)
  }

  const { proposal_members, phase_assignments } = parsed

  return c.json({
    ok: true,
    tableCount: tables.length,
    tablesSummary,
    // t8 (index 7) 전체 raw rows
    t8_raw: tables[7]?.rows ?? [],
    proposal_members: proposal_members.map(m => ({
      name: m.person_name,
      type: m.member_type,
      group: m.member_group,
      domain: m.domain,
      regular_md: m.regular_md,
    })),
    phase_assignments: phase_assignments.map(a => ({
      phase: a.phase_name,
      name: a.person_name,
      type: a.member_type,
    })),
  })
})

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
    parsed = parseProjectHtml(html)
  } catch (e) {
    return c.json({ ok: false, error: `파싱 실패: ${String(e)}` }, 422)
  }

  const { project, keywords, keyword_mappings, phases, phase_assignments, proposal_members, proposal_files, attachments_toc } = parsed

  if (!project.project_name)
    return c.json({ ok: false, error: '사업명을 파싱할 수 없습니다. 제안작업표 HTML인지 확인하세요' }, 422)

  // ── DB 저장 ──
  try {
    const result = await transaction(async (client: pg.PoolClient) => {
      // 1. audit_projects UPSERT
      const projRes = await client.query(`
        INSERT INTO audit_projects (
          project_name, bid_notice_no, client_org, registered_yearmonth,
          target_project_name, target_client_org, target_period_start, target_period_end,
          bid_amount, bid_amount_excl_vat, bid_rate, base_budget,
          bid_deadline, bid_open_dt, eval_dt,
          required_md, proposed_md, optimal_md,
          md_unit_price_incl, md_unit_price_excl, base_unit_price,
          proposal_allowance, proposal_allowance_rate,
          required_phases, required_audit_days,
          eval_method, proposal_status,
          writer, director, supporters, references_cc,
          special_notes, remarks, proposal_template,
          updated_at
        ) VALUES (
          $1,$2,$3,$4, $5,$6,$7,$8, $9,$10,$11,$12, $13,$14,$15,
          $16,$17,$18, $19,$20,$21, $22,$23, $24,$25, $26,$27,
          $28,$29,$30,$31, $32,$33,$34, NOW()
        )
        ON CONFLICT (project_name) DO UPDATE SET
          bid_notice_no           = EXCLUDED.bid_notice_no,
          client_org              = EXCLUDED.client_org,
          registered_yearmonth    = EXCLUDED.registered_yearmonth,
          target_project_name     = EXCLUDED.target_project_name,
          target_client_org       = EXCLUDED.target_client_org,
          target_period_start     = EXCLUDED.target_period_start,
          target_period_end       = EXCLUDED.target_period_end,
          bid_amount              = EXCLUDED.bid_amount,
          bid_amount_excl_vat     = EXCLUDED.bid_amount_excl_vat,
          bid_rate                = EXCLUDED.bid_rate,
          base_budget             = EXCLUDED.base_budget,
          bid_deadline            = EXCLUDED.bid_deadline,
          bid_open_dt             = EXCLUDED.bid_open_dt,
          eval_dt                 = EXCLUDED.eval_dt,
          required_md             = EXCLUDED.required_md,
          proposed_md             = EXCLUDED.proposed_md,
          optimal_md              = EXCLUDED.optimal_md,
          md_unit_price_incl      = EXCLUDED.md_unit_price_incl,
          md_unit_price_excl      = EXCLUDED.md_unit_price_excl,
          base_unit_price         = EXCLUDED.base_unit_price,
          proposal_allowance      = EXCLUDED.proposal_allowance,
          proposal_allowance_rate = EXCLUDED.proposal_allowance_rate,
          required_phases         = EXCLUDED.required_phases,
          required_audit_days     = EXCLUDED.required_audit_days,
          eval_method             = EXCLUDED.eval_method,
          proposal_status         = EXCLUDED.proposal_status,
          writer                  = EXCLUDED.writer,
          director                = EXCLUDED.director,
          supporters              = EXCLUDED.supporters,
          references_cc           = EXCLUDED.references_cc,
          special_notes           = EXCLUDED.special_notes,
          remarks                 = EXCLUDED.remarks,
          proposal_template       = EXCLUDED.proposal_template,
          updated_at              = NOW()
        RETURNING id
      `, [
        project.project_name, project.bid_notice_no, project.client_org, project.registered_yearmonth,
        project.target_project_name, project.target_client_org, project.target_period_start, project.target_period_end,
        project.bid_amount, project.bid_amount_excl_vat, project.bid_rate, project.base_budget,
        project.bid_deadline, project.bid_open_dt, project.eval_dt,
        project.required_md, project.proposed_md, project.optimal_md,
        project.md_unit_price_incl, project.md_unit_price_excl, project.base_unit_price,
        project.proposal_allowance, project.proposal_allowance_rate,
        project.required_phases, project.required_audit_days,
        project.eval_method, project.proposal_status,
        project.writer, project.director, project.supporters, project.references_cc,
        project.special_notes, project.remarks, project.proposal_template,
      ])

      const projectId: number = projRes.rows[0].id

      // 2. 하위 테이블 삭제 (CASCADE로 phase_assignments도 자동 삭제)
      await Promise.all([
        client.query('DELETE FROM keywords WHERE project_id = $1', [projectId]),
        client.query('DELETE FROM keyword_mappings WHERE project_id = $1', [projectId]),
        client.query('DELETE FROM audit_phases WHERE project_id = $1', [projectId]),
        client.query('DELETE FROM proposal_members WHERE project_id = $1', [projectId]),
        client.query('DELETE FROM proposal_files WHERE project_id = $1', [projectId]),
        client.query('DELETE FROM proposal_attachments_toc WHERE project_id = $1', [projectId]),
      ])

      // 3. keywords 배치 삽입
      if (keywords.length > 0) {
        const vals: unknown[] = []
        const ph = keywords.map((kw, i) => {
          vals.push(projectId, kw.keyword, kw.sort_order)
          return `($${i*3+1},$${i*3+2},$${i*3+3})`
        }).join(',')
        await client.query(
          `INSERT INTO keywords (project_id, keyword, sort_order) VALUES ${ph} ON CONFLICT DO NOTHING`,
          vals
        )
      }

      // 4. keyword_mappings (keyword_id JOIN)
      for (const km of keyword_mappings) {
        const kwRow = await client.query(
          'SELECT id FROM keywords WHERE project_id = $1 AND keyword = $2',
          [projectId, km.original_keyword]
        )
        await client.query(`
          INSERT INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (project_id, original_keyword, mapped_keyword) DO NOTHING
        `, [projectId, kwRow.rows[0]?.id ?? null, km.original_keyword, km.mapped_keyword])
      }

      // 5. audit_phases + phase_assignments
      const phaseIdMap: Record<string, number> = {}
      for (const phase of phases) {
        const phaseRes = await client.query(`
          INSERT INTO audit_phases
            (project_id, phase_name, phase_days, phase_start_date, phase_end_date, phase_order,
             total_auditor_cnt, pre_survey_md, audit_md, action_confirm_md, proposed_md)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          RETURNING id
        `, [
          projectId, phase.phase_name, phase.phase_days,
          phase.phase_start_date, phase.phase_end_date, phase.phase_order,
          phase.total_auditor_cnt, phase.pre_survey_md, phase.audit_md,
          phase.action_confirm_md, phase.proposed_md,
        ])
        phaseIdMap[phase.phase_name] = phaseRes.rows[0].id
      }

      for (const a of phase_assignments) {
        const phaseId = phaseIdMap[a.phase_name]
        if (!phaseId) continue
        await client.query(`
          INSERT INTO audit_phase_assignments
            (phase_id, project_id, person_name, member_type, pre_survey_md, audit_md, action_confirm_md)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [phaseId, projectId, a.person_name, a.member_type, a.pre_survey_md, a.audit_md, a.action_confirm_md])
      }

      // 6. proposal_members — personnel_id 자동 매칭
      for (const m of proposal_members) {
        // person_name으로 personnel 테이블에서 id 조회 (trim 일치)
        const matched = await client.query(
          `SELECT id FROM personnel WHERE TRIM(name) = TRIM($1) LIMIT 1`,
          [m.person_name]
        )
        const personnelId = matched.rows[0]?.id ?? null

        await client.query(`
          INSERT INTO proposal_members
            (project_id, personnel_id, person_name, member_group, member_type, domain,
             regular_md, additional_md, acceptance_md,
             is_fulltime, auditor_grade, auditor_cert_no, phone, education_hours)
          VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9, $10,$11,$12,$13,$14)
        `, [
          projectId, personnelId, m.person_name, m.member_group, m.member_type, m.domain,
          m.regular_md, m.additional_md, m.acceptance_md,
          m.is_fulltime, m.auditor_grade, m.auditor_cert_no, m.phone, m.education_hours,
        ])
      }

      // 7. proposal_files
      for (const f of proposal_files) {
        await client.query(`
          INSERT INTO proposal_files (project_id, file_category, file_name, file_size_kb, uploaded_at, file_type)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [projectId, f.file_category, f.file_name, f.file_size_kb, f.uploaded_at, f.file_type])
      }

      // 8. attachments_toc
      for (const t of attachments_toc) {
        await client.query(`
          INSERT INTO proposal_attachments_toc (project_id, item_order, item_name)
          VALUES ($1,$2,$3)
        `, [projectId, t.item_order, t.item_name])
      }

      return {
        project_id:        projectId,
        project_name:      project.project_name,
        keywords:          keywords.length,
        keyword_mappings:  keyword_mappings.length,
        phases:            phases.length,
        phase_assignments: phase_assignments.length,
        proposal_members:  proposal_members.length,
        proposal_files:    proposal_files.length,
        attachments_toc:   attachments_toc.length,
      }
    })

    return c.json({ ok: true, message: `사업 "${project.project_name}" 저장 완료`, data: result })
  } catch (e) {
    return c.json({ ok: false, error: `DB 저장 실패: ${String(e)}` }, 500)
  }
})

export default app
