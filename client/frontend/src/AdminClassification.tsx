import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminClassification.css";

interface Incident {
    incident_id: number;
    title: string;
    description: string;
    affected_service: string;
    impact: string;
    urgency: string;
    created_at: string;
    reporter_name: string;
}

interface Classification {
    category: string;
    impact: string;
    urgency: string;
}

const categories = [
    "HARDWARE",
    "SOFTWARE",
    "NETWORK",
    "DATABASE",
    "CLOUD",
    "SECURITY",
    "AUTHENTICATION",
    "APPLICATION",
    "STORAGE"
];

const levels = ["LOW", "MEDIUM", "HIGH"];

function AdminClassification() {
    const navigate = useNavigate();

    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [classifications, setClassifications] = useState<
        Record<number, Classification>
    >({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const token = localStorage.getItem("token");

    async function loadIncidents() {
        try {
            if (!token) {
                navigate("/login");
                return;
            }

            const response = await fetch(
                "http://localhost:8080/incidents/admin/unclassified",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (response.status === 401) {
                localStorage.removeItem("token");
                navigate("/login");
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch incidents");
            }

            const data: Incident[] = await response.json();
            setIncidents(data);

            const initialClassifications: Record<number, Classification> = {};

            data.forEach((incident) => {
                initialClassifications[incident.incident_id] = {
                    category: "SOFTWARE",
                    impact: incident.impact || "MEDIUM",
                    urgency: incident.urgency || "MEDIUM"
                };
            });

            setClassifications(initialClassifications);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadIncidents();
    }, []);

    function updateClassification(
        id: number,
        field: keyof Classification,
        value: string
    ) {
        setClassifications((previous) => ({
            ...previous,
            [id]: {
                ...previous[id],
                [field]: value
            }
        }));
    }

    async function classifyIncident(id: number) {
        setError("");
        setSuccess("");

        try {
            const response = await fetch(
                `http://localhost:8080/incidents/${id}/classify`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(classifications[id])
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Classification failed");
            }

            setIncidents((previous) =>
                previous.filter((incident) => incident.incident_id !== id)
            );

            setSuccess(`Incident #${id} classified successfully.`);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Classification failed"
            );
        }
    }

    if (loading) {
        return <div className="classificationPage">Loading incidents...</div>;
    }

    return (
        <main className="classificationPage">
            <header className="classificationHeader">
                <div>
                    <h1>Incident Classification</h1>
                    <p>Review and classify newly reported incidents.</p>
                </div>

                <button
                    className="backButton"
                    onClick={() => navigate("/dashboard")}
                >
                    Back to Dashboard
                </button>
            </header>

            {error && <div className="classificationError">{error}</div>}
            {success && <div className="classificationSuccess">{success}</div>}

            <div className="classificationCount">
                {incidents.length} incidents awaiting classification
            </div>

            {incidents.length === 0 ? (
                <div className="emptyClassification">
                    <h2>All caught up!</h2>
                    <p>There are no new incidents awaiting classification.</p>
                </div>
            ) : (
                <div className="classificationList">
                    {incidents.map((incident) => (
                        <article
                            className="classificationCard"
                            key={incident.incident_id}
                        >
                            <div className="incidentInfo">
                                <span className="incidentId">
                                    INCIDENT #{incident.incident_id}
                                </span>

                                <h2>{incident.title}</h2>

                                <p>{incident.description}</p>

                                <div className="incidentMetadata">
                                    <span>
                                        Service: {incident.affected_service}
                                    </span>
                                    <span>
                                        Reported by: {incident.reporter_name}
                                    </span>
                                    <span>
                                        {new Date(
                                            incident.created_at
                                        ).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <div className="classificationControls">
                                <label>
                                    Category
                                    <select
                                        value={
                                            classifications[incident.incident_id]
                                                ?.category || "SOFTWARE"
                                        }
                                        onChange={(e) =>
                                            updateClassification(
                                                incident.incident_id,
                                                "category",
                                                e.target.value
                                            )
                                        }
                                    >
                                        {categories.map((category) => (
                                            <option
                                                key={category}
                                                value={category}
                                            >
                                                {category}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label>
                                    Impact
                                    <select
                                        value={
                                            classifications[incident.incident_id]
                                                ?.impact || "MEDIUM"
                                        }
                                        onChange={(e) =>
                                            updateClassification(
                                                incident.incident_id,
                                                "impact",
                                                e.target.value
                                            )
                                        }
                                    >
                                        {levels.map((level) => (
                                            <option key={level} value={level}>
                                                {level}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label>
                                    Urgency
                                    <select
                                        value={
                                            classifications[incident.incident_id]
                                                ?.urgency || "MEDIUM"
                                        }
                                        onChange={(e) =>
                                            updateClassification(
                                                incident.incident_id,
                                                "urgency",
                                                e.target.value
                                            )
                                        }
                                    >
                                        {levels.map((level) => (
                                            <option key={level} value={level}>
                                                {level}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <button
                                    className="classifyButton"
                                    onClick={() =>
                                        classifyIncident(incident.incident_id)
                                    }
                                >
                                    Classify Incident
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </main>
    );
}

export default AdminClassification;
