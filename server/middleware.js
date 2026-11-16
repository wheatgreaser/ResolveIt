
const jwt = require('jsonwebtoken');
const pool = require('./db');

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            message: 'Authentication required'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify JWT
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Check whether user still exists and is active
        const result = await pool.query(
            `SELECT user_id, role, is_active
             FROM users
             WHERE user_id = $1`,
            [decoded.user_id]
        );

        if (
            result.rows.length === 0 ||
            !result.rows[0].is_active
        ) {
            return res.status(401).json({
                message: 'Account is inactive or does not exist'
            });
        }

        // Store current database information in req.user
        req.user = {
            user_id: result.rows[0].user_id,
            role: result.rows[0].role
        };

        next();

    } catch (err) {
        console.error('AUTHENTICATION ERROR:', err);

        return res.status(401).json({
            message: 'Invalid or expired token'
        });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'Permission denied'
            });
        }

        next();
    };
}

module.exports = { authenticate, authorize };
