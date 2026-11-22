const PRIORITY_MATRIX = Object.freeze({
    HIGH: Object.freeze({ HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' }),
    MEDIUM: Object.freeze({ HIGH: 'P2', MEDIUM: 'P3', LOW: 'P4' }),
    LOW: Object.freeze({ HIGH: 'P3', MEDIUM: 'P4', LOW: 'P4' })
});

function calculatePriority(impact, urgency) {
    return PRIORITY_MATRIX[impact]?.[urgency] || null;
}

module.exports = { calculatePriority };
