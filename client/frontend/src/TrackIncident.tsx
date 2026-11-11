import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./TrackIncident.css";

interface Incident {
    incident_id: number;
    title: string;
    description: string;
    affected_service: string;
    impact: string;
    urgency: string;
    priority: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    technician_name: string | null;
}

const statuses = [
    "NEW",
    "CLASSIFIED",
    "ASSIGNED",
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "RESOLVED",
    "VERIFIED",
    "CLOSED"
];

function TrackIncident() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [incident, setIncident] = useState<Incident | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchIncident() {
            const token = localStorage.getItem("token");

            if (!token) {
                navigate("/login");
                return;
            }

            try {
                const response = await fetch(
                    `http://localhost:8080/incidents/${id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Unable to load incident");
                }

                setIncident(data.incident);

            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Something went wrong"
                );
            } finally {
                setLoading(false);
            }
        }

        fetchIncident();
    }, [id, navigate]);

    if (loading) return <p>Loading incident...</p>;
    if (error) return <p className="track-error">{error}</p>;
    if (!incident) return <p>Incident not found.</p>;

    const currentIndex = statuses.indexOf(incident.status);

    return (
        <div className="track-page">
            <button
            className="backButton"
            onClick={() => navigate("/my-incidents")}>
            <span className="backArrow">←</span>
            <span>Back to My Incidents</span>
            </button>

            <div className="track-header">
                <div>
                    <p className="incident-id">
                        INCIDENT #{incident.incident_id}
                    </p>
                    <h1>{incident.title}</h1>
                    <p>{incident.affected_service}</p>
                </div>

                <span className={`status-badge status-${incident.status.toLowerCase()}`}>
                    {incident.status.replace("_", " ")}
                </span>
            </div>

            <section className="track-card">
                <h2>Incident Progress</h2>

                <div className="progress-list">
                    {statuses.map((status, index) => (
                        <div
                            key={status}
                            className={`progress-step ${
                                index <= currentIndex ? "completed" : ""
                            }`}
                        >
                            <div className="progress-dot">
                                {index < currentIndex ? "✓" : index + 1}
                            </div>

                            <span>{status.replace("_", " ")}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="track-card">
                <h2>Incident Details</h2>

                <p><strong>Description:</strong> {incident.description}</p>
                <p><strong>Impact:</strong> {incident.impact}</p>
                <p><strong>Urgency:</strong> {incident.urgency}</p>
                <p><strong>Priority:</strong> {incident.priority || "Pending classification"}</p>
                <p><strong>Assigned Technician:</strong> {incident.technician_name || "Not assigned"}</p>
                <p><strong>Reported:</strong> {new Date(incident.created_at).toLocaleString()}</p>
                <p><strong>Last Updated:</strong> {new Date(incident.updated_at).toLocaleString()}</p>
            </section>
        </div>
    );
}

export default TrackIncident;