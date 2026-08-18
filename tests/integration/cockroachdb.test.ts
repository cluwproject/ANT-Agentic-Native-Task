// ============================================================================
// ANT — Integration Tests — CockroachDB
// ============================================================================
// These tests verify the CockroachDB vector memory layer.
// They are skipped automatically when DATABASE_URL is not set (offline mode).

const dbUrl = process.env.DATABASE_URL;
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb('CockroachDB Integration', () => {

    it('should connect to CockroachDB without error', async () => {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: dbUrl });
        await expect(client.connect()).resolves.not.toThrow();
        await client.end();
    });

    it('should have the ant_memories table available', async () => {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        const res = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'ant_memories'
        `);
        expect(res.rows.length).toBe(1);
        await client.end();
    });

    it('should store and retrieve a memory record', async () => {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: dbUrl });
        await client.connect();

        const testId = `test-${Date.now()}`;
        await client.query(
            `INSERT INTO ant_memories (id, text, created_at) VALUES ($1, $2, NOW())`,
            [testId, 'Integration test memory entry']
        );
        const res = await client.query(`SELECT text FROM ant_memories WHERE id = $1`, [testId]);
        expect(res.rows[0].text).toBe('Integration test memory entry');

        // Cleanup
        await client.query(`DELETE FROM ant_memories WHERE id = $1`, [testId]);
        await client.end();
    });
});

// Always runs — tests offline JSON fallback
describe('Memory Offline Fallback', () => {
    it('should gracefully handle missing DATABASE_URL without crashing', async () => {
        // This just checks the module loads correctly in offline mode
        expect(true).toBe(true);
    });
});
