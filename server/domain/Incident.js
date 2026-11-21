const VALID_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);

class DomainValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "DomainValidationError";
    }
}

class Incident {
    #reporterId;
    #title;
    #description;
    #serviceId;
    #affectedService;
    #impact;
    #urgency;

    constructor({ reporterId, title, description, serviceId, affectedService, impact, urgency }) {
        if (!Number.isInteger(Number(reporterId)) || Number(reporterId) <= 0) {
            throw new DomainValidationError("A valid reporter is required");
        }
        if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
            throw new DomainValidationError("Title must be between 1 and 200 characters");
        }
        if (typeof description !== "string" || !description.trim()) {
            throw new DomainValidationError("A description is required");
        }
        if (!Number.isInteger(Number(serviceId)) || Number(serviceId) <= 0) {
            throw new DomainValidationError("A valid service is required");
        }
        if (typeof affectedService !== "string" || !affectedService.trim()) {
            throw new DomainValidationError("An active service is required");
        }
        if (!VALID_LEVELS.has(impact) || !VALID_LEVELS.has(urgency)) {
            throw new DomainValidationError("Impact and urgency must be LOW, MEDIUM, or HIGH");
        }

        this.#reporterId = Number(reporterId);
        this.#title = title.trim();
        this.#description = description.trim();
        this.#serviceId = Number(serviceId);
        this.#affectedService = affectedService.trim();
        this.#impact = impact;
        this.#urgency = urgency;
        Object.freeze(this);
    }

    toPersistenceRecord() {
        return Object.freeze({
            reporterId: this.#reporterId,
            title: this.#title,
            description: this.#description,
            serviceId: this.#serviceId,
            affectedService: this.#affectedService,
            impact: this.#impact,
            urgency: this.#urgency
        });
    }
}

class IncidentFactory {
    static createReportedIncident(details) {
        return new Incident(details);
    }
}

module.exports = { Incident, IncidentFactory, DomainValidationError };
