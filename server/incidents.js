const express = require("express");
const pool = require("./db");
const { authenticate } = require("./middleware");

const router = express.Router();

const {
    getActiveStrategy,
    selectTechnician,
    recommendTechnicians
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

router.get("/:id/recommendations", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({ message: "Admin access required" });
        }

        const incidentId = Number(req.params.id);
        if (!Number.isInteger(incidentId) || incidentId <= 0) {
            return res.status(400).json({ message: "Invalid incident ID" });
        }

        const incidentResult = await pool.query(
            `SELECT incident_id, category, priority, impact, urgency, status
             FROM incidents
             WHERE incident_id = $1`,
            [incidentId]
        );
        if (incidentResult.rows.length === 0) {
            return res.status(404).json({ message: "Incident not found" });
        }

        const incident = incidentResult.rows[0];
        if (!incident.category || !incident.priority) {
            return res.status(400).json({
                message: "Classify the incident before requesting recommendations"
            });
        }

        const recommendations = await recommendTechnicians(pool, incident);
        res.json({ incident_id: incidentId, recommendations });
    } catch (err) {
        console.error("TECHNICIAN RECOMMENDATION ERROR:", err);
        res.status(500).json({ message: "Unable to recommend technicians" });
    }
});

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
                i.service_id,
                s.service_name AS affected_service,
                s.category AS service_category,
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
             LEFT JOIN services s
                ON i.service_id = s.service_id
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
                 updated_at = NOW(),
                 acknowledged_at = NOW(),
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
                resolved_at = NOW(),
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


// PATCH /incidents/:id/verify
router.patch("/:id/verify", authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const incidentId = req.params.id;
        const userId = req.user.user_id;
        const { verified, feedback } = req.body;

        if (typeof verified !== "boolean") {
            return res.status(400).json({
                message: "verified must be a boolean"
            });
        }

        await client.query("BEGIN");

        // Lock the incident while verification is being processed.
        const result = await client.query(
            `SELECT incident_id, reporter_id, status
             FROM incidents
             WHERE incident_id = $1
             FOR UPDATE`,
            [incidentId]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = result.rows[0];

        // Only the original reporter can verify the resolution.
        if (Number(incident.reporter_id) !== Number(userId)) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                message: "Only the original reporter can verify this incident"
            });
        }

        if (incident.status !== "RESOLVED") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Only resolved incidents can be verified"
            });
        }

        const newStatus = verified ? "VERIFIED" : "IN_PROGRESS";

        await client.query(
            `UPDATE incidents
     SET status = $1,
         resolved_at = CASE
             WHEN $1 = 'IN_PROGRESS' THEN NULL
             ELSE resolved_at
         END,
         updated_at = NOW()
     WHERE incident_id = $2`,
            [newStatus, incidentId]
        );

        const activityDescription = verified
            ? `Employee verified the resolution. ${feedback || ""}`.trim()
            : `Employee rejected the resolution and requested further investigation. ${feedback || ""}`.trim();

        await client.query(
            `INSERT INTO incident_activity
                (incident_id, user_id, activity_type, description)
             VALUES ($1, $2, 'STATUS_CHANGE', $3)`,
            [incidentId, userId, activityDescription]
        );

        await client.query("COMMIT");

        res.status(200).json({
            message: verified
                ? "Incident resolution verified"
                : "Incident returned to investigation",
            status: newStatus
        });

    } catch (err) {
        await client.query("ROLLBACK");

        console.error("INCIDENT VERIFICATION ERROR:", err);

        res.status(500).json({
            message: "Unable to verify incident"
        });

    } finally {
        client.release();
    }
});



