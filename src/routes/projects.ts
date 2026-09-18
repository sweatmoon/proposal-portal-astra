/**
 * GET /api/projects       — 제안작업표 목록
 * GET /api/projects/:id   — 제안작업표 상세
 * DELETE /api/projects/:id — 제안작업표 삭제 (cascade)
 */
import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

// ── 목록 ──────────────────────────────────────────────────────
app.get('/', async (c) => {
  const status = c.req.query('status') || ''
  const search = c.req.query('search') || ''

  let sql = `
    SELECT
      p.id, p.project_name, p.client_org, p.bid_notice_no,
      p.bid_deadline, p.bid_amount, p.bid_rate,
      p.required_md, p.proposed_md,
      p.proposal_status, p.eval_method,
      p.writer, p.director,
      p.registered_yearmonth,
      p.eval_dt,
      COUNT(DISTINCT pm.id) AS member_count,
      COUNT(DISTINCT ph.id) AS phase_count
    FROM audit_projects p
    LEFT JOIN proposal_members pm ON pm.project_id = p.id
    LEFT JOIN audit_phases ph     ON ph.project_id = p.id
    WHERE 1=1
  `
  const params: string[] = []
  let idx = 1

  if (status) {
    sql += ` AND p.proposal_status = $${idx++}`
    params.push(status)
  }
  if (search) {
    sql += ` AND (p.project_name ILIKE $${idx} OR p.client_org ILIKE $${idx})`
    params.push(`%${search}%`)
    idx++
  }

  sql += ` GROUP BY p.id ORDER BY p.bid_deadline DESC NULLS LAST, p.id DESC`

  const rows = await query(sql, params)
  return c.json({ ok: true, data: rows })
})

// ── 상태 통계 ─────────────────────────────────────────────────
app.get('/stats', async (c) => {
  const rows = await query<{ proposal_status: string; cnt: string }>(`
    SELECT proposal_status, COUNT(*) AS cnt
    FROM audit_projects
    GROUP BY proposal_status
    ORDER BY cnt DESC
  `)
  const total = await queryOne<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM audit_projects')
  return c.json({ ok: true, total: Number(total?.cnt ?? 0), byStatus: rows })
})

// ── 상세 ──────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ ok: false, error: 'invalid id' }, 400)

  const project = await queryOne<Record<string, unknown>>(
    'SELECT * FROM audit_projects WHERE id = $1', [id]
  )
  if (!project) return c.json({ ok: false, error: 'not found' }, 404)

  const [phases, members, keywords, files, toc] = await Promise.all([
    query(`
      SELECT ph.*,
        COALESCE(json_agg(pa ORDER BY pa.id) FILTER (WHERE pa.id IS NOT NULL), '[]') AS assignments
      FROM audit_phases ph
      LEFT JOIN audit_phase_assignments pa ON pa.phase_id = ph.id
      WHERE ph.project_id = $1
      GROUP BY ph.id
      ORDER BY ph.phase_order, ph.id
    `, [id]),
    query(`SELECT * FROM proposal_members WHERE project_id = $1 ORDER BY id`, [id]),
    query(`SELECT * FROM keywords WHERE project_id = $1 ORDER BY sort_order, id`, [id]),
    query(`SELECT * FROM proposal_files WHERE project_id = $1 ORDER BY id`, [id]),
    query(`SELECT * FROM proposal_attachments_toc WHERE project_id = $1 ORDER BY item_order`, [id]),
  ])

  return c.json({ ok: true, data: { project, phases, members, keywords, files, toc } })
})

// ── 삭제 ──────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ ok: false, error: 'invalid id' }, 400)

  const existing = await queryOne<{ id: number; project_name: string }>(
    'SELECT id, project_name FROM audit_projects WHERE id = $1', [id]
  )
  if (!existing) return c.json({ ok: false, error: '존재하지 않는 제안건입니다' }, 404)

  // CASCADE 설정으로 하위 테이블(phases, assignments, members, keywords 등) 자동 삭제
  await query('DELETE FROM audit_projects WHERE id = $1', [id])

  return c.json({ ok: true, message: `"${existing.project_name}" 삭제 완료` })
})

// ── 키워드 치환 규칙 CRUD ──────────────────────────────────────

/** GET /api/projects/:id/keyword-mappings — 치환 목록 조회 */
app.get('/:id/keyword-mappings', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.json({ ok: false, error: 'invalid id' }, 400)
  const rows = await query<{ id: number; original_keyword: string; mapped_keyword: string }>(
    `SELECT id, original_keyword, mapped_keyword
     FROM keyword_mappings WHERE project_id = $1
     ORDER BY id ASC`,
    [id]
  )
  return c.json({ ok: true, mappings: rows })
})

/** POST /api/projects/:id/keyword-mappings — 규칙 추가 */
app.post('/:id/keyword-mappings', async (c) => {
  const projectId = Number(c.req.param('id'))
  if (!projectId) return c.json({ ok: false, error: 'invalid id' }, 400)
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ ok: false, error: 'invalid body' }, 400)

  // original_keyword 는 쉼표 구분 여러 개 지원 (파서와 동일 방식)
  const originals: string[] = String(body.original_keyword ?? '')
    .split(',').map((s: string) => s.trim()).filter(Boolean)
  const mapped: string = String(body.mapped_keyword ?? '').trim()
  if (!originals.length || !mapped)
    return c.json({ ok: false, error: 'original_keyword / mapped_keyword 필수' }, 400)

  const inserted: { id: number; original_keyword: string; mapped_keyword: string }[] = []
  for (const orig of originals) {
    // 같은 (project_id, original_keyword)가 이미 있으면 mapped_keyword 갱신
    const existing = await query<{ id: number }>(
      `SELECT id FROM keyword_mappings WHERE project_id = $1 AND original_keyword = $2 LIMIT 1`,
      [projectId, orig]
    )
    if (existing[0]) {
      await query(
        `UPDATE keyword_mappings SET mapped_keyword = $1 WHERE id = $2`,
        [mapped, existing[0].id]
      )
      inserted.push({ id: existing[0].id, original_keyword: orig, mapped_keyword: mapped })
    } else {
      const row = await query<{ id: number; original_keyword: string; mapped_keyword: string }>(
        `INSERT INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
         VALUES ($1,
           (SELECT id FROM keywords WHERE project_id = $1 AND keyword = $2 LIMIT 1),
           $2, $3)
         RETURNING id, original_keyword, mapped_keyword`,
        [projectId, orig, mapped]
      )
      if (row[0]) inserted.push(row[0])
    }
  }
  return c.json({ ok: true, inserted })
})

/** DELETE /api/projects/:id/keyword-mappings/:mappingId — 규칙 삭제 */
app.delete('/:id/keyword-mappings/:mappingId', async (c) => {
  const projectId  = Number(c.req.param('id'))
  const mappingId  = Number(c.req.param('mappingId'))
  if (!projectId || !mappingId) return c.json({ ok: false, error: 'invalid id' }, 400)
  await query(
    'DELETE FROM keyword_mappings WHERE id = $1 AND project_id = $2',
    [mappingId, projectId]
  )
  return c.json({ ok: true })
})

export default app
