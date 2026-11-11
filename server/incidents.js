const express = require("express");
const pool = require("./db");
const { authenticate } = require("./middleware");

const router = express.Router();

const {
    getActiveStrategy,
    selectTechnician
} = require("./assignmentEngine");

async function isTechnician(userId) {
    const result = await pool.query(
        `SELECT user_id
         FROM users
         WHERE user_id = $1
         AND role = 'TECHNICIAN'`,
        [userId]
    );

    return result.rows.length > 0;
}

async function isAdmin(userId) {
    const result = await pool.query(
        `SELECT 1
         FROM users
         WHERE user_id = $1
         AND role = 'ADMIN'
         AND is_active = TRUE`,
        [userId]
    );

    return result.rows.length > 0;
}

async function getAssignedIncident(client, incidentId, technicianId) {
    const result = await client.query(
        `SELECT *
         FROM incidents
         WHERE incident_id = $1
         AND assigned_technician_id = $2
         FOR UPDATE`,
        [incidentId, technicianId]
    );

    return result.rows[0] || null;
}

async function addActivity(
    client,
    incidentId,
    userId,
    activityType,
    description
) {
    await client.query(
        `INSERT INTO incident_activity
            (incident_id, user_id, activity_type, description)
         VALUES ($1, $2, $3, $4)`,
        [incidentId, userId, activityType, description]
    );
}

router.get("/assignment-config", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(
            `SELECT strategy, updated_at
             FROM assignment_config
             WHERE is_active = TRUE
             LIMIT 1`
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "No active assignment strategy"
            });
        }

        res.json({
            config: result.rows[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Unable to retrieve assignment configuration"
        });
    }
});

router.put("/assignment-config", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const { strategy } = req.body;

        const validStrategies = [
            "SKILL_BASED",
            "LOAD_BASED",
            "PRIORITY_BASED"
        ];

        if (!validStrategies.includes(strategy)) {
            return res.status(400).json({
                message: "Invalid assignment strategy"
            });
        }

        await client.query("BEGIN");

        await client.query(
            `UPDATE assignment_config
             SET is_active = FALSE,
                 updated_at = NOW()
             WHERE is_active = TRUE`
        );

        await client.query(
            `INSERT INTO assignment_config (strategy, is_active, updated_at)
             VALUES ($1, TRUE, NOW())`,
            [strategy]
        );

        await client.query("COMMIT");

        res.json({
            message: "Assignment strategy updated",
            strategy
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error(err);
        res.status(500).json({
            message: "Unable to update assignment strategy"
        });
    } finally {
        client.release();
    }
});

router.get("/admin/technicians", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(
            `SELECT
                u.user_id,
                u.username,
                u.email,
                tp.experience_years,
                tp.is_available,
                tp.max_workload,

                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'skill_name', ts.skill_name,
                                'proficiency', ts.proficiency
                            )
                        )
                        FROM technician_skills ts
                        WHERE ts.technician_id = tp.technician_id
                    ),
                    '[]'::json
                ) AS skills,

                (
                    SELECT COUNT(*)
                    FROM incidents i
                    WHERE i.assigned_technician_id = tp.technician_id
                    AND i.status NOT IN ('RESOLVED', 'VERIFIED', 'CLOSED')
                ) AS current_workload

             FROM technician_profiles tp
             JOIN users u ON u.user_id = tp.technician_id
             WHERE u.role = 'TECHNICIAN'
             ORDER BY u.username`
        );

        res.json({
            technicians: result.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Unable to retrieve technicians"
        });
    }
});

router.get("/admin/unassigned", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(
            `SELECT
                i.incident_id,
                i.title,
                i.category,
                i.impact,
                i.urgency,
                i.priority,
                i.status,
                i.created_at,
                u.username AS reporter_name

             FROM incidents i
             JOIN users u ON u.user_id = i.reporter_id

             WHERE i.assigned_technician_id IS NULL
             AND i.status = 'CLASSIFIED'

             ORDER BY
                CASE i.priority
                    WHEN 'P1' THEN 1
                    WHEN 'P2' THEN 2
                    WHEN 'P3' THEN 3
                    WHEN 'P4' THEN 4
                    ELSE 5
                END,
                i.created_at ASC`
        );

        res.json({
            incidents: result.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Unable to retrieve unassigned incidents"
        });
    }
});

