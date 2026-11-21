class AssignmentStrategy {
    /** @param {Array<object>} candidates @param {object} incident */
    select(candidates, incident) {
        throw new Error("AssignmentStrategy.select must be implemented");
    }
}

class SkillBasedStrategy extends AssignmentStrategy {
    select(candidates) {
        return [...candidates]
            .filter(candidate => Number(candidate.skill_score) > 0)
            .sort((a, b) =>
                Number(b.skill_score) - Number(a.skill_score) ||
                Number(a.current_workload) - Number(b.current_workload) ||
                Number(b.experience_years) - Number(a.experience_years) ||
                Number(a.technician_id) - Number(b.technician_id)
            )[0] || null;
    }
}

class LoadBasedStrategy extends AssignmentStrategy {
    select(candidates) {
        return [...candidates].sort((a, b) =>
            Number(a.current_workload) - Number(b.current_workload) ||
            Number(b.experience_years) - Number(a.experience_years) ||
            Number(a.technician_id) - Number(b.technician_id)
        )[0] || null;
    }
}

class PriorityBasedStrategy extends AssignmentStrategy {
    select(candidates, incident) {
        const priorityOrder = incident.priority === "P1"
            ? (a, b) => Number(b.experience_years) - Number(a.experience_years)
            : (a, b) => Number(a.current_workload) - Number(b.current_workload);

        return [...candidates].sort((a, b) =>
            priorityOrder(a, b) ||
            Number(a.current_workload) - Number(b.current_workload) ||
            Number(b.experience_years) - Number(a.experience_years) ||
            Number(a.technician_id) - Number(b.technician_id)
        )[0] || null;
    }
}

class AssignmentStrategyFactory {
    static create(strategyName) {
        const strategies = {
            SKILL_BASED: SkillBasedStrategy,
            LOAD_BASED: LoadBasedStrategy,
            PRIORITY_BASED: PriorityBasedStrategy
        };
        const StrategyType = strategies[strategyName];
        if (!StrategyType) {
            throw new Error(`Unsupported assignment strategy: ${strategyName}`);
        }
        return new StrategyType();
    }
}

module.exports = {
    AssignmentStrategy,
    AssignmentStrategyFactory,
    SkillBasedStrategy,
    LoadBasedStrategy,
    PriorityBasedStrategy
};
