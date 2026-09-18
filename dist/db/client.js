/**
 * PostgreSQL 연결 풀
 * 환경변수: DATABASE_URL (Railway 자동 주입)
 * ex) postgresql://user:pass@host:5432/dbname
 */
import pg from 'pg';
const { Pool } = pg;
// Railway는 DATABASE_URL을 자동으로 주입
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false } // Railway SSL
        : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
});
/** 쿼리 헬퍼: 파라미터 바인딩 ($1, $2, ...) */
export async function query(sql, params) {
    const client = await pool.connect();
    try {
        const res = await client.query(sql, params);
        return res.rows;
    }
    finally {
        client.release();
    }
}
/** 단일 행 반환 */
export async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
}
/** INSERT/UPDATE/DELETE 실행 후 메타 반환 */
export async function execute(sql, params) {
    const client = await pool.connect();
    try {
        const res = await client.query(sql, params);
        return { rowCount: res.rowCount ?? 0, rows: res.rows };
    }
    finally {
        client.release();
    }
}
/** 트랜잭션 헬퍼 */
export async function transaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
export default pool;