// GET /incidents/admin/unclassified
router.get("/admin/unclassified", authenticate, async (req, res) => {
    try {
        const admin = await isAdmin(req.user.user_id);

        if (!admin) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(`
            SELECT
                i.incident_id,
                i.title,
                i.description,
                i.affected_service,
                i.impact,
                i.urgency,
                i.created_at,
                u.username AS reporter_name
            FROM incidents i
            JOIN users u ON i.reporter_id = u.user_id
            WHERE i.status = 'NEW'
            ORDER BY i.created_at ASC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching unclassified incidents:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
});

router.post("/:id/manual-assign", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const adminId = req.user.user_id;
        const incidentId = Number(req.params.id);
        const technicianId = Number(req.body.technician_id);

        if (!(await isAdmin(adminId))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        if (
            !Number.isInteger(incidentId) ||
            incidentId <= 0 ||
            !Number.isInteger(technicianId) ||
            technicianId <= 0
        ) {
            return res.status(400).json({
                message: "Invalid incident or technician ID"
            });
        }

        await client.query("BEGIN");

        const incidentResult = await client.query(
            `SELECT *
             FROM incidents
             WHERE incident_id = $1
             FOR UPDATE`,
            [incidentId]
        );

        if (incidentResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        if (!["CLASSIFIED", "ASSIGNED"].includes(incident.status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Only classified or assigned incidents can be assigned"
            });
        }

        if (!incident.priority || !incident.category) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Incident must be classified first"
            });
        }

        const technicianResult = await client.query(
            `SELECT tp.technician_id, tp.max_workload
             FROM technician_profiles tp
             JOIN users u ON u.user_id = tp.technician_id
             WHERE tp.technician_id = $1
             AND u.role = 'TECHNICIAN'
             AND u.is_active = TRUE
             AND tp.is_available = TRUE
             FOR UPDATE OF tp`,
            [technicianId]
        );

        if (technicianResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Technician does not exist or is unavailable"
            });
        }

        const workloadResult = await client.query(
            `SELECT COUNT(*) AS workload
             FROM incidents
             WHERE assigned_technician_id = $1
             AND status NOT IN ('RESOLVED', 'VERIFIED', 'CLOSED')
             AND incident_id <> $2`,
            [technicianId, incidentId]
        );

        const workload = Number(workloadResult.rows[0].workload);
        const maxWorkload = technicianResult.rows[0].max_workload;

        if (workload >= maxWorkload) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Technician has reached maximum workload"
            });
        }

        const oldTechnicianId = incident.assigned_technician_id;

        await client.query(
            `UPDATE incidents
             SET assigned_technician_id = $1,
                 status = 'ASSIGNED',
                 updated_at = NOW()
             WHERE incident_id = $2`,
            [technicianId, incidentId]
        );

        await client.query(
            `INSERT INTO incident_assignments
                (incident_id, technician_id, strategy_used, assigned_by)
             VALUES ($1, $2, 'MANUAL', $3)`,
            [incidentId, technicianId, adminId]
        );

        await client.query(
            `INSERT INTO incident_activity
                (incident_id, user_id, activity_type, description)
             VALUES ($1, $2, 'STATUS_CHANGE', $3)`,
            [
                incidentId,
                adminId,
                oldTechnicianId
                    ? `Incident reassigned from technician ${oldTechnicianId} to technician ${technicianId}`
                    : `Incident manually assigned to technician ${technicianId}`
            ]
        );

        await client.query("COMMIT");

        res.json({
            message: "Technician assigned successfully",
            incident_id: incidentId,
            technician_id: technicianId
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("MANUAL ASSIGNMENT ERROR:", err);
        res.status(500).json({
            message: "Unable to assign technician"
        });
    } finally {
        client.release();
    }
});

router.get("/assigned", authenticate, async (req, res) => {
    try {
        const technicianId = req.user.user_id;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        const result = await pool.query(
            `SELECT
                i.incident_id,
                i.title,
                i.description,
                i.affected_service,
                i.impact,
                i.urgency,
                i.priority,
                i.status,
                i.created_at,
                i.updated_at,
                u.username AS reporter_name
             FROM incidents i
             JOIN users u
                ON i.reporter_id = u.user_id
             WHERE i.assigned_technician_id = $1
             ORDER BY
                CASE i.priority
                    WHEN 'P1' THEN 1
                    WHEN 'P2' THEN 2
                    WHEN 'P3' THEN 3
                    WHEN 'P4' THEN 4
                    ELSE 5
                END,
                i.created_at ASC`,
            [technicianId]
        );

        res.status(200).json({
            incidents: result.rows
        });

    } catch (err) {
        console.error("ASSIGNED INCIDENTS ERROR:", err);
        res.status(500).json({
            message: "Unable to retrieve assigned incidents"
        });
    }
});

router.get("/technician-stats", authenticate, async (req, res) => {
    try {
        const technicianId = req.user.user_id;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        const result = await pool.query(
            `SELECT
                COUNT(*) AS total_assigned,

                COUNT(*) FILTER (
                    WHERE status IN ('NEW', 'CLASSIFIED', 'ASSIGNED')
                ) AS pending,

                COUNT(*) FILTER (
                    WHERE status IN ('ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_FOR_USER')
                ) AS in_progress,

                COUNT(*) FILTER (
                    WHERE status = 'RESOLVED'
                ) AS resolved,

                COUNT(*) FILTER (
                    WHERE status = 'CLOSED'
                ) AS closed

             FROM incidents
             WHERE assigned_technician_id = $1`,
            [technicianId]
        );

        res.status(200).json({
            stats: result.rows[0]
        });

    } catch (err) {
        console.error("TECHNICIAN STATS ERROR:", err);
        res.status(500).json({
            message: "Unable to retrieve workload statistics"
        });
    }
});

router.patch("/:id/acknowledge", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const technicianId = req.user.user_id;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        await client.query("BEGIN");

        const incident = await getAssignedIncident(
            client,
            req.params.id,
            technicianId
        );

        if (!incident) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Assigned incident not found"
            });
        }

        if (incident.status !== "ASSIGNED") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Incident cannot be acknowledged in its current status"
            });
        }

        await client.query(
            `UPDATE incidents
             SET status = 'ACKNOWLEDGED',
                 updated_at = NOW()
             WHERE incident_id = $1`,
            [req.params.id]
        );

        await addActivity(
            client,
            req.params.id,
            technicianId,
            "ACKNOWLEDGEMENT",
            "Technician acknowledged the incident"
        );

        await client.query("COMMIT");

        res.status(200).json({
            message: "Incident acknowledged successfully"
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("ACKNOWLEDGE ERROR:", err);
        res.status(500).json({
            message: "Unable to acknowledge incident"
        });
    } finally {
        client.release();
    }
});

router.post("/:id/notes", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const technicianId = req.user.user_id;
        const { description } = req.body;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        if (
            typeof description !== "string" ||
            !description.trim()
        ) {
            return res.status(400).json({
                message: "Note cannot be empty"
            });
        }

        await client.query("BEGIN");

        const incident = await getAssignedIncident(
            client,
            req.params.id,
            technicianId
        );

        if (!incident) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Assigned incident not found"
            });
        }

        if (!["ACKNOWLEDGED", "IN_PROGRESS"].includes(incident.status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Notes can only be added to acknowledged or in-progress incidents"
            });
        }

        await addActivity(
            client,
            req.params.id,
            technicianId,
            "NOTE",
            description.trim()
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "Investigation note added successfully"
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("ADD NOTE ERROR:", err);
        res.status(500).json({
            message: "Unable to add investigation note"
        });
    } finally {
        client.release();
    }
});

router.patch("/:id/status", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const technicianId = req.user.user_id;
        const { status } = req.body;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        if (status !== "IN_PROGRESS") {
            return res.status(400).json({
                message: "Invalid status transition"
            });
        }

        await client.query("BEGIN");

        const incident = await getAssignedIncident(
            client,
            req.params.id,
            technicianId
        );

        if (!incident) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Assigned incident not found"
            });
        }

        if (!["ACKNOWLEDGED", "WAITING_FOR_USER"].includes(incident.status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Incident cannot be moved to IN_PROGRESS from its current status"
            });
        }

        await client.query(
            `UPDATE incidents
             SET status = $1,
                 updated_at = NOW()
             WHERE incident_id = $2`,
            [status, req.params.id]
        );

        await addActivity(
            client,
            req.params.id,
            technicianId,
            "STATUS_CHANGE",
            `Status changed from ${incident.status} to ${status}`
        );

        await client.query("COMMIT");

        res.status(200).json({
            message: "Incident status updated successfully"
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("UPDATE STATUS ERROR:", err);
        res.status(500).json({
            message: "Unable to update incident status"
        });
    } finally {
        client.release();
    }
});

router.post("/:id/request-info", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const technicianId = req.user.user_id;
        const { description } = req.body;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        if (
            typeof description !== "string" ||
            !description.trim()
        ) {
            return res.status(400).json({
                message: "Please specify what information is required"
            });
        }

        await client.query("BEGIN");

        const incident = await getAssignedIncident(
            client,
            req.params.id,
            technicianId
        );

        if (!incident) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Assigned incident not found"
            });
        }

        if (!["ACKNOWLEDGED", "IN_PROGRESS"].includes(incident.status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Cannot request information in the current status"
            });
        }

        await client.query(
            `UPDATE incidents
             SET status = 'WAITING_FOR_USER',
                 updated_at = NOW()
             WHERE incident_id = $1`,
            [req.params.id]
        );

        await addActivity(
            client,
            req.params.id,
            technicianId,
            "INFO_REQUEST",
            description.trim()
        );

        await client.query("COMMIT");

        res.status(200).json({
            message: "Additional information requested successfully"
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("REQUEST INFO ERROR:", err);
        res.status(500).json({
            message: "Unable to request additional information"
        });
    } finally {
        client.release();
    }
});

router.patch("/:id/resolve", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const technicianId = req.user.user_id;
        const { description } = req.body;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        if (
            typeof description !== "string" ||
            !description.trim()
        ) {
            return res.status(400).json({
                message: "Resolution details are required"
            });
        }

        await client.query("BEGIN");

        const incident = await getAssignedIncident(
            client,
            req.params.id,
            technicianId
        );

        if (!incident) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Assigned incident not found"
            });
        }

        if (incident.status !== "IN_PROGRESS") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Only in-progress incidents can be resolved"
            });
        }

        await client.query(
            `UPDATE incidents
             SET status = 'RESOLVED',
                 updated_at = NOW()
             WHERE incident_id = $1`,
            [req.params.id]
        );

        await addActivity(
            client,
            req.params.id,
            technicianId,
            "RESOLUTION",
            description.trim()
        );

        await client.query("COMMIT");

        res.status(200).json({
            message: "Incident resolved successfully"
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("RESOLVE INCIDENT ERROR:", err);
        res.status(500).json({
            message: "Unable to resolve incident"
        });
    } finally {
        client.release();
    }
});

router.get("/:id/activity", authenticate, async (req, res) => {
    try {
        const technicianId = req.user.user_id;

        if (!(await isTechnician(technicianId))) {
            return res.status(403).json({
                message: "Technician access required"
            });
        }

        const incidentResult = await pool.query(
            `SELECT incident_id
             FROM incidents
             WHERE incident_id = $1
             AND assigned_technician_id = $2`,
            [req.params.id, technicianId]
        );

        if (incidentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Assigned incident not found"
            });
        }

        const result = await pool.query(
            `SELECT
                a.activity_id,
                a.activity_type,
                a.description,
                a.created_at,
                u.username
             FROM incident_activity a
             JOIN users u ON a.user_id = u.user_id
             WHERE a.incident_id = $1
             ORDER BY a.created_at ASC`,
            [req.params.id]
        );

        res.status(200).json({
            activities: result.rows
        });

    } catch (err) {
        console.error("ACTIVITY HISTORY ERROR:", err);
        res.status(500).json({
            message: "Unable to retrieve activity history"
        });
    }
});

router.post("/", authenticate, async (req, res) => {
    try {
        const {
            title,
            description,
            affected_service,
            impact,
            urgency
        } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim() ||
            title.length > 200 ||
            typeof description !== "string" ||
            !description.trim() ||
            typeof affected_service !== "string" ||
            !affected_service.trim() ||
            affected_service.length > 100 ||
            !["LOW", "MEDIUM", "HIGH"].includes(impact) ||
            !["LOW", "MEDIUM", "HIGH"].includes(urgency)
        ) {
            return res.status(400).json({
                message: "Invalid incident details"
            });
        }

        const reporterId = req.user.user_id;

        const userResult = await pool.query(
            `SELECT role FROM users WHERE user_id = $1`,
            [reporterId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                message: "User not found"
            });
        }

        if (userResult.rows[0].role !== "EMPLOYEE") {
            return res.status(403).json({
                message: "Only employees can report incidents"
            });
        }

        const result = await pool.query(
            `INSERT INTO incidents
                (reporter_id, title, description,
                 affected_service, impact, urgency)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                reporterId,
                title.trim(),
                description.trim(),
                affected_service.trim(),
                impact,
                urgency
            ]
        );

        return res.status(201).json({
            message: "Incident reported successfully",
            incident: result.rows[0]
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

router.patch("/:id/classify", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.user_id;
        const incidentId = Number(req.params.id);

        const { category, impact, urgency } = req.body;

        // Validate incident ID
        if (!Number.isInteger(incidentId) || incidentId <= 0) {
            return res.status(400).json({
                message: "Invalid incident ID"
            });
        }

        // Validate category
        const validCategories = [
            "HARDWARE",
            "SOFTWARE",
            "NETWORK",
            "DATABASE",
            "CLOUD",
            "SECURITY",
            "AUTHENTICATION",
            "APPLICATION",
            "STORAGE"
        ];

        if (!validCategories.includes(category)) {
            return res.status(400).json({
                message: "Invalid incident category"
            });
        }

        // Validate impact and urgency
        const validLevels = ["LOW", "MEDIUM", "HIGH"];

        if (
            !validLevels.includes(impact) ||
            !validLevels.includes(urgency)
        ) {
            return res.status(400).json({
                message: "Invalid impact or urgency"
            });
        }

        // Check admin authorization
        const userResult = await pool.query(
            `SELECT role
             FROM users
             WHERE user_id = $1`,
            [userId]
        );

        if (
            userResult.rows.length === 0 ||
            userResult.rows[0].role !== "ADMIN"
        ) {
            return res.status(403).json({
                message: "Only administrators can classify incidents"
            });
        }

        // Calculate priority
        const priorityMatrix = {
            HIGH: {
                HIGH: "P1",
                MEDIUM: "P2",
                LOW: "P3"
            },
            MEDIUM: {
                HIGH: "P2",
                MEDIUM: "P3",
                LOW: "P4"
            },
            LOW: {
                HIGH: "P3",
                MEDIUM: "P4",
                LOW: "P4"
            }
        };

        const priority = priorityMatrix[impact][urgency];

        await client.query("BEGIN");

        // Lock incident while classifying
        const incidentResult = await client.query(
            `SELECT *
             FROM incidents
             WHERE incident_id = $1
             FOR UPDATE`,
            [incidentId]
        );

        if (incidentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        if (
            !["NEW", "CLASSIFIED"].includes(incident.status) ||
            incident.assigned_technician_id !== null
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "This incident cannot be classified in its current state"
            });
        }

        const slaResult = await client.query(
            `SELECT
                sla_id,
                response_time_minutes,
                resolution_time_minutes
             FROM sla_config
             WHERE priority = $1
             AND is_active = TRUE`,
            [priority]
        );

        if (slaResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(500).json({
                message: `No active SLA configuration found for ${priority}`
            });
        }

        const sla = slaResult.rows[0];

        const updateResult = await client.query(
            `UPDATE incidents
             SET
                category = $1,
                impact = $2,
                urgency = $3,
                priority = $4,
                sla_id = $5,
                response_due_at =
                    NOW() + ($6 * INTERVAL '1 minute'),
                resolution_due_at =
                    NOW() + ($7 * INTERVAL '1 minute'),
                status = 'CLASSIFIED',
                updated_at = NOW()
             WHERE incident_id = $8
             RETURNING *`,
            [
                category,
                impact,
                urgency,
                priority,
                sla.sla_id,
                sla.response_time_minutes,
                sla.resolution_time_minutes,
                incidentId
            ]
        );

        await client.query(
            `INSERT INTO incident_activity
                (incident_id, user_id, activity_type, description)
             VALUES ($1, $2, $3, $4)`,
            [
                incidentId,
                userId,
                "STATUS_CHANGE",
                `Incident classified as ${category}. Impact: ${impact}, Urgency: ${urgency}, Priority: ${priority}.`
            ]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            message: "Incident classified successfully",
            incident: updateResult.rows[0]
        });

    } catch (err) {
        await client.query("ROLLBACK");

        console.error("CLASSIFICATION ERROR:", err);

        return res.status(500).json({
            message: "Unable to classify incident"
        });

    } finally {
        client.release();
    }
});

