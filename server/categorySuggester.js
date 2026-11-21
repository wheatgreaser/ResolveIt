const CATEGORY_KEYWORDS = {
    HARDWARE: ["laptop", "desktop", "monitor", "keyboard", "mouse", "printer", "device", "power supply", "overheating", "broken screen"],
    SOFTWARE: ["software", "install", "installation", "update", "crash", "bug", "application error", "license", "version"],
    NETWORK: ["network", "wifi", "wi-fi", "internet", "vpn", "router", "connection", "connectivity", "dns", "ethernet", "latency"],
    DATABASE: ["database", "sql", "query", "postgres", "mysql", "oracle", "data source", "db connection"],
    CLOUD: ["cloud", "aws", "azure", "gcp", "s3", "cloud storage", "virtual machine", "container"],
    SECURITY: ["security", "malware", "virus", "phishing", "ransomware", "breach", "suspicious", "firewall", "vulnerability"],
    AUTHENTICATION: ["login", "log in", "sign in", "password", "authentication", "authenticator", "mfa", "2fa", "locked out", "access denied"],
    APPLICATION: ["application", "app", "portal", "website", "web app", "outlook", "teams", "browser", "screen not loading"],
    STORAGE: ["storage", "disk", "drive", "file server", "space full", "capacity", "backup", "sharepoint"]
};

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_KEYWORDS));

function suggestCategory({ title = "", description = "", serviceCategory = "" }) {
    const text = `${title} ${description}`.toLowerCase();
    const scores = Object.fromEntries(
        Object.keys(CATEGORY_KEYWORDS).map(category => [category, 0])
    );
    const matched = Object.fromEntries(
        Object.keys(CATEGORY_KEYWORDS).map(category => [category, []])
    );

    const normalizedServiceCategory = String(serviceCategory).trim().toUpperCase();
    if (VALID_CATEGORIES.has(normalizedServiceCategory)) {
        scores[normalizedServiceCategory] += 4;
        matched[normalizedServiceCategory].push("service category");
    }

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
            if (pattern.test(text)) {
                scores[category] += keyword.includes(" ") ? 2 : 1;
                matched[category].push(keyword);
            }
        }
    }

    const ranked = Object.entries(scores)
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (ranked.length === 0) {
        return { category: null, match_score: 0, reasons: [] };
    }

    const [category, topScore] = ranked[0];
    const secondScore = ranked[1]?.[1] || 0;
    const matchScore = Math.min(95, Math.round(
        45 + Math.min(topScore, 4) * 10 + Math.min(topScore - secondScore, 3) * 5
    ));

    return {
        category,
        match_score: matchScore,
        reasons: matched[category].slice(0, 4).map(item =>
            item === "service category" ? "matches the affected service category" : `description mentions “${item}”`
        ),
        alternatives: ranked.slice(1, 3).map(([alternative, score]) => ({
            category: alternative,
            score
        }))
    };
}

module.exports = { suggestCategory };
