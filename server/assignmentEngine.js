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

const { AssignmentStrategyFactory } = require("./assignmentStrategies");

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
         JOIN users u ON u.user_id = tp.technician_id

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
         AND u.role = 'TECHNICIAN'
         AND u.is_active = TRUE
         AND w.current_workload < tp.max_workload
         ORDER BY tp.technician_id ASC`,
        [skills]
    );

    return AssignmentStrategyFactory
        .create(strategy)
        .select(result.rows, incident);
}

// Rank eligible technicians using the incident's category and severity.
// This is a recommendation only; callers decide whether to assign the result.
async function recommendTechnicians(client, incident) {
    const requiredSkills = categorySkillMap[incident.category] || [];
    const result = await client.query(
        `SELECT
            tp.technician_id,
            u.username,
            tp.experience_years,
            tp.max_workload,
            w.current_workload,
            COALESCE(ts.skill_score, 0) AS skill_score,
            COALESCE(ts.matched_skills, ARRAY[]::text[]) AS matched_skills
         FROM technician_profiles tp
         JOIN users u ON u.user_id = tp.technician_id
         LEFT JOIN LATERAL (
             SELECT MAX(proficiency) AS skill_score,
                    ARRAY_AGG(skill_name ORDER BY proficiency DESC) AS matched_skills
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
         WHERE u.role = 'TECHNICIAN'
           AND u.is_active = TRUE
           AND tp.is_available = TRUE
           AND w.current_workload < tp.max_workload`,
        [requiredSkills]
    );

    const highPriority = ['P1', 'P2'].includes(incident.priority);
    const weights = highPriority
        ? { skills: 45, workload: 25, experience: 30 }
        : { skills: 55, workload: 30, experience: 15 };

    return result.rows.map(technician => {
        const skillScore = Number(technician.skill_score) || 0;
        const workload = Number(technician.current_workload) || 0;
        const maxWorkload = Number(technician.max_workload) || 1;
        const experience = Number(technician.experience_years) || 0;
        const skillFit = Math.min(skillScore, 5) / 5;
        const workloadFit = Math.max(0, 1 - workload / maxWorkload);
        const experienceFit = Math.min(experience, 10) / 10;
        const score = Math.round((
            skillFit * weights.skills +
            workloadFit * weights.workload +
            experienceFit * weights.experience
        ) * 10) / 10;

        const reasons = [];
        const matchedSkills = technician.matched_skills || [];
        if (matchedSkills.length) {
            reasons.push(`Skill match: ${matchedSkills.join(', ')} (proficiency ${skillScore}/5)`);
        } else {
            reasons.push(`No direct ${incident.category || 'category'} skill match`);
        }
        reasons.push(`Workload: ${workload}/${maxWorkload} active incidents`);
        reasons.push(`${experience} years of experience${highPriority ? ' (weighted for incident priority)' : ''}`);

        return {
            technician_id: Number(technician.technician_id),
            username: technician.username,
            score,
            skill_score: skillScore,
            current_workload: workload,
            max_workload: maxWorkload,
            experience_years: experience,
            matched_skills: matchedSkills,
            reasons
        };
    }).sort((a, b) => b.score - a.score || a.technician_id - b.technician_id);
}

module.exports = {
    getActiveStrategy,
    selectTechnician,
    recommendTechnicians
};
