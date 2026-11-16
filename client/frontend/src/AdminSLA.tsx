
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminSLA.css";

const API = "http://localhost:8080/incidents";

type SLAStatus =
    | "MET"
    | "ON_TRACK"
    | "AT_RISK"
    | "BREACHED"
    | "NOT_CONFIGURED";

interface SLAIncident {
    incident_id: number;
    title: string;
    priority: string | null;
    status: string;
    reporter_name: string;
    technician_name: string | null;
    response_due_at: string | null;
    resolution_due_at: string | null;
    response_sla_status: SLAStatus;
    resolution_sla_status: SLAStatus;
}

interface SLASummary {
    total: number;
    response_breached: number;
    resolution_breached: number;
    at_risk: number;
    fully_compliant: number;
}

function AdminSLA() {
    const navigate = useNavigate();

    const [incidents, setIncidents] = useState<SLAIncident[]>([]);
    const [summary, setSummary] = useState<SLASummary | null>(null);
    const [filter, setFilter] = useState("ALL");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function loadSLA() {
        setLoading(true);
        setError("");

        try {
            const token = localStorage.getItem("token");

            if (!token) {
                navigate("/");
                return;
            }

            const response = await fetch(`${API}/admin/sla`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                localStorage.removeItem("token");
                navigate("/");
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to load SLA data"
                );
            }

            setIncidents(data.incidents || []);
            setSummary(data.summary);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Request failed"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSLA();
    }, []);

    const filteredIncidents = incidents.filter(incident => {
        if (filter === "ALL") return true;

        if (filter === "BREACHED") {
            return (
                incident.response_sla_status === "BREACHED" ||
                incident.resolution_sla_status === "BREACHED"
            );
        }

        if (filter === "AT_RISK") {
            return (
                incident.response_sla_status === "AT_RISK" ||
                incident.resolution_sla_status === "AT_RISK"
            );
        }

        return (
            incident.response_sla_status === filter ||
            incident.resolution_sla_status === filter
        );
    });

    function formatDate(value: string | null) {
        return value
            ? new Date(value).toLocaleString()
            : "Not configured";
    }

    function renderStatus(status: SLAStatus) {
        return (
            <span className={`slaBadge ${status.toLowerCase()}`}>
                {status.replaceAll("_", " ")}
            </span>
        );
    }

    return (
        <div className="slaPage">
            <header className="slaHeader">
                <div>
                    <h1>ResolveIt</h1>
                    <p>Administration / SLA Monitoring</p>
                </div>

                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </header>

            <main className="slaContent">
                <div className="slaTitle">
                    <div>
                        <h2>SLA Monitoring</h2>
                        <p>
                            Monitor response deadlines, resolution deadlines,
                            and service-level breaches.
                        </p>
                    </div>

                    <button onClick={loadSLA} disabled={loading}>
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>

                {error && <div className="slaError">{error}</div>}

                {summary && (
                    <div className="slaStats">
                        <div className="slaStatCard">
                            <span>Total Incidents</span>
                            <strong>{summary.total}</strong>
                        </div>

                        <div className="slaStatCard">
                            <span>Response Breaches</span>
                            <strong>{summary.response_breached}</strong>
                        </div>

                        <div className="slaStatCard">
                            <span>Resolution Breaches</span>
                            <strong>{summary.resolution_breached}</strong>
                        </div>

                        <div className="slaStatCard">
                            <span>At Risk</span>
                            <strong>{summary.at_risk}</strong>
                        </div>

                        <div className="slaStatCard">
                            <span>Fully Compliant</span>
                            <strong>{summary.fully_compliant}</strong>
                        </div>
                    </div>
                )}

                <section className="slaTableSection">
                    <div className="slaTableHeader">
                        <h3>Incident SLA Status</h3>

                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        >
                            <option value="ALL">All Incidents</option>
                            <option value="BREACHED">Breached</option>
                            <option value="AT_RISK">At Risk</option>
                            <option value="ON_TRACK">On Track</option>
                            <option value="MET">Met</option>
                            <option value="NOT_CONFIGURED">
                                Not Configured
                            </option>
                        </select>
                    </div>

                    <div className="slaTableScroll">
                        <table className="slaTable">
                            <thead>
                                <tr>
                                    <th>Incident</th>
                                    <th>Priority</th>
                                    <th>Technician</th>
                                    <th>Response Deadline</th>
                                    <th>Response SLA</th>
                                    <th>Resolution Deadline</th>
                                    <th>Resolution SLA</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredIncidents.map(incident => (
                                    <tr key={incident.incident_id}>
                                        <td>
                                            <strong>
                                                #{incident.incident_id}
                                            </strong>
                                            <span>{incident.title}</span>
                                        </td>

                                        <td>{incident.priority || "N/A"}</td>

                                        <td>
                                            {incident.technician_name ||
                                                "Unassigned"}
                                        </td>

                                        <td>
                                            {formatDate(
                                                incident.response_due_at
                                            )}
                                        </td>

                                        <td>
                                            {renderStatus(
                                                incident.response_sla_status
                                            )}
                                        </td>

                                        <td>
                                            {formatDate(
                                                incident.resolution_due_at
                                            )}
                                        </td>

                                        <td>
                                            {renderStatus(
                                                incident.resolution_sla_status
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filteredIncidents.length === 0 && (
                        <p className="slaEmpty">
                            No incidents match this filter.
                        </p>
                    )}
                </section>
            </main>
        </div>
    );
}

export default AdminSLA;
