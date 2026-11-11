const categorySkillMap = {
    HARDWARE: ["HARDWARE"],
    SOFTWARE: ["SOFTWARE", "APPLICATION"],
    NETWORK: ["NETWORK"],
    DATABASE: ["DATABASE"],
    CLOUD: ["CLOUD"],
    SECURITY: ["SECURITY"],
    AUTHENTICATION: ["AUTHENTICATION", "SECURITY"],
    APPLICATION: ["APPLICATION", "SOFTWARE"],
    STORAGE: ["STORAGE", "DATABASE"]
};

async function getActiveStrategy(client) {
    const result = await client.query(
        `SELECT strategy
         FROM assignment_config
         WHERE is_active = TRUE
         LIMIT 1`
    );

    if (result.rows.length === 0) {
        throw new Error("No active assignment strategy configured");
    }

    return result.rows[0].strategy;
}

async function selectTechnician(client, incident, strategy) {
    const skills = categorySkillMap[incident.category] || [];

    const result = await client.query(
        `SELECT
            tp.technician_id,
            tp.experience_years,
            tp.max_workload,
            COALESCE(ts.skill_score, 0) AS skill_score,
            w.current_workload

         FROM technician_profiles tp

         LEFT JOIN LATERAL (
             SELECT MAX(proficiency) AS skill_score
             FROM technician_skills
             WHERE technician_id = tp.technician_id
             AND UPPER(skill_name) = ANY($1::text[])
         ) ts ON TRUE

         LEFT JOIN LATERAL (
             SELECT COUNT(*) AS current_workload
             FROM incidents
             WHERE assigned_technician_id = tp.technician_id
             AND status NOT IN ('RESOLVED', 'VERIFIED', 'CLOSED')
         ) w ON TRUE

         WHERE tp.is_available = TRUE
         AND w.current_workload < tp.max_workload

         ORDER BY
            CASE
                WHEN $2 = 'SKILL_BASED'
                THEN COALESCE(ts.skill_score, 0)
            END DESC,

            CASE
                WHEN $2 = 'PRIORITY_BASED' AND $3 = 'P1'
                THEN tp.experience_years
            END DESC,

            w.current_workload ASC,
            tp.experience_years DESC,
            tp.technician_id ASC`,
        [skills, strategy, incident.priority]
    );

    if (strategy === "SKILL_BASED") {
        return result.rows.find(
            technician => Number(technician.skill_score) > 0
        ) || null;
    }

    return result.rows[0] || null;
}

module.exports = {
    getActiveStrategy,
    selectTechnician
};