async function runSlaChecks(pool) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const lockResult = await client.query(
            `SELECT pg_try_advisory_xact_lock(847291)`
        );

        if (!lockResult.rows[0].pg_try_advisory_xact_lock) {
            await client.query("ROLLBACK");
            return;
        }

        await client.query(`
            INSERT INTO sla_events (incident_id, event_type)
            SELECT
                incident_id,
                'RESPONSE_BREACHED'
            FROM incidents
            WHERE response_due_at IS NOT NULL
              AND (
                    (
                        acknowledged_at IS NULL
                        AND response_due_at < NOW()
                    )
                    OR acknowledged_at > response_due_at
              )
            ON CONFLICT (incident_id, event_type) DO NOTHING
        `);

        await client.query(`
            INSERT INTO sla_events (incident_id, event_type)
            SELECT
                i.incident_id,
                'RESPONSE_AT_RISK'
            FROM incidents i
            JOIN sla_config s ON i.sla_id = s.sla_id
            WHERE i.response_due_at > NOW()
              AND i.acknowledged_at IS NULL
              AND i.response_due_at - NOW()
                    <= s.response_time_minutes * INTERVAL '1 minute' * 0.25
            ON CONFLICT (incident_id, event_type) DO NOTHING
        `);

        await client.query(`
            INSERT INTO sla_events (incident_id, event_type)
            SELECT
                incident_id,
                'RESOLUTION_BREACHED'
            FROM incidents
            WHERE resolution_due_at IS NOT NULL
              AND (
                    (
                        resolved_at IS NULL
                        AND status NOT IN ('RESOLVED', 'VERIFIED', 'CLOSED')
                        AND resolution_due_at < NOW()
                    )
                    OR resolved_at > resolution_due_at
              )
            ON CONFLICT (incident_id, event_type) DO NOTHING
        `);

        await client.query(`
            INSERT INTO sla_events (incident_id, event_type)
            SELECT
                i.incident_id,
                'RESOLUTION_AT_RISK'
            FROM incidents i
            JOIN sla_config s ON i.sla_id = s.sla_id
            WHERE i.resolution_due_at > NOW()
              AND i.resolved_at IS NULL
              AND i.status NOT IN ('RESOLVED', 'VERIFIED', 'CLOSED')
              AND i.resolution_due_at - NOW()
                    <= s.resolution_time_minutes * INTERVAL '1 minute' * 0.25
            ON CONFLICT (incident_id, event_type) DO NOTHING
        `);


await client.query(`
    INSERT INTO notifications (
        user_id,
        incident_id,
        event_id,
        title,
        message
    )
    SELECT
        recipients.user_id,
        e.incident_id,
        e.event_id,

        CASE e.event_type
            WHEN 'RESPONSE_AT_RISK'
                THEN 'Response SLA approaching'
            WHEN 'RESOLUTION_AT_RISK'
                THEN 'Resolution SLA approaching'
            WHEN 'RESPONSE_BREACHED'
                THEN 'Response SLA breached'
            WHEN 'RESOLUTION_BREACHED'
                THEN 'Resolution SLA breached'
        END,

        CASE e.event_type
            WHEN 'RESPONSE_AT_RISK'
                THEN 'The response deadline for incident #' || e.incident_id || ' is approaching.'
            WHEN 'RESOLUTION_AT_RISK'
                THEN 'The resolution deadline for incident #' || e.incident_id || ' is approaching.'
            WHEN 'RESPONSE_BREACHED'
                THEN 'The response deadline for incident #' || e.incident_id || ' has been missed.'
            WHEN 'RESOLUTION_BREACHED'
                THEN 'The resolution deadline for incident #' || e.incident_id || ' has been missed.'
        END

    FROM sla_events e
    JOIN incidents i
        ON i.incident_id = e.incident_id

    CROSS JOIN LATERAL (
        -- Notify assigned technician
        SELECT i.assigned_technician_id AS user_id
        WHERE i.assigned_technician_id IS NOT NULL

        UNION

        -- Notify admins about breaches
        SELECT u.user_id
        FROM users u
        WHERE u.role = 'ADMIN'
          AND e.event_type IN (
              'RESPONSE_BREACHED',
              'RESOLUTION_BREACHED'
          )
    ) recipients

    ON CONFLICT (user_id, event_id) DO NOTHING
`);

        await client.query("COMMIT");

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("SLA MONITOR ERROR:", err);
    } finally {
        client.release();
    }
}

module.exports = { runSlaChecks };
