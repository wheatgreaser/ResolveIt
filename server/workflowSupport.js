const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'for', 'from', 'in', 'is',
    'it', 'of', 'on', 'or', 'the', 'to', 'was', 'were', 'with', 'issue',
    'problem', 'unable', 'cannot'
]);

async function ensureWorkflowTables(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS workflow_notifications (
            notification_id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            incident_id INTEGER NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            dedupe_key TEXT UNIQUE,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS workflow_notifications_user_created_idx
        ON workflow_notifications (user_id, created_at DESC)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS incident_relationships (
            relationship_id SERIAL PRIMARY KEY,
            incident_id INTEGER NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            related_incident_id INTEGER NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            relationship_type TEXT NOT NULL CHECK (relationship_type IN ('RELATED', 'POSSIBLE_DUPLICATE')),
            match_score NUMERIC(5, 4) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (incident_id < related_incident_id),
            UNIQUE (incident_id, related_incident_id)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS incident_escalations (
            escalation_id SERIAL PRIMARY KEY,
            incident_id INTEGER NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            related_incident_id INTEGER NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            match_score NUMERIC(5, 4) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (incident_id, related_incident_id)
        )
    `);
}

async function createWorkflowNotification(client, { userId, incidentId, title, message, dedupeKey }) {
    if (!userId) return;
    await client.query(`
        INSERT INTO workflow_notifications
            (user_id, incident_id, title, message, dedupe_key)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (dedupe_key) DO NOTHING
    `, [userId, incidentId, title, message, dedupeKey || null]);
}

function toTokens(value) {
    return new Set(String(value || '').toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter(token => token.length > 2 && !STOP_WORDS.has(token)) || []);
}

function textSimilarity(left, right) {
    const a = toTokens(left);
    const b = toTokens(right);
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    for (const token of a) if (b.has(token)) overlap++;
    return overlap / (a.size + b.size - overlap);
}

async function findRelatedIncidents(client, incident) {
    const result = await client.query(`
        SELECT incident_id, title, description, service_id, category, status
        FROM incidents
        WHERE incident_id <> $1
          AND status NOT IN ('CLOSED', 'VERIFIED')
        ORDER BY created_at DESC
        LIMIT 500
    `, [incident.incident_id]);

    return result.rows.map(previous => {
        const textScore = textSimilarity(
            `${incident.title} ${incident.description}`,
            `${previous.title} ${previous.description}`
        );
        const sameService = incident.service_id != null && previous.service_id != null &&
            Number(incident.service_id) === Number(previous.service_id);
        const sameCategory = Boolean(incident.category && previous.category === incident.category);
        const score = Math.min(1,
            textScore * 0.72 + (sameService ? 0.2 : 0) + (sameCategory ? 0.08 : 0)
        );
        return {
            incident_id: Number(previous.incident_id),
            title: previous.title,
            status: previous.status,
            same_service: sameService,
            score
        };
    })
        .filter(item => item.score >= 0.4)
        .sort((a, b) => b.score - a.score || a.incident_id - b.incident_id)
        .slice(0, 10);
}

module.exports = {
    ensureWorkflowTables,
    createWorkflowNotification,
    findRelatedIncidents
};
