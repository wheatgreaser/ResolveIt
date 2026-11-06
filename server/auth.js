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

        res.status(201).json({
            message: 'Registration successful',
            user: result.rows[0]
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


module.exports = router;