router.get("/:id/activity", authenticate, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const incidentId = req.params.id;

        // Check whether the user is an admin
        const admin = await isAdmin(userId);

        // Retrieve the incident's assigned technician
        const incidentResult = await pool.query(
            `SELECT assigned_technician_id
             FROM incidents
             WHERE incident_id = $1`,
            [incidentId]
        );

        if (incidentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        // Check whether the user is the assigned technician
        const assignedTechnician =
            Number(incidentResult.rows[0].assigned_technician_id) ===
            Number(userId);

        // Only admins and assigned technicians can access activity
        if (!admin && !assignedTechnician) {
            return res.status(403).json({
                message: "Access denied"
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
            [incidentId]
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
                i.incident_id,
                i.title,
                i.description,
                i.service_id,
                s.service_name AS affected_service,
                s.category AS service_category,
                i.impact,
                i.urgency,
                i.priority,
                i.status,
                i.created_at
             FROM incidents i
             LEFT JOIN services s
                ON i.service_id = s.service_id
             WHERE i.reporter_id = $1
             ORDER BY i.created_at DESC`,
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

router.patch("/:id/close", authenticate, async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const incidentId = req.params.id;
        const userId = req.user.user_id;
        const { closure_notes } = req.body;

        // Only admins can close incidents
        if (!(await isAdmin(userId))) {
            return res.status(403).json({
                message: "Only admins can close incidents"
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        // Lock the incident to prevent concurrent closure
        const result = await client.query(
            `SELECT incident_id, status
             FROM incidents
             WHERE incident_id = $1
             FOR UPDATE`,
            [incidentId]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = result.rows[0];

        if (incident.status !== "VERIFIED") {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                message: "Only verified incidents can be closed"
            });
        }

        await client.query(
            `UPDATE incidents
             SET status = 'CLOSED',
                 closed_at = NOW(),
                 closure_notes = $1,
                 closed_by = $2,
                 updated_at = NOW()
             WHERE incident_id = $3`,
            [closure_notes || null, userId, incidentId]
        );

        await client.query(
            `INSERT INTO incident_activity
             (incident_id, user_id, activity_type, description)
             VALUES ($1, $2, 'STATUS_CHANGE', $3)`,
            [
                incidentId,
                userId,
                `Incident closed by admin. ${closure_notes || ""}`.trim()
            ]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(200).json({
            message: "Incident successfully closed",
            status: "CLOSED"
        });

    } catch (err) {
        if (transactionStarted) {
            await client.query("ROLLBACK");
        }

        console.error("Close incident error:", err);

        return res.status(500).json({
            message: "Failed to close incident"
        });
    } finally {
        client.release();
    }
});

router.post("/:id/respond", authenticate, async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const incidentId = req.params.id;
        const userId = req.user.user_id;
        const { response } = req.body;

        if (!response || typeof response !== "string" || !response.trim()) {
            return res.status(400).json({
                message: "Please provide a response"
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        const incidentResult = await client.query(
            `SELECT reporter_id, status
             FROM incidents
             WHERE incident_id = $1
             FOR UPDATE`,
            [incidentId]
        );

        if (incidentResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        // Only the employee who reported the incident can respond
        if (Number(incident.reporter_id) !== Number(userId)) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(403).json({
                message: "Only the incident reporter can respond"
            });
        }

        if (incident.status !== "WAITING_FOR_USER") {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                message: "This incident is not awaiting an employee response"
            });
        }

        await client.query(
            `INSERT INTO incident_activity
             (incident_id, user_id, activity_type, description)
             VALUES ($1, $2, 'USER_RESPONSE', $3)`,
            [incidentId, userId, response.trim()]
        );

        await client.query(
            `UPDATE incidents
             SET status = 'IN_PROGRESS',
                 updated_at = NOW()
             WHERE incident_id = $1`,
            [incidentId]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(200).json({
            message: "Response submitted successfully",
            status: "IN_PROGRESS"
        });

    } catch (err) {
        if (transactionStarted) {
            await client.query("ROLLBACK");
        }

        console.error("EMPLOYEE RESPONSE ERROR:", err);

        return res.status(500).json({
            message: "Unable to submit response"
        });

    } finally {
        client.release();
    }
});


router.get("/admin/incidents", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(`
            SELECT
                i.incident_id,
                i.title,
                i.category,
                i.service_id,
                s.service_name AS affected_service,
                s.category AS service_category,
                i.priority,
                i.status,
                i.created_at,
                i.updated_at,
                reporter.username AS reporter_name,
                technician.username AS technician_name
            FROM incidents i
            LEFT JOIN users reporter
                ON i.reporter_id = reporter.user_id
            LEFT JOIN users technician
                ON i.assigned_technician_id = technician.user_id
            LEFT JOIN services s
                ON i.service_id = s.service_id
            ORDER BY
                CASE i.priority
                    WHEN 'P1' THEN 1
                    WHEN 'P2' THEN 2
                    WHEN 'P3' THEN 3
                    WHEN 'P4' THEN 4
                    ELSE 5
                END,
                i.created_at DESC
        `);

        res.status(200).json({
            incidents: result.rows
        });

    } catch (err) {
        console.error("Admin incidents error:", err);
        res.status(500).json({
            message: "Unable to fetch incidents"
        });
    }
});


router.get("/admin/sla", authenticate, async (req, res) => {
    try {
        const userId = req.user.user_id;

        if (!(await isAdmin(userId))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(`
            SELECT
                i.incident_id,
                i.title,
                i.priority,
                i.status,
                i.created_at,
                i.response_due_at,
                i.resolution_due_at,
                i.acknowledged_at,
                i.resolved_at,
                s.response_time_minutes,
                s.resolution_time_minutes,
                reporter.username AS reporter_name,
                technician.username AS technician_name
            FROM incidents i
            LEFT JOIN sla_config s
                ON i.sla_id = s.sla_id
            LEFT JOIN users reporter
                ON i.reporter_id = reporter.user_id
            LEFT JOIN users technician
                ON i.assigned_technician_id = technician.user_id
            ORDER BY
                CASE i.priority
                    WHEN 'P1' THEN 1
                    WHEN 'P2' THEN 2
                    WHEN 'P3' THEN 3
                    WHEN 'P4' THEN 4
                    ELSE 5
                END,
                i.created_at DESC
        `);

        const now = Date.now();

        function calculateSLA(dueAt, completedAt, durationMinutes) {
            if (!dueAt || !durationMinutes) {
                return "NOT_CONFIGURED";
            }

            const deadline = new Date(dueAt).getTime();
            const completed = completedAt
                ? new Date(completedAt).getTime()
                : null;

            if (completed !== null) {
                return completed <= deadline ? "MET" : "BREACHED";
            }

            const remaining = deadline - now;

            if (remaining < 0) {
                return "BREACHED";
            }

            const riskWindow = Number(durationMinutes) * 60 * 1000 * 0.25;

            return remaining <= riskWindow ? "AT_RISK" : "ON_TRACK";
        }

        const incidents = result.rows.map(incident => {
            const responseStatus = calculateSLA(
                incident.response_due_at,
                incident.acknowledged_at,
                incident.response_time_minutes
            );

            // A rejected resolution has resolved_at cleared.
            // Terminal incidents should retain their final resolution time.
            const resolutionStatus = calculateSLA(
                incident.resolution_due_at,
                incident.resolved_at,
                incident.resolution_time_minutes
            );

            return {
                ...incident,
                response_sla_status: responseStatus,
                resolution_sla_status: resolutionStatus
            };
        });

        const summary = {
            total: incidents.length,
            response_breached: incidents.filter(
                i => i.response_sla_status === "BREACHED"
            ).length,
            resolution_breached: incidents.filter(
                i => i.resolution_sla_status === "BREACHED"
            ).length,
            at_risk: incidents.filter(
                i =>
                    i.response_sla_status === "AT_RISK" ||
                    i.resolution_sla_status === "AT_RISK"
            ).length,
            fully_compliant: incidents.filter(
                i =>
                    i.response_sla_status === "MET" &&
                    i.resolution_sla_status === "MET"
            ).length
        };

        return res.status(200).json({
            summary,
            incidents
        });

    } catch (err) {
        console.error("SLA MONITORING ERROR:", err);

        return res.status(500).json({
            message: "Unable to retrieve SLA monitoring data"
        });
    }
});

router.get("/admin/sla-config", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(`
            SELECT
                sla_id,
                priority,
                response_time_minutes,
                resolution_time_minutes,
                is_active
            FROM sla_config
            ORDER BY
                CASE priority
                    WHEN 'P1' THEN 1
                    WHEN 'P2' THEN 2
                    WHEN 'P3' THEN 3
                    WHEN 'P4' THEN 4
                END
        `);

        res.status(200).json({
            configurations: result.rows
        });

    } catch (err) {
        console.error("SLA CONFIG ERROR:", err);
        res.status(500).json({
            message: "Unable to retrieve SLA configurations"
        });
    }
});

router.put("/admin/sla-config/:id", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const { response_time_minutes, resolution_time_minutes } = req.body;

        if (
            !Number.isInteger(response_time_minutes) ||
            !Number.isInteger(resolution_time_minutes) ||
            response_time_minutes <= 0 ||
            resolution_time_minutes <= 0
        ) {
            return res.status(400).json({
                message: "SLA durations must be positive integers"
            });
        }

        const result = await pool.query(
            `UPDATE sla_config
             SET response_time_minutes = $1,
                 resolution_time_minutes = $2,
                 updated_at = NOW()
             WHERE sla_id = $3
             RETURNING *`,
            [
                response_time_minutes,
                resolution_time_minutes,
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "SLA configuration not found"
            });
        }

        res.status(200).json({
            message: "SLA configuration updated",
            configuration: result.rows[0]
        });

    } catch (err) {
        console.error("SLA UPDATE ERROR:", err);
        res.status(500).json({
            message: "Unable to update SLA configuration"
        });
    }
});
router.get("/admin/sla-events", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(`
            SELECT
                e.event_id,
                e.incident_id,
                e.event_type,
                e.detected_at,
                i.title,
                i.priority,
                i.status,
                reporter.username AS reporter_name,
                technician.username AS technician_name
            FROM sla_events e
            JOIN incidents i
                ON e.incident_id = i.incident_id
            LEFT JOIN users reporter
                ON i.reporter_id = reporter.user_id
            LEFT JOIN users technician
                ON i.assigned_technician_id = technician.user_id
            ORDER BY e.detected_at DESC
        `);

        res.status(200).json({
            events: result.rows
        });

    } catch (err) {
        console.error("SLA EVENTS ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve SLA events"
        });
    }
});

router.get("/notifications", authenticate, async (req, res) => {
    try {
        const userId = req.user.user_id;

        const result = await pool.query(`
            SELECT
                n.notification_id,
                n.incident_id,
                n.event_id,
                n.title,
                n.message,
                n.is_read,
                n.created_at
            FROM notifications n
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC
            LIMIT 50
        `, [userId]);

        res.status(200).json({
            notifications: result.rows
        });

    } catch (err) {
        console.error("FETCH NOTIFICATIONS ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve notifications"
        });
    }
});
router.patch("/notifications/:id/read", authenticate, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const notificationId = req.params.id;

        const result = await pool.query(`
            UPDATE notifications
            SET is_read = TRUE
            WHERE notification_id = $1
              AND user_id = $2
            RETURNING *
        `, [notificationId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Notification not found"
            });
        }

        res.status(200).json({
            message: "Notification marked as read"
        });

    } catch (err) {
        console.error("MARK NOTIFICATION ERROR:", err);

        res.status(500).json({
            message: "Unable to update notification"
        });
    }
});


router.patch("/admin/technicians/:id/profile", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const technicianId = Number(req.params.id);
        const {
            experience_years,
            is_available,
            max_workload
        } = req.body;

        if (!Number.isInteger(technicianId) || technicianId <= 0) {
            return res.status(400).json({
                message: "Invalid technician ID"
            });
        }

        if (
            !Number.isInteger(experience_years) ||
            experience_years < 0 ||
            typeof is_available !== "boolean" ||
            !Number.isInteger(max_workload) ||
            max_workload < 1
        ) {
            return res.status(400).json({
                message: "Invalid technician profile details"
            });
        }

        const result = await pool.query(
            `UPDATE technician_profiles tp
             SET experience_years = $1,
                 is_available = $2,
                 max_workload = $3
             FROM users u
             WHERE tp.technician_id = $4
               AND u.user_id = tp.technician_id
               AND u.role = 'TECHNICIAN'
             RETURNING tp.*`,
            [
                experience_years,
                is_available,
                max_workload,
                technicianId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Technician profile not found"
            });
        }

        res.status(200).json({
            message: "Technician profile updated",
            technician: result.rows[0]
        });

    } catch (err) {
        console.error("UPDATE TECHNICIAN PROFILE ERROR:", err);

        res.status(500).json({
            message: "Unable to update technician profile"
        });
    }
});
router.post("/admin/technicians/:id/skills", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const technicianId = Number(req.params.id);
        const { skill_name, proficiency = 1 } = req.body;

        if (
            !Number.isInteger(technicianId) ||
            technicianId <= 0 ||
            typeof skill_name !== "string" ||
            !skill_name.trim() ||
            skill_name.trim().length > 100 ||
            !Number.isInteger(proficiency) ||
            proficiency < 1 ||
            proficiency > 5
        ) {
            return res.status(400).json({
                message: "Invalid skill details"
            });
        }

        const technician = await pool.query(
            `SELECT tp.technician_id
             FROM technician_profiles tp
             JOIN users u ON u.user_id = tp.technician_id
             WHERE tp.technician_id = $1
               AND u.role = 'TECHNICIAN'`,
            [technicianId]
        );

        if (technician.rows.length === 0) {
            return res.status(404).json({
                message: "Technician profile not found"
            });
        }

        const duplicate = await pool.query(
            `SELECT skill_id
             FROM technician_skills
             WHERE technician_id = $1
               AND LOWER(skill_name) = LOWER($2)`,
            [technicianId, skill_name.trim()]
        );

        if (duplicate.rows.length > 0) {
            return res.status(409).json({
                message: "Technician already has this skill"
            });
        }

        const result = await pool.query(
            `INSERT INTO technician_skills
                (technician_id, skill_name, proficiency)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [technicianId, skill_name.trim(), proficiency]
        );

        res.status(201).json({
            message: "Skill added successfully",
            skill: result.rows[0]
        });

    } catch (err) {
        console.error("ADD TECHNICIAN SKILL ERROR:", err);

        res.status(500).json({
            message: "Unable to add technician skill"
        });
    }
});
router.patch(
    "/admin/technicians/:id/skills/:skillId",
    authenticate,
    async (req, res) => {
        try {
            if (!(await isAdmin(req.user.user_id))) {
                return res.status(403).json({
                    message: "Admin access required"
                });
            }

            const technicianId = Number(req.params.id);
            const skillId = Number(req.params.skillId);
            const { proficiency } = req.body;

            if (
                !Number.isInteger(technicianId) ||
                !Number.isInteger(skillId) ||
                !Number.isInteger(proficiency) ||
                proficiency < 1 ||
                proficiency > 5
            ) {
                return res.status(400).json({
                    message: "Invalid skill details"
                });
            }

            const result = await pool.query(
                `UPDATE technician_skills
                 SET proficiency = $1
                 WHERE skill_id = $2
                   AND technician_id = $3
                 RETURNING *`,
                [proficiency, skillId, technicianId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Skill not found"
                });
            }

            res.json({
                message: "Skill proficiency updated",
                skill: result.rows[0]
            });

        } catch (err) {
            console.error("UPDATE SKILL ERROR:", err);

            res.status(500).json({
                message: "Unable to update skill"
            });
        }
    }
);
router.delete(
    "/admin/technicians/:id/skills/:skillId",
    authenticate,
    async (req, res) => {
        try {
            if (!(await isAdmin(req.user.user_id))) {
                return res.status(403).json({
                    message: "Admin access required"
                });
            }

            const technicianId = Number(req.params.id);
            const skillId = Number(req.params.skillId);

            if (
                !Number.isInteger(technicianId) ||
                !Number.isInteger(skillId)
            ) {
                return res.status(400).json({
                    message: "Invalid IDs"
                });
            }

            const result = await pool.query(
                `DELETE FROM technician_skills
                 WHERE skill_id = $1
                   AND technician_id = $2
                 RETURNING skill_id`,
                [skillId, technicianId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Skill not found"
                });
            }

            res.json({
                message: "Skill removed successfully"
            });

        } catch (err) {
            console.error("DELETE SKILL ERROR:", err);

            res.status(500).json({
                message: "Unable to remove skill"
            });
        }
    }
);
router.get("/admin/services", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const result = await pool.query(`
            SELECT
                service_id,
                service_name,
                description,
                category,
                is_active,
                created_at,
                updated_at
            FROM services
            ORDER BY service_name ASC
        `);

        res.status(200).json({
            services: result.rows
        });

    } catch (err) {
        console.error("FETCH SERVICES ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve services"
        });
    }
});

