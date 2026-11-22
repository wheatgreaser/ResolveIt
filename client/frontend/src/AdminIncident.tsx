
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminIncident.css";

const API = "http://localhost:8080/incidents";

interface Incident {
    incident_id: number;
    title: string;
    category: string | null;
    priority: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    reporter_name: string;
    technician_name: string | null;
}

interface Activity {
    activity_id: number;
    activity_type: string;
    description: string;
    created_at: string;
    username: string;
}

interface IncidentDetails extends Incident {
    description: string;
    affected_service: string;
    impact: string;
    urgency: string;
    resolution_details: string | null;
    resolved_at: string | null;
    closed_at: string | null;
    closure_notes: string | null;
}

interface RelatedIncident {
    incident_id: number;
    title: string;
    status: string;
    relationship_type: "RELATED" | "POSSIBLE_DUPLICATE";
    match_score: number;
}

interface Escalation {
    escalation_id: number;
    related_incident_id: number;
    related_title: string;
    reason: string;
    match_score: number;
    created_at: string;
}

function AdminIncident() {
    const navigate = useNavigate();

    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [priorityFilter, setPriorityFilter] = useState("ALL");
    const [selectedIncident, setSelectedIncident] =
        useState<IncidentDetails | null>(null);

    const [closureNotes, setClosureNotes] = useState("");
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [activities, setActivities] = useState<Activity[]>([]);
    const [relatedIncidents, setRelatedIncidents] = useState<RelatedIncident[]>([]);
    const [escalations, setEscalations] = useState<Escalation[]>([]);

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredIncidents = incidents.filter(incident => {
        const matchesSearch = !normalizedSearch || [
            String(incident.incident_id),
            incident.title,
            incident.reporter_name,
            incident.technician_name || ""
        ].some(value => value.toLowerCase().includes(normalizedSearch));
        const matchesStatus = statusFilter === "ALL" || incident.status === statusFilter;
        const matchesPriority = priorityFilter === "ALL"
            || (priorityFilter === "UNPRIORITIZED" ? !incident.priority : incident.priority === priorityFilter);
        return matchesSearch && matchesStatus && matchesPriority;
    });

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

    async function loadIncidents() {
        setLoading(true);
        setError("");

        try {
            const data = await apiRequest("/admin/incidents");
            setIncidents(data.incidents || []);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load incidents"
            );
        } finally {
            setLoading(false);
        }
    }

    async function loadDetails(incidentId: number) {
        setDetailsLoading(true);
        setError("");
        setMessage("");

        try {
            const data = await apiRequest(`/${incidentId}`);
            setSelectedIncident(data.incident);
            setClosureNotes("");
            const activityData = await apiRequest(`/${incidentId}/activity`);
            setActivities(activityData.activities || []);
            const relationData = await apiRequest(`/${incidentId}/relations`);
            setRelatedIncidents(relationData.related_incidents || []);
            setEscalations(relationData.escalations || []);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load incident"
            );
        } finally {
            setDetailsLoading(false);
        }
    }

    async function closeIncident() {
        if (!selectedIncident) return;

        setSaving(true);
        setError("");
        setMessage("");

        try {
            const data = await apiRequest(
                `/${selectedIncident.incident_id}/close`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        closure_notes: closureNotes.trim()
                    })
                }
            );

            setMessage(data.message || "Incident closed successfully.");

            await loadIncidents();
            await loadDetails(selectedIncident.incident_id);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to close incident"
            );
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        if (!localStorage.getItem("token")) {
            navigate("/");
            return;
        }

        loadIncidents();
    }, []);

    if (loading) {
        return (
            <div className="adminIncidentLoading">
                Loading incidents...
            </div>
        );
    }

    return (
        <div className="adminIncidentPage">

            <header className="adminIncidentHeader">
                <div>
                    <h1>ResolveIt</h1>
                    <span>Administration / Incident Management</span>
                </div>

                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </header>

            <main className="adminIncidentContent">

                <div className="adminIncidentTitle">
                    <div>
                        <h2>Incident Management</h2>
                        <p>Review incidents and manage their closure.</p>
                    </div>

                    <button onClick={loadIncidents}>
                        Refresh
                    </button>
                </div>

                {error && (
                    <div className="adminIncidentError">{error}</div>
                )}

                {message && (
                    <div className="adminIncidentMessage">{message}</div>
                )}

                <div className="adminIncidentLayout">

                    <section className="adminIncidentList">
                        <div className="incidentListHeading">
                            <h3>All Incidents</h3>
                            <span>{filteredIncidents.length} of {incidents.length}</span>
                        </div>

                        <div className="incidentFilters">
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                placeholder="Search title, ID, reporter, technician"
                                aria-label="Search incidents"
                            />
                            <div className="incidentFilterRow">
                                <select
                                    value={statusFilter}
                                    onChange={event => setStatusFilter(event.target.value)}
                                    aria-label="Filter incidents by status"
                                >
                                    <option value="ALL">All statuses</option>
                                    {["NEW", "CLASSIFIED", "ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "VERIFIED", "CLOSED"].map(status => (
                                        <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                                    ))}
                                </select>
                                <select
                                    value={priorityFilter}
                                    onChange={event => setPriorityFilter(event.target.value)}
                                    aria-label="Filter incidents by priority"
                                >
                                    <option value="ALL">All priorities</option>
                                    <option value="P1">P1 · Critical</option>
                                    <option value="P2">P2 · High</option>
                                    <option value="P3">P3 · Medium</option>
                                    <option value="P4">P4 · Low</option>
                                    <option value="UNPRIORITIZED">Unprioritized</option>
                                </select>
                            </div>
                            {(searchTerm || statusFilter !== "ALL" || priorityFilter !== "ALL") && (
                                <button
                                    className="clearIncidentFilters"
                                    type="button"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setStatusFilter("ALL");
                                        setPriorityFilter("ALL");
                                    }}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>

                        {incidents.length === 0 ? (
                            <p className="adminIncidentEmpty">
                                No incidents found.
                            </p>
                        ) : filteredIncidents.length === 0 ? (
                            <p className="adminIncidentEmpty">
                                No incidents match your search and filters.
                            </p>
                        ) : (
                            filteredIncidents.map(incident => (
                                <button
                                    className={`adminIncidentItem ${
                                        selectedIncident?.incident_id ===
                                        incident.incident_id
                                            ? "selectedAdminIncident"
                                            : ""
                                    }`}
                                    key={incident.incident_id}
                                    onClick={() =>
                                        loadDetails(incident.incident_id)
                                    }
                                >
                                    <div className="adminIncidentItemTop">
                                        <span>
                                            INCIDENT #{incident.incident_id}
                                        </span>
                                        <span>{incident.priority || "N/A"}</span>
                                    </div>

                                    <h4>{incident.title}</h4>

                                    <p>
                                        {incident.reporter_name} ·{" "}
                                        {incident.technician_name || "Unassigned"}
                                    </p>

                                    <span className="adminIncidentStatus">
                                        {incident.status.replaceAll("_", " ")}
                                    </span>
                                </button>
                            ))
                        )}
                    </section>

                    <section className="adminIncidentDetails">
                        {detailsLoading ? (
                            <p>Loading incident details...</p>
                        ) : !selectedIncident ? (
                            <div className="adminIncidentEmpty">
                                <h3>Select an incident</h3>
                                <p>
                                    Choose an incident from the list to view
                                    its details.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="detailsHeading">
                                    <div>
                                        <span>
                                            INCIDENT #{selectedIncident.incident_id}
                                        </span>
                                        <h2>{selectedIncident.title}</h2>
                                    </div>

                                    <span className="adminIncidentStatus">
                                        {selectedIncident.status.replaceAll(
                                            "_",
                                            " "
                                        )}
                                    </span>
                                </div>

                                <div className="detailsGrid">
                                    <div>
                                        <span>Category</span>
                                        <strong>
                                            {selectedIncident.category || "N/A"}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>Priority</span>
                                        <strong>
                                            {selectedIncident.priority || "N/A"}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>Reporter</span>
                                        <strong>
                                            {selectedIncident.reporter_name}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>Technician</span>
                                        <strong>
                                            {selectedIncident.technician_name ||
                                                "Unassigned"}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>Impact</span>
                                        <strong>{selectedIncident.impact}</strong>
                                    </div>

                                    <div>
                                        <span>Urgency</span>
                                        <strong>{selectedIncident.urgency}</strong>
                                    </div>
                                </div>

                                <div className="detailsBlock">
                                    <h3>Description</h3>
                                    <p>{selectedIncident.description}</p>
                                </div>

                                <div className="detailsBlock">
                                    <h3>Affected Service</h3>
                                    <p>{selectedIncident.affected_service}</p>
                                </div>

                                <div className="detailsBlock relatedIncidentBlock">
                                    <h3>Related Incidents</h3>
                                    {relatedIncidents.length === 0 ? (
                                        <p>No related active incidents were found.</p>
                                    ) : (
                                        <div className="relatedIncidentList">
                                            {relatedIncidents.map(related => (
                                                <button
                                                    key={related.incident_id}
                                                    className="relatedIncidentLink"
                                                    onClick={() => loadDetails(related.incident_id)}
                                                >
                                                    <span>
                                                        #{related.incident_id} · {related.title}
                                                        {related.relationship_type === "POSSIBLE_DUPLICATE" && " · Possible duplicate"}
                                                    </span>
                                                    <strong>{related.match_score}% match</strong>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {escalations.map(escalation => (
                                        <p className="incidentEscalation" key={escalation.escalation_id}>
                                            Escalated for review: possible duplicate of #{escalation.related_incident_id}
                                            {` (${escalation.match_score}% match).`}
                                        </p>
                                    ))}
                                </div>

                                {selectedIncident.resolution_details && (
                                    <div className="detailsBlock">
                                        <h3>Technician Resolution</h3>
                                        <p>
                                            {selectedIncident.resolution_details}
                                        </p>
                                    </div>
                                )}
                                <div className="activitySection">
    <h3>Incident Activity</h3>

    {activities.length === 0 ? (
        <p>No activity recorded yet.</p>
    ) : (
        <div className="activityTimeline">
            {activities.map(activity => (
                <div
                    className="activityItem"
                    key={activity.activity_id}
                >
                    <div className="activityDot" />

                    <div className="activityContent">
                        <div className="activityHeader">
                            <strong>{activity.username}</strong>
                            <span>
                                {new Date(
                                    activity.created_at
                                ).toLocaleString()}
                            </span>
                        </div>

                        <span className="activityType">
                            {activity.activity_type.replaceAll("_", " ")}
                        </span>

                        <p>{activity.description}</p>
                    </div>
                </div>
            ))}
        </div>
    )}
</div>

                                {selectedIncident.status === "VERIFIED" && (
                                    <div className="closureSection">
                                        <h3>Close Incident</h3>
                                        <p>
                                            The employee has verified this
                                            resolution. You can now close the
                                            incident.
                                        </p>

                                        <textarea
                                            placeholder="Enter closure notes..."
                                            value={closureNotes}
                                            onChange={e =>
                                                setClosureNotes(e.target.value)
                                            }
                                        />

                                        <button
                                            onClick={closeIncident}
                                            disabled={saving}
                                        >
                                            {saving
                                                ? "Closing..."
                                                : "Close Incident"}
                                        </button>
                                    </div>
                                )}

                                {selectedIncident.status === "CLOSED" && (
                                    <div className="closedNotice">
                                        <h3>Incident Closed</h3>
                                        <p>
                                            {selectedIncident.closure_notes ||
                                                "No closure notes provided."}
                                        </p>

                                        {selectedIncident.closed_at && (
                                            <small>
                                                Closed on:{" "}
                                                {new Date(
                                                    selectedIncident.closed_at
                                                ).toLocaleString()}
                                            </small>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </section>

                </div>
            </main>
        </div>
    );
}

export default AdminIncident;
