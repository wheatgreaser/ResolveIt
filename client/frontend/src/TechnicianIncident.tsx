import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./TechnicianIncident.css";

interface Incident {
    incident_id: number;
    reporter_id: number;
    title: string;
    description: string;
    affected_service: string;
    impact: string;
    urgency: string;
    priority: string | null;
    status: string;
    assigned_technician_id: number;
    created_at: string;
    updated_at: string;
    technician_name: string | null;
    reporter_name?: string;
}

interface Activity {
    activity_id: number;
    activity_type: string;
    description: string;
    username: string;
    created_at: string;
}

interface ResolutionSuggestion {
    incident_id: number;
    title: string;
    resolution_details: string;
    service_name: string | null;
    match_score: number;
}

function TechnicianIncident() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [incident, setIncident] = useState<Incident | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [resolutionSuggestions, setResolutionSuggestions] = useState<ResolutionSuggestion[]>([]);
    const [note, setNote] = useState("");
    const [requestMessage, setRequestMessage] = useState("");
    const [resolution, setResolution] = useState("");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const token = localStorage.getItem("token");

    async function apiRequest(url: string, method = "GET", body?: object) {
        const response = await fetch(
            `http://localhost:8080/incidents/${url}`,
            {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                ...(body ? { body: JSON.stringify(body) } : {})
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Request failed");
        }

        return data;
    }

    async function loadIncident() {
        try {
            setLoading(true);
            setError("");

            if (!token) {
                navigate("/");
                return;
            }

            const [incidentData, activityData, suggestionData] = await Promise.all([
    apiRequest(`${id}`),
    apiRequest(`${id}/activity`),
    apiRequest(`${id}/suggested-resolutions`)
]);

setIncident(incidentData.incident);

setActivities(activityData.activities || []);
setResolutionSuggestions(suggestionData.suggestions || []);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load incident"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadIncident();
    }, [id]);

    async function performAction(
        endpoint: string,
        method: string,
        body?: object
    ) {
        try {
            setError("");
            setSuccess("");

            await apiRequest(`${id}/${endpoint}`, method, body);

            setSuccess("Action completed successfully.");

            await loadIncident();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Action failed"
            );
        }
    }

    async function addNote() {
        if (!note.trim()) return;

        await performAction("notes", "POST", {
            description: note
        });

        setNote("");
    }

    async function requestInformation() {
        if (!requestMessage.trim()) return;

        await performAction("request-info", "POST", {
            description: requestMessage
        });

        setRequestMessage("");
    }

    async function resolveIncident() {
        if (!resolution.trim()) return;

        await performAction("resolve", "PATCH", {
            description: resolution
        });

        setResolution("");
    }

    if (loading) {
        return <div className="technicianIncidentPage pageLoading">Loading incident...</div>;
    }

    if (!incident) {
        return (
            <div className="technicianIncidentPage">
                <p>{error || "Incident not found."}</p>
                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <main className="technicianIncidentPage">

            <button
                className="backButton"
                onClick={() => navigate("/dashboard")}
            >
                ← Back to Dashboard
            </button>

            <header className="investigationHeader">
                <div>
                    <span>INCIDENT #{incident.incident_id}</span>
                    <h1>{incident.title}</h1>
                    <p>{incident.description}</p>
                </div>

                <div className="investigationBadges">
                    <span>{incident.priority || "UNPRIORITIZED"}</span>
                    <span>{incident.status.replaceAll("_", " ")}</span>
                </div>
            </header>

            {error && <div className="investigationError">{error}</div>}
            {success && <div className="investigationSuccess">{success}</div>}

            <section className="investigationSection">
                <h2>Incident Information</h2>

                <div className="incidentDetailsGrid">
                    <div>
                        <span>Reported by</span>
                        <strong>{incident.reporter_name}</strong>
                    </div>

                    <div>
                        <span>Affected Service</span>
                        <strong>{incident.affected_service}</strong>
                    </div>

                    <div>
                        <span>Impact</span>
                        <strong>{incident.impact}</strong>
                    </div>

                    <div>
                        <span>Urgency</span>
                        <strong>{incident.urgency}</strong>
                    </div>

                    <div>
                        <span>Reported On</span>
                        <strong>
                            {new Date(incident.created_at).toLocaleString()}
                        </strong>
                    </div>
                </div>
            </section>

            {resolutionSuggestions.length > 0 && (
                <section className="investigationSection resolutionSuggestions">
                    <h2>Possible Resolutions from Past Incidents</h2>
                    <p className="suggestionIntro">
                        Ranked by description, category, and affected service. Review before applying.
                    </p>

                    <div className="suggestionList">
                        {resolutionSuggestions.map(suggestion => (
                            <article className="suggestionCard" key={suggestion.incident_id}>
                                <div className="suggestionHeading">
                                    <div>
                                        <strong>{suggestion.title}</strong>
                                        <span>
                                            From incident #{suggestion.incident_id}
                                            {suggestion.service_name ? ` · ${suggestion.service_name}` : ""}
                                        </span>
                                    </div>
                                    <span className="suggestionScore">
                                        {suggestion.match_score}% match
                                    </span>
                                </div>
                                <p>{suggestion.resolution_details}</p>
                                {incident.status === "IN_PROGRESS" && (
                                    <button
                                        className="useSuggestionButton"
                                        onClick={() => setResolution(suggestion.resolution_details)}
                                    >
                                        Use as resolution draft
                                    </button>
                                )}
                            </article>
                        ))}
                    </div>
                </section>
            )}

            <section className="investigationSection">
                <h2>Incident Actions</h2>

                <div className="investigationActions">

                    {incident.status === "ASSIGNED" && (
                        <button
                            onClick={() =>
                                performAction("acknowledge", "PATCH")
                            }
                        >
                            Acknowledge Incident
                        </button>
                    )}

                    {incident.status === "ACKNOWLEDGED" && (
                        <button
                            onClick={() =>
                                performAction("status", "PATCH", {
                                    status: "IN_PROGRESS"
                                })
                            }
                        >
                            Start Investigation
                        </button>
                    )}

                    {["ACKNOWLEDGED", "IN_PROGRESS"].includes(incident.status) && (
                        <>
                            <div className="actionForm">
                                <h3>Add Investigation Note</h3>

                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Describe your investigation progress..."
                                />

                                <button onClick={addNote}>
                                    Add Note
                                </button>
                            </div>

                            <div className="actionForm">
                                <h3>Request Information</h3>

                                <textarea
                                    value={requestMessage}
                                    onChange={e => setRequestMessage(e.target.value)}
                                    placeholder="What additional information do you need?"
                                />

                                <button
                                    onClick={requestInformation}
                                >
                                    Request Information
                                </button>
                            </div>
                        </>
                    )}

                    {incident.status === "IN_PROGRESS" && (
                        <div className="actionForm">
                            <h3>Resolve Incident</h3>

                            <textarea
                                value={resolution}
                                onChange={e => setResolution(e.target.value)}
                                placeholder="Describe the resolution..."
                            />

                            <button onClick={resolveIncident}>
                                Resolve Incident
                            </button>
                        </div>
                    )}

                    {incident.status === "WAITING_FOR_USER" && (
                        <p>
                            Waiting for the employee to provide additional
                            information.
                        </p>
                    )}

                    {["RESOLVED", "VERIFIED", "CLOSED"].includes(incident.status) && (
                        <p>This incident has been resolved or closed.</p>
                    )}

                </div>
            </section>

            <section className="investigationSection">
                <h2>Activity History</h2>

                {activities.length === 0 ? (
                    <p>No activity recorded yet.</p>
                ) : (
                    <div className="activityTimeline">
                        {activities.map(activity => (
                            <article
                                className="activityItem"
                                key={activity.activity_id}
                            >
                                <div>
                                    <strong>{activity.activity_type}</strong>
                                    <p>{activity.description}</p>
                                    <span>
                                        {activity.username} · {
                                            new Date(
                                                activity.created_at
                                            ).toLocaleString()
                                        }
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

        </main>
    );
}

export default TechnicianIncident;