router.get("/services", authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT service_id, service_name, description, category
            FROM services
            WHERE is_active = TRUE
            ORDER BY service_name ASC
        `);

        res.status(200).json({
            services: result.rows
        });

    } catch (err) {
        console.error("FETCH ACTIVE SERVICES ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve services"
        });
    }
});
router.post("/admin/services", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const { service_name, description, category } = req.body;

        if (
            typeof service_name !== "string" ||
            !service_name.trim() ||
            service_name.trim().length > 100
        ) {
            return res.status(400).json({
                message: "Valid service name is required"
            });
        }

        const result = await pool.query(
            `INSERT INTO services
                (service_name, description, category)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [
                service_name.trim(),
                description?.trim() || null,
                category?.trim() || null
            ]
        );

        res.status(201).json({
            message: "Service created successfully",
            service: result.rows[0]
        });

    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({
                message: "A service with this name already exists"
            });
        }

        console.error("CREATE SERVICE ERROR:", err);

        res.status(500).json({
            message: "Unable to create service"
        });
    }
});
router.patch("/admin/services/:id", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const serviceId = Number(req.params.id);

        if (!Number.isInteger(serviceId) || serviceId <= 0) {
            return res.status(400).json({
                message: "Invalid service ID"
            });
        }

        const { service_name, description, category } = req.body;

        if (
            typeof service_name !== "string" ||
            !service_name.trim() ||
            service_name.trim().length > 100
        ) {
            return res.status(400).json({
                message: "Valid service name is required"
            });
        }

        const result = await pool.query(
            `UPDATE services
             SET service_name = $1,
                 description = $2,
                 category = $3,
                 updated_at = NOW()
             WHERE service_id = $4
             RETURNING *`,
            [
                service_name.trim(),
                description?.trim() || null,
                category?.trim() || null,
                serviceId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Service not found"
            });
        }

        res.json({
            message: "Service updated successfully",
            service: result.rows[0]
        });

    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({
                message: "A service with this name already exists"
            });
        }

        console.error("UPDATE SERVICE ERROR:", err);

        res.status(500).json({
            message: "Unable to update service"
        });
    }
});
router.patch("/admin/services/:id/status", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const serviceId = Number(req.params.id);
        const { is_active } = req.body;

        if (!Number.isInteger(serviceId) || serviceId <= 0) {
            return res.status(400).json({
                message: "Invalid service ID"
            });
        }

        if (typeof is_active !== "boolean") {
            return res.status(400).json({
                message: "is_active must be a boolean"
            });
        }

        const result = await pool.query(
            `UPDATE services
             SET is_active = $1,
                 updated_at = NOW()
             WHERE service_id = $2
             RETURNING *`,
            [is_active, serviceId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Service not found"
            });
        }

        res.json({
            message: is_active
                ? "Service activated successfully"
                : "Service deactivated successfully",
            service: result.rows[0]
        });

    } catch (err) {
        console.error("UPDATE SERVICE STATUS ERROR:", err);

        res.status(500).json({
            message: "Unable to update service status"
        });
    }
});


