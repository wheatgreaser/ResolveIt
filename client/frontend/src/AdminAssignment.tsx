import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminAssignment.css";

const API = "http://localhost:8080/incidents";

type Strategy = "SKILL_BASED" | "LOAD_BASED" | "PRIORITY_BASED";

interface Skill {
    skill_name: string;
    proficiency: number;
}

interface Technician {
    user_id: number;
    username: string;
    email: string;
    experience_years: number;
    is_available: boolean;
    max_workload: number;
    current_workload: number;
    skills: Skill[];
}

interface Incident {
    incident_id: number;
    title: string;
    category: string;
    priority: string;
    impact: string;
    urgency: string;
    status: string;
    reporter_name: string;
    created_at: string;
}

function AdminAssignment() {
    const navigate = useNavigate();

    const [strategy, setStrategy] = useState<Strategy>("SKILL_BASED");
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [selectedTechnicians, setSelectedTechnicians] =
        useState<Record<number, string>>({});

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const token = localStorage.getItem("token");

    async function apiRequest(path: string, options: RequestInit = {}) {
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

    async function loadDashboard() {
        setLoading(true);
        setError("");

        try {
            const [configData, technicianData, incidentData] =
                await Promise.all([
                    apiRequest("/assignment-config"),
                    apiRequest("/admin/technicians"),
                    apiRequest("/admin/unassigned")
                ]);

            setStrategy(configData.config.strategy);
            setTechnicians(technicianData.technicians);
            setIncidents(incidentData.incidents);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load dashboard"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!token) {
            navigate("/");
            return;
        }

        loadDashboard();
    }, []);

    async function changeStrategy() {
        setSaving(true);
        setError("");
        setMessage("");

        try {
            await apiRequest("/assignment-config", {
                method: "PUT",
                body: JSON.stringify({ strategy })
            });

            setMessage("Assignment strategy updated successfully.");

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to update strategy"
            );
        } finally {
            setSaving(false);
        }
    }

    async function manualAssign(incidentId: number) {
        const technicianId = selectedTechnicians[incidentId];

        if (!technicianId) {
            setError("Please select a technician first.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await apiRequest(`/${incidentId}/manual-assign`, {
                method: "POST",
                body: JSON.stringify({
                    technician_id: Number(technicianId)
                })
            });

            setMessage(`Incident #${incidentId} assigned successfully.`);

            await loadDashboard();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Assignment failed"
            );
        } finally {
            setSaving(false);
        }
    }

    async function autoAssign(incidentId: number) {
        setSaving(true);
        setError("");
        setMessage("");

        try {
            await apiRequest(`/${incidentId}/assign`, {
                method: "POST"
            });

            setMessage(`Incident #${incidentId} automatically assigned.`);

            await loadDashboard();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Automatic assignment failed"
            );
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <div className="assignmentLoading">Loading assignment dashboard...</div>;
    }

    return (
        <div className="assignmentPage">

            <header className="assignmentHeader">
                <div>
                    <h1>ResolveIt</h1>
                    <span>Administration / Technician Assignment</span>
                </div>

                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </header>

            <main className="assignmentContent">

                <div className="assignmentTitle">
                    <div>
                        <h2>Assignment Management</h2>
                        <p>
                            Manage assignment strategies, technician
                            availability, and incident distribution.
                        </p>
                    </div>

                    <button onClick={loadDashboard}>
                        Refresh
                    </button>
                </div>

                {error && <div className="assignmentError">{error}</div>}
                {message && <div className="assignmentMessage">{message}</div>}

                {/* Strategy configuration */}
                <section className="assignmentSection">
                    <h3>Assignment Strategy</h3>
                    <p className="sectionDescription">
                        Select how ResolveIt should automatically distribute incidents.
                    </p>

                    <div className="strategyGrid">

                        <div
                            className={`strategyCard ${strategy === "SKILL_BASED" ? "selectedStrategy" : ""}`}
                            onClick={() => setStrategy("SKILL_BASED")}
                        >
                            <span className="strategyIcon">✦</span>
                            <h4>Skill-Based</h4>
                            <p>
                                Matches incident categories with technician skills
                                and proficiency.
                            </p>
                            <span className="strategyTag">Best skill match</span>
                        </div>

                        <div
                            className={`strategyCard ${strategy === "LOAD_BASED" ? "selectedStrategy" : ""}`}
                            onClick={() => setStrategy("LOAD_BASED")}
                        >
                            <span className="strategyIcon">▥</span>
                            <h4>Load-Based</h4>
                            <p>
                                Prioritizes technicians with fewer active incidents.
                            </p>
                            <span className="strategyTag">Balanced workload</span>
                        </div>

                        <div
                            className={`strategyCard ${strategy === "PRIORITY_BASED" ? "selectedStrategy" : ""}`}
                            onClick={() => setStrategy("PRIORITY_BASED")}
                        >
                            <span className="strategyIcon">⚡</span>
                            <h4>Priority-Based</h4>
                            <p>
                                Gives P1 incidents to more experienced technicians.
                            </p>
                            <span className="strategyTag">Experience focused</span>
                        </div>

                    </div>

                    <button
                        className="saveStrategyButton"
                        onClick={changeStrategy}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Assignment Strategy"}
                    </button>
                </section>

                {/* Technician overview */}
                <section className="assignmentSection">
                    <div className="sectionTitleRow">
                        <div>
                            <h3>Technician Overview</h3>
                            <p className="sectionDescription">
                                Current workload and technical capabilities.
                            </p>
                        </div>

                        <span className="sectionCount">
                            {technicians.length} technicians
                        </span>
                    </div>

                    {technicians.length === 0 ? (
                        <p className="emptyAssignment">
                            No technician profiles found.
                        </p>
                    ) : (
                        <div className="technicianGrid">
                            {technicians.map(technician => (
                                <div className="technicianCard" key={technician.user_id}>

                                    <div className="technicianTop">
                                        <div className="technicianAvatar">
                                            {technician.username.charAt(0).toUpperCase()}
                                        </div>

                                        <div>
                                            <h4>{technician.username}</h4>
                                            <p>{technician.email}</p>
                                        </div>

                                        <span className={
                                            technician.is_available
                                                ? "availability available"
                                                : "availability unavailable"
                                        }>
                                            {technician.is_available ? "Available" : "Unavailable"}
                                        </span>
                                    </div>

                                    <div className="workloadInfo">
                                        <div>
                                            <span>Current workload</span>
                                            <strong>
                                                {technician.current_workload} / {technician.max_workload}
                                            </strong>
                                        </div>

                                        <div className="workloadBar">
                                            <div
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        Number(technician.current_workload) /
                                                        technician.max_workload * 100
                                                    )}%`
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <p className="experience">
                                        {technician.experience_years} years experience
                                    </p>

                                    <div className="skillList">
                                        {technician.skills.map(skill => (
                                            <span key={skill.skill_name}>
                                                {skill.skill_name} · {skill.proficiency}/5
                                            </span>
                                        ))}

                                        {technician.skills.length === 0 && (
                                            <span>No skills added</span>
                                        )}
                                    </div>

                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Unassigned incidents */}
                <section className="assignmentSection">
                    <div className="sectionTitleRow">
                        <div>
                            <h3>Unassigned Incidents</h3>
                            <p className="sectionDescription">
                                Classified incidents waiting for technician assignment.
                            </p>
                        </div>

                        <span className="sectionCount">
                            {incidents.length} pending
                        </span>
                    </div>

                    {incidents.length === 0 ? (
                        <div className="emptyAssignment">
                            <h4>All caught up!</h4>
                            <p>There are no classified incidents waiting for assignment.</p>
                        </div>
                    ) : (
                        <div className="unassignedList">
                            {incidents.map(incident => {
                                const eligibleTechnicians = technicians.filter(
                                    technician =>
                                        technician.is_available &&
                                        Number(technician.current_workload) <
                                            technician.max_workload
                                );

                                return (
                                    <div className="unassignedCard" key={incident.incident_id}>

                                        <div className="incidentInfo">
                                            <span className="incidentReference">
                                                INCIDENT #{incident.incident_id}
                                            </span>

                                            <h4>{incident.title}</h4>

                                            <p>
                                                {incident.category} · Reported by {incident.reporter_name}
                                            </p>

                                            <div className="incidentTags">
                                                <span className={`priorityTag ${incident.priority.toLowerCase()}`}>
                                                    {incident.priority}
                                                </span>
                                                <span>{incident.impact} impact</span>
                                                <span>{incident.urgency} urgency</span>
                                            </div>
                                        </div>

                                        <div className="assignmentControls">

                                            <select
                                                value={selectedTechnicians[incident.incident_id] || ""}
                                                onChange={e =>
                                                    setSelectedTechnicians(prev => ({
                                                        ...prev,
                                                        [incident.incident_id]: e.target.value
                                                    }))
                                                }
                                            >
                                                <option value="">Select technician</option>

                                                {eligibleTechnicians.map(technician => (
                                                    <option
                                                        key={technician.user_id}
                                                        value={technician.user_id}
                                                    >
                                                        {technician.username} ({technician.current_workload}/{technician.max_workload})
                                                    </option>
                                                ))}
                                            </select>

                                            <button
                                                className="manualAssignButton"
                                                disabled={saving || !selectedTechnicians[incident.incident_id]}
                                                onClick={() => manualAssign(incident.incident_id)}
                                            >
                                                Assign Manually
                                            </button>

                                            <button
                                                className="autoAssignButton"
                                                disabled={saving}
                                                onClick={() => autoAssign(incident.incident_id)}
                                            >
                                                Auto Assign
                                            </button>

                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

            </main>
        </div>
    );
}

export default AdminAssignment;
