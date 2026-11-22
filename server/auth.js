const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const router = express.Router();


function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            message: 'Authentication required'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;
        next();

    } catch (err) {
        return res.status(401).json({
            message: 'Invalid or expired token'
        });
    }
}


router.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({
                message: 'Username, email and password are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters'
            });
        }

        const existing = await pool.query(
            `SELECT user_id FROM users
             WHERE username = $1 OR email = $2`,
            [username, email]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                message: 'Username or email already exists'
            });
        }

        const hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users
             (username, password_hash, role, email)
             VALUES ($1, $2, 'EMPLOYEE', $3)
             RETURNING user_id, username, email, role`,
            [username, hash, email]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { user_id: user.user_id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({
            message: 'Registration successful',
            token,
            user
        });

    } catch (err) {
        console.error(err);

        if (err.code === '23505') {
            return res.status(409).json({
                message: 'Username or email already exists'
            });
        }

        res.status(500).json({
            message: 'Internal server error'
        });
    }
});


router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: 'Username and password are required'
            });
        }

        const result = await pool.query(
            `SELECT user_id, username, email,
                    password_hash, role
             FROM users
             WHERE username = $1`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: 'Invalid username or password'
            });
        }

        const user = result.rows[0];

        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                message: 'Invalid username or password'
            });
        }

        const token = jwt.sign(
            {
                user_id: user.user_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                user_id: user.user_id,
                username: user.username,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: 'Internal server error'
        });
    }
});


router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT user_id, username, email, role
             FROM users
             WHERE user_id = $1`,
            [req.user.user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.json({
            user: result.rows[0]
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: 'Internal server error'
        });
    }
});

router.get('/admin/users', authenticate, async (req, res) => {
    try {
        const adminId = req.user.user_id;

        // Verify admin privileges
        const adminResult = await pool.query(
            `SELECT user_id
             FROM users
             WHERE user_id = $1
             AND role = 'ADMIN'
             AND is_active = TRUE`,
            [adminId]
        );

        if (adminResult.rows.length === 0) {
            return res.status(403).json({
                message: 'Admin access required'
            });
        }

        const { search, role, status } = req.query;

        const validRoles = ['EMPLOYEE', 'TECHNICIAN', 'ADMIN'];

        if (role && !validRoles.includes(role)) {
            return res.status(400).json({
                message: 'Invalid role filter'
            });
        }

        let isActive = null;

        if (status === 'active') {
            isActive = true;
        } else if (status === 'inactive') {
            isActive = false;
        } else if (status) {
            return res.status(400).json({
                message: 'Invalid status filter'
            });
        }

        const result = await pool.query(
            `SELECT
                user_id,
                username,
                email,
                full_name,
                role,
                is_active,
                created_at
             FROM users
             WHERE
                ($1::text IS NULL OR
                    username ILIKE '%' || $1 || '%' OR
                    email ILIKE '%' || $1 || '%' OR
                    full_name ILIKE '%' || $1 || '%')
                AND ($2::text IS NULL OR role::text = $2)
                AND ($3::boolean IS NULL OR is_active = $3)
             ORDER BY created_at DESC
             LIMIT 100`,
            [
                search?.trim() || null,
                role || null,
                isActive
            ]
        );

        res.status(200).json({
            users: result.rows
        });

    } catch (err) {
        console.error('FETCH USERS ERROR:', err);

        res.status(500).json({
            message: 'Unable to retrieve users'
        });
    }
});


router.post('/admin/users', authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const adminId = req.user.user_id;

        // Verify admin privileges
        const adminResult = await client.query(
            `SELECT user_id
             FROM users
             WHERE user_id = $1
             AND role = 'ADMIN'
             AND is_active = TRUE`,
            [adminId]
        );

        if (adminResult.rows.length === 0) {
            return res.status(403).json({
                message: 'Admin access required'
            });
        }

        const {
            username,
            email,
            password,
            full_name,
            role
        } = req.body;

        // Validate fields
        if (
            typeof username !== 'string' ||
            !username.trim() ||
            typeof email !== 'string' ||
            !email.trim() ||
            typeof password !== 'string' ||
            password.length < 8 ||
            !['EMPLOYEE', 'TECHNICIAN', 'ADMIN'].includes(role)
        ) {
            return res.status(400).json({
                message: 'Invalid user details'
            });
        }

        await client.query('BEGIN');

        const hash = await bcrypt.hash(password, 12);

        const userResult = await client.query(
            `INSERT INTO users
                (username, email, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING user_id, username, email, full_name, role, is_active, created_at`,
            [
                username.trim(),
                email.trim(),
                hash,
                full_name?.trim() || null,
                role
            ]
        );

        const newUser = userResult.rows[0];

        // Create technician profile when applicable
        if (role === 'TECHNICIAN') {
            await client.query(
                `INSERT INTO technician_profiles
                    (technician_id)
                 VALUES ($1)`,
                [newUser.user_id]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'User created successfully',
            user: newUser
        });

    } catch (err) {
        await client.query('ROLLBACK');

        console.error('CREATE USER ERROR:', err);

        if (err.code === '23505') {
            return res.status(409).json({
                message: 'Username or email already exists'
            });
        }

        res.status(500).json({
            message: 'Unable to create user'
        });

    } finally {
        client.release();
    }
});