router.get("/admin/reports/overview", authenticate, async (req, res) => {
    try {
        if (!(await isAdmin(req.user.user_id))) {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        const summaryResult = await pool.query(`
            SELECT
                COUNT(*) AS total_incidents,

                COUNT(*) FILTER (
                    WHERE status NOT IN ('RESOLVED', 'VERIFIED', 'CLOSED')
                ) AS active_incidents,

                COUNT(*) FILTER (
                    WHERE status IN ('RESOLVED', 'VERIFIED', 'CLOSED')
                ) AS resolved_incidents,

                ROUND(
                    AVG(
                        EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
                    ) FILTER (WHERE resolved_at IS NOT NULL)::numeric,
                    2
                ) AS avg_resolution_hours

            FROM incidents
        `);

        const statusResult = await pool.query(`
            SELECT
                status,
                COUNT(*) AS count
            FROM incidents
            GROUP BY status
            ORDER BY count DESC
        `);

        const priorityResult = await pool.query(`
            SELECT
                priority,
                COUNT(*) AS count
            FROM incidents
            GROUP BY priority
            ORDER BY
                CASE priority
                    WHEN 'P1' THEN 1
                    WHEN 'P2' THEN 2
                    WHEN 'P3' THEN 3
                    WHEN 'P4' THEN 4
                    ELSE 5
                END
        `);

        res.status(200).json({
            summary: summaryResult.rows[0],
            byStatus: statusResult.rows,
            byPriority: priorityResult.rows
        });

    } catch (err) {
        console.error("ADMIN REPORTS ERROR:", err);

        res.status(500).json({
            message: "Unable to generate reports"
        });
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
                i.service_id,
                s.service_name AS affected_service,
                s.category AS service_category,
                i.impact,
                i.urgency,
                i.priority,
                i.status,
                i.assigned_technician_id,
                i.created_at,
                i.updated_at,
                i.resolution_details,
                i.resolved_at,
                i.response_due_at,
                i.resolution_due_at,
                u.username AS technician_name
             FROM incidents i
             LEFT JOIN users u
                ON i.assigned_technician_id = u.user_id
             LEFT JOIN services s
                ON i.service_id = s.service_id
             WHERE i.incident_id = $1`,
            [incidentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = result.rows[0];

        const isReporter = Number(incident.reporter_id) === Number(userId);
        const isAssignedTechnician =
            Number(incident.assigned_technician_id) === Number(userId);
        const admin = await isAdmin(userId);

        if (!isReporter && !isAssignedTechnician && !admin) {
            return res.status(403).json({
                message: "You are not authorized to view this incident"
            });
        }

        res.status(200).json({
            incident
        });

    } catch (err) {
        console.error("TRACK INCIDENT ERROR:", err);

        res.status(500).json({
            message: "Unable to retrieve incident"
        });
    }
});


router.post("/", authenticate, async (req, res) => {
    try {
        const {
            title,
            description,
            service_id,
            impact,
            urgency
        } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim() ||
            title.length > 200 ||
            typeof description !== "string" ||
            !description.trim() ||
            !service_id ||
            !Number.isInteger(Number(service_id)) ||
            Number(service_id) <= 0 ||
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

        // Validate selected service
        const serviceResult = await pool.query(
            `SELECT service_id, service_name
             FROM services
             WHERE service_id = $1
             AND is_active = TRUE`,
            [service_id]
        );

        if (serviceResult.rows.length === 0) {
            return res.status(400).json({
                message: "Invalid or inactive service"
            });
        }

        const serviceName = serviceResult.rows[0].service_name;

        const result = await pool.query(
            `INSERT INTO incidents
                (reporter_id, title, description,
                 service_id, affected_service, impact, urgency)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                reporterId,
                title.trim(),
                description.trim(),
                service_id,
                serviceName,
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

module.exports = router;