router.get("/my", authenticate, async (req, res) => {
    try {
        const reporterId = req.user.user_id;

        const result = await pool.query(
            `SELECT
                incident_id,
                title,
                description,
                affected_service,
                impact,
                urgency,
                priority,
                status,
                created_at
             FROM incidents
             WHERE reporter_id = $1
             ORDER BY created_at DESC`,
            [reporterId]
        );

        res.status(200).json({
            incidents: result.rows
        });

    } catch (err) {
        console.error("MY INCIDENTS ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve incidents"
        });
    }
});

router.post("/:id/assign", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const adminId = req.user.user_id;
        const incidentId = Number(req.params.id);

        if (!Number.isInteger(incidentId) || incidentId <= 0) {
            return res.status(400).json({
                message: "Invalid incident ID"
            });
        }

        const adminResult = await client.query(
            `SELECT role
             FROM users
             WHERE user_id = $1`,
            [adminId]
        );

        if (
            adminResult.rows.length === 0 ||
            adminResult.rows[0].role !== "ADMIN"
        ) {
            return res.status(403).json({
                message: "Only administrators can assign incidents"
            });
        }

        await client.query("BEGIN");

        const incidentResult = await client.query(
            `SELECT *
             FROM incidents
             WHERE incident_id = $1
             FOR UPDATE`,
            [incidentId]
        );

        if (incidentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        if (incident.status !== "CLASSIFIED") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Only classified incidents can be assigned"
            });
        }

        if (incident.assigned_technician_id !== null) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Incident is already assigned"
            });
        }

        if (!incident.category || !incident.priority) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Incident must have a category and priority before assignment"
            });
        }

        const strategy = await getActiveStrategy(client);

        const technician = await selectTechnician(
            client,
            incident,
            strategy
        );

        if (!technician) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "No eligible technician is available for this incident"
            });
        }
        await client.query(
            `UPDATE incidents
             SET assigned_technician_id = $1,
                 status = 'ASSIGNED',
                 updated_at = NOW()
             WHERE incident_id = $2`,
            [technician.technician_id, incidentId]
        );

        await client.query(
            `INSERT INTO incident_assignments
                (incident_id, technician_id, strategy_used, assigned_by)
             VALUES ($1, $2, $3, $4)`,
            [
                incidentId,
                technician.technician_id,
                strategy,
                adminId
            ]
        );

        await client.query(
            `INSERT INTO incident_activity
                (incident_id, user_id, activity_type, description)
             VALUES ($1, $2, $3, $4)`,
            [
                incidentId,
                adminId,
                "STATUS_CHANGE",
                `Incident assigned to technician ${technician.technician_id} using ${strategy} strategy`
            ]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            message: "Technician assigned successfully",
            assignment: {
                incident_id: incidentId,
                technician_id: technician.technician_id,
                strategy_used: strategy,
                current_workload: Number(technician.current_workload)
            }
        });

    } catch (err) {
        await client.query("ROLLBACK");

        console.error("TECHNICIAN ASSIGNMENT ERROR:", err);

        return res.status(500).json({
            message: "Unable to assign technician"
        });

    } finally {
        client.release();
    }
});

router.get("/:id", authenticate, async (req, res) => {
    try {
        const incidentId = req.params.id;
        const userId = req.user.user_id;

        const result = await pool.query(
            `SELECT
                i.incident_id,
                i.reporter_id,
                i.title,
                i.description,
                i.affected_service,
                i.impact,
                i.urgency,
                i.priority,
                i.status,
                i.assigned_technician_id,
                i.created_at,
                i.updated_at,
                u.username AS technician_name
             FROM incidents i
             LEFT JOIN users u
                ON i.assigned_technician_id = u.user_id
             WHERE i.incident_id = $1
             AND (
                i.reporter_id = $2
                OR i.assigned_technician_id = $2
                OR EXISTS (
                    SELECT 1
                    FROM users
                    WHERE user_id = $2
                    AND role = 'ADMIN'
                )
            )`,
            [incidentId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        res.status(200).json({
            incident: result.rows[0]
        });

    } catch (err) {
        console.error("TRACK INCIDENT ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve incident"
        });
    }
});
module.exports = router;
