import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./MyIncidents.css";

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
}

function MyIncidents() {
    const navigate = useNavigate();

    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchIncidents() {
            const token = localStorage.getItem("token");

            if (!token) {
                navigate("/login");
                return;
            }

            try {
                const response = await fetch(
                    "http://localhost:8080/incidents/my",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    if (response.status === 401) {
                        localStorage.removeItem("token");
                        navigate("/");
                        return;
                    }

                    setError(data.message || "Unable to fetch incidents");
                    return;
                }

                setIncidents(data.incidents);

            } catch (err) {
                console.error(err);
                setError("Unable to connect to server");
            } finally {
                setLoading(false);
            }
        }

        fetchIncidents();
    }, [navigate]);

    function formatDate(date: string) {
        return new Date(date).toLocaleString();
    }

    if (loading) {
        return <div className="myIncidentsScreen">Loading incidents...</div>;
    }

    return (
        <div className="myIncidentsScreen">

            <header className="myIncidentsHeader">
                <h1>ResolveIt</h1>

                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </header>

            <main className="myIncidentsContent">

                <div className="myIncidentsTitle">
                    <div>
                        <h2>My Incidents</h2>
                        <p>Track the incidents you have reported.</p>
                    </div>

                    <button
                        onClick={() => navigate("/report-incident")}
                    >
                        + Report Incident
                    </button>
                </div>

                <div className="incidentCount">
                    Total incidents: {incidents.length}
                </div>

                {error && (
                    <p className="myIncidentsError">{error}</p>
                )}

                {!error && incidents.length === 0 && (
                    <div className="emptyIncidents">
                        <h3>No incidents reported yet</h3>
                        <p>
                            When you report an IT issue, it will appear here.
                        </p>
                        <button
                            onClick={() => navigate("/report-incident")}
                        >
                            Report your first incident
                        </button>
                    </div>
                )}

                {incidents.length > 0 && (
                    <div className="incidentTableWrapper">
                        <table className="incidentTable">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Title</th>
                                    <th>Service</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Reported on</th>
                                </tr>
                            </thead>

                            <tbody>
                                {incidents.map(incident => (
                                    <tr key={incident.incident_id}
                                    onClick={() => navigate(`/track-incident/${incident.incident_id}`)}
                                    className="clickableIncident"
                                    >
                                        <td>#{incident.incident_id}</td>
                                        <td>{incident.title}</td>
                                        <td>{incident.affected_service}</td>
                                        <td>
                                            {incident.priority || "Pending"}
                                        </td>
                                        <td>
                                            <span className={`statusBadge status-${incident.status.toLowerCase()}`}>
                                                {incident.status.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td>{formatDate(incident.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

            </main>
        </div>
    );
}

export default MyIncidents;
