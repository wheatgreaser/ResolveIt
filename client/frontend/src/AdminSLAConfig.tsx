
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminSLAConfig.css";

const API = "http://localhost:8080/incidents";

interface SLAConfig {
    sla_id: number;
    priority: "P1" | "P2" | "P3" | "P4";
    response_time_minutes: number;
    resolution_time_minutes: number;
    is_active: boolean;
}

function AdminSLAConfig() {
    const navigate = useNavigate();

    const [configs, setConfigs] = useState<SLAConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function apiRequest(path: string, options: RequestInit = {}) {
        const token = localStorage.getItem("token");

        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...options.headers
            }
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            localStorage.removeItem("token");
            navigate("/");
            throw new Error("Session expired");
        }

        if (!response.ok) {
            throw new Error(data.message || "Request failed");
        }

        return data;
    }

    async function loadConfigs() {
        setLoading(true);
        setError("");

        try {
            const data = await apiRequest("/admin/sla-config");
            setConfigs(data.configurations || []);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load configurations"
            );
        } finally {
            setLoading(false);
        }
    }

    function updateField(
        id: number,
        field: "response_time_minutes" | "resolution_time_minutes",
        value: string
    ) {
        setConfigs(prev =>
            prev.map(config =>
                config.sla_id === id
                    ? {
                        ...config,
                        [field]: value === "" ? 0 : Number(value)
                    }
                    : config
            )
        );
    }

    async function saveConfig(config: SLAConfig) {
        setSavingId(config.sla_id);
        setError("");
        setMessage("");

        try {
            await apiRequest(`/admin/sla-config/${config.sla_id}`, {
                method: "PUT",
                body: JSON.stringify({
                    response_time_minutes: config.response_time_minutes,
                    resolution_time_minutes: config.resolution_time_minutes
                })
            });

            setMessage(`${config.priority} SLA updated successfully.`);
            await loadConfigs();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to save configuration"
            );
        } finally {
            setSavingId(null);
        }
    }

    useEffect(() => {
        loadConfigs();
    }, []);

    function formatDuration(minutes: number) {
        if (minutes >= 1440 && minutes % 1440 === 0) {
            return `${minutes / 1440} day(s)`;
        }

        if (minutes >= 60 && minutes % 60 === 0) {
            return `${minutes / 60} hour(s)`;
        }

        return `${minutes} minute(s)`;
    }

    if (loading) {
        return <div className="slaConfigLoading">Loading SLA configurations...</div>;
    }

    return (
        <div className="slaConfigPage">
            <header className="slaConfigHeader">
                <div>
                    <h1>ResolveIt</h1>
                    <span>Administration / SLA Configuration</span>
                </div>

                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </header>

            <main className="slaConfigContent">
                <div className="slaConfigTitle">
                    <div>
                        <h2>SLA Configuration</h2>
                        <p>
                            Configure response and resolution targets for each
                            incident priority.
                        </p>
                    </div>

                    <button onClick={loadConfigs}>Refresh</button>
                </div>

                {error && <div className="slaConfigError">{error}</div>}
                {message && <div className="slaConfigMessage">{message}</div>}

                <div className="slaConfigGrid">
                    {configs.map(config => (
                        <section className="slaConfigCard" key={config.sla_id}>
                            <div className="slaConfigCardHeader">
                                <div>
                                    <span className={`priorityLabel ${config.priority.toLowerCase()}`}>
                                        {config.priority}
                                    </span>
                                    <h3>{config.priority} Priority</h3>
                                </div>

                                <span className="slaActive">
                                    {config.is_active ? "Active" : "Inactive"}
                                </span>
                            </div>

                            <div className="slaConfigField">
                                <label htmlFor={`response-${config.sla_id}`}>
                                    Response Time (minutes)
                                </label>

                                <input
                                    id={`response-${config.sla_id}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={config.response_time_minutes}
                                    onChange={e =>
                                        updateField(
                                            config.sla_id,
                                            "response_time_minutes",
                                            e.target.value
                                        )
                                    }
                                />

                                <small>
                                    Current target: {formatDuration(config.response_time_minutes)}
                                </small>
                            </div>

                            <div className="slaConfigField">
                                <label htmlFor={`resolution-${config.sla_id}`}>
                                    Resolution Time (minutes)
                                </label>

                                <input
                                    id={`resolution-${config.sla_id}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={config.resolution_time_minutes}
                                    onChange={e =>
                                        updateField(
                                            config.sla_id,
                                            "resolution_time_minutes",
                                            e.target.value
                                        )
                                    }
                                />

                                <small>
                                    Current target: {formatDuration(config.resolution_time_minutes)}
                                </small>
                            </div>

                            <button
                                className="saveSLAButton"
                                disabled={
                                    savingId !== null ||
                                    !Number.isInteger(config.response_time_minutes) ||
                                    !Number.isInteger(config.resolution_time_minutes) ||
                                    config.response_time_minutes <= 0 ||
                                    config.resolution_time_minutes <= 0
                                }
                                onClick={() => saveConfig(config)}
                            >
                                {savingId === config.sla_id
                                    ? "Saving..."
                                    : "Save Configuration"}
                            </button>
                        </section>
                    ))}
                </div>

                {configs.length === 0 && (
                    <p className="slaConfigEmpty">
                        No SLA configurations found. Add P1–P4 configurations
                        to your database first.
                    </p>
                )}
            </main>
        </div>
    );
}

export default AdminSLAConfig;
