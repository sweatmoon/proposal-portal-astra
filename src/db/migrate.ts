/**
 * DB 마이그레이션 실행기
 * 실행: npm run db:migrate
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

const { Pool } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, 'schema.sql')

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  console.log('🚀 DB 마이그레이션 시작...')
  const sql = readFileSync(schemaPath, 'utf-8')

  const client = await pool.connect()
  try {
    // SQL 전체를 한 번에 실행 (여러 구문 지원)
    await client.query(sql)
    console.log('✨ 마이그레이션 완료')
  } catch (err) {
    console.error('❌ 마이그레이션 실패:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