router.patch('/admin/users/:id/role', authenticate, async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const adminId = Number(req.user.user_id);
        const targetId = Number(req.params.id);
        const { role } = req.body;

        if (!Number.isInteger(targetId) || targetId <= 0) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        if (!['EMPLOYEE', 'TECHNICIAN', 'ADMIN'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        if (targetId === adminId) {
            return res.status(400).json({
                message: 'You cannot change your own role'
            });
        }

        await client.query('BEGIN');
        transactionStarted = true;

        const adminResult = await client.query(
            `SELECT user_id FROM users
             WHERE user_id = $1
             AND role = 'ADMIN'
             AND is_active = TRUE`,
            [adminId]
        );

        if (adminResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;
            return res.status(403).json({ message: 'Admin access required' });
        }

        const userResult = await client.query(
            `SELECT user_id, role
             FROM users
             WHERE user_id = $1
             FOR UPDATE`,
            [targetId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;
            return res.status(404).json({ message: 'User not found' });
        }

        const oldRole = userResult.rows[0].role;

        const updateResult = await client.query(
            `UPDATE users
             SET role = $1
             WHERE user_id = $2
             RETURNING user_id, username, email, full_name, role, is_active`,
            [role, targetId]
        );

        // Ensure every technician has a profile.
        if (role === 'TECHNICIAN') {
            await client.query(
                `INSERT INTO technician_profiles (technician_id)
                 VALUES ($1)
                 ON CONFLICT (technician_id) DO NOTHING`,
                [targetId]
            );
        }

        await client.query('COMMIT');
        transactionStarted = false;

        res.status(200).json({
            message: `User role changed from ${oldRole} to ${role}`,
            user: updateResult.rows[0]
        });

    } catch (err) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('UPDATE USER ROLE ERROR:', err);

        res.status(500).json({
            message: 'Unable to update user role'
        });

    } finally {
        client.release();
    }
});

router.patch('/admin/users/:id/status', authenticate, async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const adminId = Number(req.user.user_id);
        const targetId = Number(req.params.id);
        const { is_active } = req.body;

        if (!Number.isInteger(targetId) || targetId <= 0) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({
                message: 'is_active must be a boolean'
            });
        }

        if (targetId === adminId && !is_active) {
            return res.status(400).json({
                message: 'You cannot deactivate your own account'
            });
        }

        await client.query('BEGIN');
        transactionStarted = true;

        // Verify the requesting admin.
        const adminResult = await client.query(
            `SELECT user_id FROM users
             WHERE user_id = $1
             AND role = 'ADMIN'
             AND is_active = TRUE`,
            [adminId]
        );

        if (adminResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;
            return res.status(403).json({
                message: 'Admin access required'
            });
        }

        // Serialize admin deactivation checks.
        await client.query(
            'SELECT pg_advisory_xact_lock($1)',
            [847292]
        );

        const targetResult = await client.query(
            `SELECT user_id, role, is_active
             FROM users
             WHERE user_id = $1
             FOR UPDATE`,
            [targetId]
        );

        if (targetResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;
            return res.status(404).json({ message: 'User not found' });
        }

        const target = targetResult.rows[0];

        // Never allow the last active admin to be deactivated.
        if (
            !is_active &&
            target.role === 'ADMIN' &&
            target.is_active
        ) {
            const countResult = await client.query(
                `SELECT COUNT(*) AS count
                 FROM users
                 WHERE role = 'ADMIN'
                 AND is_active = TRUE`
            );

            if (Number(countResult.rows[0].count) <= 1) {
                await client.query('ROLLBACK');
                transactionStarted = false;

                return res.status(400).json({
                    message: 'Cannot deactivate the last active administrator'
                });
            }
        }

        const updateResult = await client.query(
            `UPDATE users
             SET is_active = $1
             WHERE user_id = $2
             RETURNING user_id, username, email, full_name, role, is_active`,
            [is_active, targetId]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        res.status(200).json({
            message: is_active
                ? 'User activated successfully'
                : 'User deactivated successfully',
            user: updateResult.rows[0]
        });

    } catch (err) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('UPDATE USER STATUS ERROR:', err);

        res.status(500).json({
            message: 'Unable to update user status'
        });

    } finally {
        client.release();
    }
});


module.exports = router;
