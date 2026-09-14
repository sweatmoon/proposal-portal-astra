/**
 * GET /api/personnel       — 인력 목록
 * GET /api/personnel/:id   — 인력 상세
 */
import { Hono } from 'hono';
import { query, queryOne } from '../db/client.js';
import { fetchPersonnelPhotos } from '../lib/nas-client.js';
const app = new Hono();
app.get('/', async (c) => {
    const search = c.req.query('search') || '';
    const grade = c.req.query('grade') || '';
    let sql = `
    SELECT
      p.id, p.name, p.position, p.company, p.is_fulltime,
      p.auditor_grade, p.auditor_cert_no, p.auditor_career_yrs,
      p.phone,
      COUNT(DISTINCT pc.id) AS cert_count,
      COUNT(DISTINCT ph.id) AS audit_count
    FROM personnel p
    LEFT JOIN personnel_certifications pc ON pc.personnel_id = p.id
    LEFT JOIN personnel_audit_history  ph ON ph.personnel_id = p.id
    WHERE 1=1
  `;
    const params = [];
    let idx = 1;
    if (search) {
        sql += ` AND (p.name ILIKE $${idx} OR p.company ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
    }
    if (grade) {
        sql += ` AND p.auditor_grade = $${idx++}`;
        params.push(grade);
    }
    sql += ` GROUP BY p.id ORDER BY TRIM(p.name) COLLATE "C" ASC`;
    const rows = await query(sql, params);
    return c.json({ ok: true, data: rows });
});
app.get('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id))
        return c.json({ ok: false, error: 'invalid id' }, 400);
    const person = await queryOne('SELECT * FROM personnel WHERE id = $1', [id]);
    if (!person)
        return c.json({ ok: false, error: 'not found' }, 404);
    const [certs, auditHistory, itCareer] = await Promise.all([
        query('SELECT * FROM personnel_certifications WHERE personnel_id = $1 ORDER BY cert_year DESC', [id]),
        query('SELECT * FROM personnel_audit_history  WHERE personnel_id = $1 ORDER BY audit_yearmonth DESC', [id]),
        query('SELECT * FROM personnel_it_career      WHERE personnel_id = $1 ORDER BY period_start DESC', [id]),
    ]);
    return c.json({ ok: true, data: { person, certs, auditHistory, itCareer } });
});
/**
 * GET /api/personnel/:id/audit-match?projectId=N
 * 특정 인원의 감리이력을 제안 프로젝트 키워드 기준으로 매칭/정렬하여 반환
 * 응답: { ok, person, keywords, rows }
 *   rows[]: { ...audit_history, matched_keywords: string[], mapped_keywords: string[], match_count: number }
 */
app.get('/:id/audit-match', async (c) => {
    const personnelId = Number(c.req.param('id'));
    const projectId = Number(c.req.query('projectId') || '0');
    if (isNaN(personnelId) || personnelId <= 0)
        return c.json({ ok: false, error: 'invalid personnelId' }, 400);
    if (isNaN(projectId) || projectId <= 0)
        return c.json({ ok: false, error: 'projectId required' }, 400);
    const [person, auditHistory, kwRows, kmRows, memberRow] = await Promise.all([
        queryOne('SELECT id, name, position, company, auditor_grade FROM personnel WHERE id = $1', [personnelId]),
        query('SELECT * FROM personnel_audit_history WHERE personnel_id = $1 ORDER BY audit_yearmonth DESC', [personnelId]),
        // 키워드 (sort_order 순 = 우선순위 순)
        query('SELECT id, keyword, sort_order FROM keywords WHERE project_id = $1 ORDER BY sort_order ASC', [projectId]),
        // 키워드 변환 룰
        query('SELECT original_keyword, mapped_keyword FROM keyword_mappings WHERE project_id = $1', [projectId]),
        // 이 인원의 전문분야 (proposal_members.domain) — 분야 보충 매칭에 사용
        queryOne(`SELECT domain FROM proposal_members
       WHERE project_id = $1 AND personnel_id = $2
       LIMIT 1`, [projectId, personnelId]),
    ]);
    if (!person)
        return c.json({ ok: false, error: 'person not found' }, 404);
    // 변환 맵: original → mapped
    const mappingMap = new Map();
    for (const km of kmRows) {
        mappingMap.set(km.original_keyword, km.mapped_keyword);
    }
    // 각 감리이력에 대해 키워드 매칭
    const rawRows = auditHistory.map(h => {
        const projectNameNorm = String(h.project_name ?? '').replace(/\s+/g, '');
        const sectorNorm = String(h.sector ?? '').replace(/\s+/g, '');
        const domainNorm = String(h.domain ?? '').replace(/\s+/g, '');
        const clientOrgNorm = String(h.client_org ?? '').replace(/\s+/g, '');
        const combined = projectNameNorm + sectorNorm + domainNorm + clientOrgNorm;
        // 매칭된 원본 키워드 목록 (sort_order 순)
        const matched = [];
        for (const kw of kwRows) {
            const kwNorm = kw.keyword.replace(/\s+/g, '');
            if (combined.includes(kwNorm)) {
                matched.push(kw.keyword);
            }
        }
        // 변환된 키워드 목록
        const mapped = matched.map(kw => mappingMap.get(kw) ?? kw);
        return {
            ...h,
            matched_keywords: matched,
            mapped_keywords: mapped,
            match_count: matched.length,
            match_type: 'keyword',
            top_sort_order: matched.length > 0
                ? (kwRows.find(k => k.keyword === matched[0])?.sort_order ?? 9999)
                : 9999,
        };
    });
    // ── project_name 기준 중복 제거 (전체 이력) ──────────────────
    const seen = new Set();
    const dedupedRows = rawRows.filter(r => {
        const key = String(r.project_name ?? '').trim();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    // ── 전문분야 토큰 추출 ─────────────────────────────────────
    // "응용시스템 (정산)" → ["응용시스템", "정산"]
    const personDomain = String(memberRow?.domain ?? '').trim();
    const personDomainTokens = personDomain
        .split(/[\s,()（）\/]+/)
        .map(s => s.trim().replace(/\s+/g, ''))
        .filter(s => s.length >= 2);
    // ── 각 행에 match_type 재판정 ─────────────────────────────
    // keyword: match_count > 0
    // domain:  match_count = 0 이지만 h.domain이 전문분야 토큰과 부분매칭
    // none:    나머지
    const typedRows = dedupedRows.map(r => {
        const mc = r.match_count;
        if (mc > 0) {
            return { ...r, match_type: 'keyword' };
        }
        if (personDomainTokens.length > 0) {
            const hDomainNorm = String(r.domain ?? '').replace(/\s+/g, '');
            const isDomainMatch = hDomainNorm.length > 0 &&
                personDomainTokens.some(tok => hDomainNorm.includes(tok));
            if (isDomainMatch) {
                return { ...r, match_type: 'domain' };
            }
        }
        return { ...r, match_type: 'none' };
    });
    // ── 3순위 정렬 ────────────────────────────────────────────
    // 1순위: keyword (상위 키워드 sort_order 낮은 순 → 최신 연월 순)
    // 2순위: domain  (최신 연월 순)
    // 3순위: none    (최신 연월 순)
    const groupOrder = { keyword: 0, domain: 1, none: 2 };
    typedRows.sort((a, b) => {
        const aType = a.match_type;
        const bType = b.match_type;
        const gA = groupOrder[aType] ?? 2;
        const gB = groupOrder[bType] ?? 2;
        if (gA !== gB)
            return gA - gB;
        // 같은 그룹 내: keyword는 top_sort_order 우선
        if (aType === 'keyword') {
            const aTop = a.top_sort_order;
            const bTop = b.top_sort_order;
            if (aTop !== bTop)
                return aTop - bTop;
        }
        const aYm = String(a.audit_yearmonth ?? '');
        const bYm = String(b.audit_yearmonth ?? '');
        return bYm.localeCompare(aYm);
    });
    // ── 통계 ─────────────────────────────────────────────────
    const kwMatchedCount = typedRows.filter(r => r.match_type === 'keyword').length;
    const domainRowsCount = typedRows.filter(r => r.match_type === 'domain').length;
    return c.json({
        ok: true,
        person,
        keywords: kwRows,
        mappingMap: Object.fromEntries(mappingMap),
        rows: typedRows,
        kw_matched_count: kwMatchedCount,
        domain_rows_count: domainRowsCount,
    });
});
/**
 * GET /api/personnel/:id/photo-profile?projectId=N
 * 사진장표 생성에 필요한 placeholder 데이터 전체 반환
 *
 * 반환 구조:
 * {
 *   ok: true,
 *   data: {
 *     이름, 분야, 등급, 자격구분,          ← proposal_members
 *     자격요약, IT경력,                    ← personnel.career_qualif / career_project
 *     감리횟수, 자격수,                    ← COUNT
 *     감리경력,                            ← audit_history 최초연월 → 현재
 *     IT경력기간,                          ← personnel_it_career 합산
 *     실적: string[],                      ← audit-match 상위 10건 "[키워드] 기관명, 사업명" (코드에선 [감리이력N] placeholder로 매핑)
 *   }
 * }
 */
app.get('/:id/photo-profile', async (c) => {
    const personnelId = Number(c.req.param('id'));
    const projectId = Number(c.req.query('projectId') || '0');
    if (isNaN(personnelId) || personnelId <= 0)
        return c.json({ ok: false, error: 'invalid personnelId' }, 400);
    if (isNaN(projectId) || projectId <= 0)
        return c.json({ ok: false, error: 'projectId required' }, 400);
    // ── 병렬 조회 ──────────────────────────────────────────────
    const [member, person, certs, auditHistory, itCareer, kwRows, kmRows] = await Promise.all([
        // 제안 인력 행 (분야, 등급, 자격번호)
        queryOne(`SELECT person_name, domain, auditor_grade, auditor_cert_no, personnel_id
       FROM proposal_members WHERE project_id = $1 AND personnel_id = $2 LIMIT 1`, [projectId, personnelId]),
        // 인력 기본 정보
        queryOne(`SELECT name, career_qualif, career_project, career_expert FROM personnel WHERE id = $1`, [personnelId]),
        // 자격증 전체
        query(`SELECT cert_name FROM personnel_certifications WHERE personnel_id = $1 ORDER BY cert_year DESC`, [personnelId]),
        // 감리실적 전체 (연월 ASC → 최초 연월 계산용)
        query(`SELECT audit_yearmonth, project_name, client_org, domain
       FROM personnel_audit_history WHERE personnel_id = $1 ORDER BY audit_yearmonth ASC`, [personnelId]),
        // IT경력 (기간 합산용)
        query(`SELECT period_start, period_end FROM personnel_it_career WHERE personnel_id = $1`, [personnelId]),
        // 프로젝트 키워드
        query(`SELECT keyword, sort_order FROM keywords WHERE project_id = $1 ORDER BY sort_order ASC`, [projectId]),
        // 키워드 변환 룰
        query(`SELECT original_keyword, mapped_keyword FROM keyword_mappings WHERE project_id = $1`, [projectId]),
    ]);
    if (!person)
        return c.json({ ok: false, error: 'person not found' }, 404);
    // ── [자격구분] 감리사 > 기술사 > 감리원 우선순위 ──────────────
    // 자격증 기반: cert_name에서 키워드만 추출
    // 자격증 없으면 auditor_grade로 '감리원' fallback
    const certGamri = certs.find(c2 => c2.cert_name.includes('감리사'));
    const certGisul = certs.find(c2 => c2.cert_name.includes('기술사'));
    const 자격구분 = certGamri ? '감리사'
        : certGisul ? '기술사'
            : (member?.auditor_grade ?? '').trim() ? '감리원'
                : '';
    // ── [감리경력] 최초 audit_yearmonth → 현재까지 ─────────────
    const toYM = (ym) => {
        const m = String(ym).match(/(\d{4})[.\s년](\d{1,2})/);
        return m ? `${m[1]}.${m[2].padStart(2, '0')}` : String(ym);
    };
    const sortedYM = auditHistory
        .map(h => toYM(h.audit_yearmonth))
        .filter(s => /^\d{4}\.\d{2}$/.test(s))
        .sort();
    let 감리경력 = '';
    if (sortedYM.length > 0) {
        const [sy, sm] = sortedYM[0].split('.').map(Number);
        const now = new Date();
        const ny = now.getFullYear(), nm = now.getMonth() + 1;
        const totalMonths = Math.max(0, (ny - sy) * 12 + (nm - sm));
        const yrs = Math.floor(totalMonths / 12);
        const mos = totalMonths % 12;
        감리경력 = yrs > 0 ? `${yrs}년 ${mos}개월` : `${mos}개월`;
    }
    // ── [IT경력기간] MIN(period_start) ~ MAX(period_end) 기간 계산 ──
    // 각 경력의 기간을 단순 합산하면 겹치는 기간이 과다 계산됨
    // → 전체 경력 중 가장 이른 시작일 ~ 가장 늦은 종료일(없으면 현재)로 계산
    let IT경력기간 = '0년 0개월';
    const parseYMVal = (s) => {
        if (!s)
            return null;
        const mt = String(s).match(/(\d{4})[.\-년](\d{1,2})/);
        return mt ? { y: Number(mt[1]), m: Number(mt[2]) } : null;
    };
    const itStarts = itCareer.map(c2 => parseYMVal(c2.period_start)).filter(Boolean);
    const itEnds = itCareer.map(c2 => parseYMVal(c2.period_end)).filter(Boolean);
    if (itStarts.length > 0) {
        // MIN start
        const minStart = itStarts.reduce((a, b) => (a.y * 12 + a.m <= b.y * 12 + b.m ? a : b));
        // MAX end (없으면 현재)
        const now = new Date();
        const nowYM = { y: now.getFullYear(), m: now.getMonth() + 1 };
        const maxEnd = itEnds.length > 0
            ? itEnds.reduce((a, b) => (a.y * 12 + a.m >= b.y * 12 + b.m ? a : b))
            : nowYM;
        // period_end가 없는 재직 중 경력이 있으면 현재를 최대값으로 비교
        const hasOpenEnd = itCareer.some(c2 => !parseYMVal(c2.period_end));
        const effectiveEnd = hasOpenEnd
            ? (maxEnd.y * 12 + maxEnd.m >= nowYM.y * 12 + nowYM.m ? maxEnd : nowYM)
            : maxEnd;
        const totalMonths = Math.max(0, (effectiveEnd.y - minStart.y) * 12 + (effectiveEnd.m - minStart.m));
        const itYrs = Math.floor(totalMonths / 12);
        const itMos = totalMonths % 12;
        IT경력기간 = itYrs > 0 ? `${itYrs}년 ${itMos}개월` : `${itMos}개월`;
    }
    // ── [실적1]~[실적10] audit-match 로직 (inline) ──────────────
    const mappingMap = new Map();
    for (const km of kmRows)
        mappingMap.set(km.original_keyword, km.mapped_keyword);
    const memberDomain = member?.domain ?? '';
    const domainTokens = memberDomain
        .split(/[\s,()（）\/]+/)
        .map((s) => s.trim().replace(/\s+/g, ''))
        .filter((s) => s.length >= 2);
    // 중복 제거 후 매칭/정렬
    const seen = new Set();
    const rawRows = auditHistory
        .slice()
        .reverse() // DESC로 전환
        .filter(h => {
        const key = h.project_name.trim();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .map(h => {
        const combined = [h.project_name, h.domain ?? '', h.client_org ?? '']
            .join('').replace(/\s+/g, '');
        const matched = [];
        for (const kw of kwRows) {
            if (combined.includes(kw.keyword.replace(/\s+/g, '')))
                matched.push(kw.keyword);
        }
        const mapped = matched.map(kw => mappingMap.get(kw) ?? kw);
        const topOrder = matched.length > 0
            ? (kwRows.find(k => k.keyword === matched[0])?.sort_order ?? 9999)
            : 9999;
        let matchType = 'none';
        if (matched.length > 0) {
            matchType = 'keyword';
        }
        else if (domainTokens.length > 0) {
            const hd = (h.domain ?? '').replace(/\s+/g, '');
            if (hd.length > 0 && domainTokens.some((tok) => hd.includes(tok)))
                matchType = 'domain';
        }
        return { ...h, matched_keywords: matched, mapped_keywords: mapped,
            match_count: matched.length, match_type: matchType, top_sort_order: topOrder };
    });
    const groupOrder = { keyword: 0, domain: 1, none: 2 };
    rawRows.sort((a, b) => {
        const ga = groupOrder[a.match_type], gb = groupOrder[b.match_type];
        if (ga !== gb)
            return ga - gb;
        if (a.match_type === 'keyword' && a.top_sort_order !== b.top_sort_order)
            return a.top_sort_order - b.top_sort_order;
        return b.audit_yearmonth.localeCompare(a.audit_yearmonth);
    });
    // 상위 10건 → "[키워드] 기관명, 사업명" 형식
    const 실적 = rawRows.slice(0, 10).map(h => {
        const kwLabel = h.mapped_keywords.length > 0
            ? `[ ${h.mapped_keywords[0]} ] `
            : h.match_type === 'domain' ? `[ ${h.domain ?? ''} ] ` : '';
        const org = h.client_org ? `${h.client_org}, ` : '';
        return `${kwLabel}${org}${h.project_name}`;
    });
    // 분야: proposal_members.domain 우선, 없으면 이력 행 domain에서 최빈값 추출
    const memberDomainRaw = String(member?.domain ?? '').trim();
    let 분야 = memberDomainRaw;
    if (!분야) {
        // 실적 상위 10건의 domain 값에서 최빈값 fallback
        const domainFreq = {};
        rawRows.slice(0, 10).forEach(h => {
            const d = String(h.domain ?? '').trim();
            if (d)
                domainFreq[d] = (domainFreq[d] || 0) + 1;
        });
        const topDomain = Object.entries(domainFreq).sort((a, b) => b[1] - a[1])[0];
        if (topDomain)
            분야 = topDomain[0];
    }
    return c.json({
        ok: true,
        data: {
            이름: member?.person_name ?? person.name,
            분야,
            등급: member?.auditor_grade ?? '',
            자격구분,
            자격요약: person.career_qualif ?? '',
            IT경력: person.career_project ?? '',
            주요이력: person.career_expert ?? '',
            감리횟수: auditHistory.length,
            자격수: certs.length,
            감리경력,
            IT경력기간,
            실적,
        },
    });
});
/**
 * GET /api/personnel/:id/photo-image
 * NAS 증명사진 PNG를 base64(data URI)로 반환.
 * 파일명 패턴: 증명사진(이름).png
 * 사진이 없으면 { ok: false, error: 'not_found' } 반환 (404 아님 — 프론트 fallback용)
 */
app.get('/:id/photo-image', async (c) => {
    const personnelId = Number(c.req.param('id'));
    if (isNaN(personnelId) || personnelId <= 0)
        return c.json({ ok: false, error: 'invalid personnelId' }, 400);
    const person = await queryOne(`SELECT name FROM personnel WHERE id = $1`, [personnelId]);
    if (!person)
        return c.json({ ok: false, error: 'not_found' });
    const photoMap = await fetchPersonnelPhotos([person.name]);
    const buf = photoMap.get(person.name);
    if (!buf)
        return c.json({ ok: false, error: 'not_found' });
    // base64 data URI로 반환 (프론트에서 ArrayBuffer로 변환 후 PPTX media 교체)
    const b64 = buf.toString('base64');
    return c.json({ ok: true, name: person.name, dataUri: `data:image/png;base64,${b64}` });
});
/**
 * POST /api/personnel/fix-links
 * proposal_members.personnel_id 가 NULL인 행을 person_name 기준으로 일괄 업데이트
 */
app.post('/fix-links', async (c) => {
    // NULL인 건수 조회
    const nullRows = await query(`SELECT id, person_name FROM proposal_members WHERE personnel_id IS NULL`, []);
    let updated = 0;
    let skipped = 0;
    for (const row of nullRows) {
        const matched = await query(`SELECT id FROM personnel WHERE TRIM(name) = TRIM($1) LIMIT 1`, [row.person_name]);
        if (matched.length > 0) {
            await query(`UPDATE proposal_members SET personnel_id = $1 WHERE id = $2`, [matched[0].id, row.id]);
            updated++;
        }
        else {
            skipped++;
        }
    }
    return c.json({
        ok: true,
        total: nullRows.length,
        updated,
        skipped,
        message: `${updated}건 연결, ${skipped}건 미매칭(인력DB에 없음)`,
    });
});
export default app;
