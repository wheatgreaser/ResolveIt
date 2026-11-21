const STOP_WORDS = new Set([
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "for",
    "from", "in", "is", "it", "of", "on", "or", "our", "the", "to",
    "was", "were", "with", "you", "your", "this", "that", "issue", "problem"
]);

function tokens(value) {
    return new Set(
        String(value || "")
            .toLowerCase()
            .match(/[a-z0-9]+/g)
            ?.filter(token => token.length > 2 && !STOP_WORDS.has(token)) || []
    );
}

function similarity(left, right) {
    if (left.size === 0 || right.size === 0) return 0;
    let overlap = 0;
    for (const token of left) if (right.has(token)) overlap++;
    return overlap / (left.size + right.size - overlap);
}

function suggestResolutions(incident, history, limit = 3) {
    const currentTokens = tokens(`${incident.title} ${incident.description}`);

    return history.map(previous => {
        const textScore = similarity(
            currentTokens,
            tokens(`${previous.title} ${previous.description}`)
        );
        const sameCategory = Boolean(incident.category && previous.category === incident.category);
        const sameService = Boolean(incident.service_id && previous.service_id === incident.service_id);
        const score = Math.round(Math.min(1,
            textScore * 0.7 + (sameCategory ? 0.2 : 0) + (sameService ? 0.1 : 0)
        ) * 100);

        return {
            incident_id: Number(previous.incident_id),
            title: previous.title,
            resolution_details: previous.resolution_details,
            service_name: previous.service_name,
            match_score: score
        };
    })
        .filter(item => item.match_score > 0)
        .sort((a, b) => b.match_score - a.match_score || b.incident_id - a.incident_id)
        .slice(0, limit);
}

module.exports = { suggestResolutions };
