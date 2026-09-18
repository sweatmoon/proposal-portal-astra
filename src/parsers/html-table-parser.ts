/**
 * HTML 테이블 파서 유틸리티
 * rowspan / colspan 처리 포함
 */

export interface ParsedTable {
  rows: string[][]
}

/**
 * HTML 문자열에서 최상위 테이블들을 파싱하여 2차원 배열로 반환
 * - rowspan: 병합된 셀 값을 하위 행에 동일하게 채움
 * - colspan: 병합 폭만큼 동일 값으로 반복 채움
 * - nested table: 무시 (depth 추적)
 */
export function parseHtmlTables(html: string): ParsedTable[] {
  const tables: ParsedTable[] = []

  // HTML 엔티티 디코딩
  const decodeEntities = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

  // td/th 태그에서 rowspan, colspan 속성 추출
  const getSpan = (tag: string) => {
    const rsM = tag.match(/rowspan\s*=\s*["']?(\d+)["']?/i)
    const csM = tag.match(/colspan\s*=\s*["']?(\d+)["']?/i)
    return {
      rowspan: rsM ? parseInt(rsM[1]) : 1,
      colspan: csM ? parseInt(csM[1]) : 1,
    }
  }

  let depth = 0
  // rowspan 처리용: rowSpanMap[colIdx] = { remaining: N, value: string }
  let rowSpanMap: Record<number, { remaining: number; value: string }> = {}
  let curRows: string[][] = []
  let curRow: string[] | null = null
  let curCell: string | null = null
  let curCellTag = ''   // 현재 셀 오프닝 태그 전체 (rowspan/colspan 추출용)
  let inCell = false
  let colCursor = 0    // 현재 행에서 채운 컬럼 인덱스 (rowspan 삽입 위치 계산)

  // <태그> 추출용 정규식
  const tagRe = /<(\/?)(\w+)([^>]*?)(?:\s*\/)?>|([^<]+)/gi

  let match: RegExpExecArray | null
  while ((match = tagRe.exec(html)) !== null) {
    const [, closing, tagName, attrs, text] = match

    if (text !== undefined) {
      if (inCell && curCell !== null) {
        const t = decodeEntities(text).trim()
        if (t) curCell += (curCell ? ' ' : '') + t
      }
      continue
    }

    const tag = tagName.toLowerCase()
    const isClose = closing === '/'

    if (tag === 'table') {
      if (!isClose) {
        depth++
        if (depth === 1) {
          curRows = []
          rowSpanMap = {}
        }
      } else {
        if (depth === 1) {
          tables.push({ rows: curRows })
          curRows = []
          rowSpanMap = {}
        }
        depth--
      }

    } else if (tag === 'tr' && depth === 1) {
      if (!isClose) {
        curRow = []
        colCursor = 0
      } else {
        if (curRow) {
          // rowspan이 남아있는 컬럼에 값 삽입 (현재 행 끝에 남은 rowspan 처리)
          // → 아래 td 처리에서 이미 삽입되므로 여기서는 curRows에 push만
          curRows.push(curRow)
        }
        // rowspan remaining 감소
        for (const col of Object.keys(rowSpanMap).map(Number)) {
          rowSpanMap[col].remaining--
          if (rowSpanMap[col].remaining <= 0) delete rowSpanMap[col]
        }
        curRow = null
        colCursor = 0
      }

    } else if ((tag === 'td' || tag === 'th') && depth === 1) {
      if (!isClose) {
        // td/th 오픈 전에 rowspan 셀이 있으면 먼저 삽입
        if (curRow !== null) {
          while (rowSpanMap[colCursor]) {
            curRow.push(rowSpanMap[colCursor].value)
            colCursor++
          }
        }
        curCellTag = attrs ?? ''
        curCell = ''
        inCell = true
      } else {
        if (curRow !== null && curCell !== null) {
          const val = curCell.trim()
          const { rowspan, colspan } = getSpan(curCellTag)

          // colspan만큼 반복 삽입
          for (let ci = 0; ci < colspan; ci++) {
            const col = colCursor + ci
            curRow.push(val)
            // rowspan > 1이면 하위 행을 위해 기록
            if (rowspan > 1) {
              rowSpanMap[col] = { remaining: rowspan - 1, value: val }
            }
          }
          colCursor += colspan
        }
        curCell = null
        curCellTag = ''
        inCell = false
      }

    } else if ((tag === 'br' || tag === 'p') && inCell) {
      if (curCell !== null) curCell += '\n'
    }
  }

  return tables
}

/** 숫자만 추출 (쉼표, 원, MD 등 제거) */
export function extractNumber(s: string): number | null {
  const m = s.replace(/,/g, '').match(/[\d.]+/)
  return m ? parseFloat(m[0]) : null
}

/** "YYYY.MM.DD" or "YYYY/MM/DD" → "YYYY-MM-DD" 정규화 */
export function normalizeDate(s: string): string {
  return s.replace(/(\d{4})[./](\d{1,2})[./](\d{1,2})/, (_, y, m, d) =>
    `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
}
