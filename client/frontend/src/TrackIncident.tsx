import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./TrackIncident.css";

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
    created_at: string;
    updated_at: string;
    technician_name: string | null;
    resolution_details: string | null;
    resolved_at: string | null;
    response_due_at: string | null;
    resolution_due_at: string | null;
}

const statuses = [
    "NEW",
    "CLASSIFIED",
    "ASSIGNED",
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "WAITING_FOR_USER",
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

    const [feedback, setFeedback] = useState("");
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [verificationMessage, setVerificationMessage] = useState("");
    const [verificationError, setVerificationError] = useState("");
    const [userResponse, setUserResponse] = useState("");
    const [responseLoading, setResponseLoading] = useState(false);
    const [responseMessage, setResponseMessage] = useState("");
    const [responseError, setResponseError] = useState("");

    // Fetch incident details
    const fetchIncident = useCallback(async () => {
        const token = localStorage.getItem("token");

        if (!token) {
            navigate("/login");
            return;
        }

        try {
            setError("");

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
                err instanceof Error
                    ? err.message
                    : "Something went wrong"
            );
        }
    }, [id, navigate]);

    useEffect(() => {
        async function load() {
            setLoading(true);
            await fetchIncident();
            setLoading(false);
        }

        load();
    }, [fetchIncident]);

    async function submitResponse() {
    if (!userResponse.trim()) {
        setResponseError("Please enter your response.");
        return;
    }

    const token = localStorage.getItem("token");

    try {
        setResponseLoading(true);
        setResponseError("");
        setResponseMessage("");

        const response = await fetch(
            `http://localhost:8080/incidents/${id}/respond`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    response: userResponse.trim()
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to submit response");
        }

        setResponseMessage(data.message);
        setUserResponse("");

        await fetchIncident();

    } catch (err) {
        setResponseError(
            err instanceof Error ? err.message : "Something went wrong"
        );
    } finally {
        setResponseLoading(false);
    }
}
    // Accept or reject resolution
    async function verifyResolution(verified: boolean) {
        const token = localStorage.getItem("token");

        try {
            setVerificationLoading(true);
            setVerificationError("");
            setVerificationMessage("");

            const response = await fetch(
                `http://localhost:8080/incidents/${id}/verify`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        verified,
                        feedback: feedback.trim()
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Verification failed");
            }

            setVerificationMessage(data.message);
            setFeedback("");

            await fetchIncident();

        } catch (err) {
            setVerificationError(
                err instanceof Error
                    ? err.message
                    : "Verification failed"
            );
        } finally {
            setVerificationLoading(false);
        }
    }

    if (loading) return <p>Loading incident...</p>;
    if (error) return <p className="track-error">{error}</p>;
    if (!incident) return <p>Incident not found.</p>;

    const currentIndex = statuses.indexOf(incident.status);

    return (
        <div className="track-page">

            <button
                className="backButton"
                onClick={() => navigate("/my-incidents")}
            >
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
                    {incident.status.replaceAll("_", " ")}
                </span>
            </div>

            {/* Incident Progress */}
            <section className="track-card">
                <h2>Incident Progress</h2>

                <div className="progress-list">
                    {statuses.map((status, index) => (
                        <div
                            key={status}
                            className={`progress-step ${
                                currentIndex >= 0 && index <= currentIndex
                                    ? "completed"
                                    : ""
                            }`}
                        >
                            <div className="progress-dot">
                                {index < currentIndex ? "✓" : index + 1}
                            </div>

                            <span>{status.replaceAll("_", " ")}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Incident Details */}
            <section className="track-card">
                <h2>Incident Details</h2>

                <p><strong>Description:</strong> {incident.description}</p>
                <p><strong>Impact:</strong> {incident.impact}</p>
                <p><strong>Urgency:</strong> {incident.urgency}</p>

                <p>
                    <strong>Priority:</strong>{" "}
                    {incident.priority || "Pending classification"}
                </p>

                <p>
                    <strong>Assigned Technician:</strong>{" "}
                    {incident.technician_name || "Not assigned"}
                </p>

                <p>
                    <strong>Reported:</strong>{" "}
                    {new Date(incident.created_at).toLocaleString()}
                </p>

                <p>
                    <strong>Last Updated:</strong>{" "}
                    {new Date(incident.updated_at).toLocaleString()}
                </p>
            </section>
                {incident.resolution_details && (
        <div className="resolutionSection">
            <h3>Technician's Resolution</h3>
            <p>{incident.resolution_details}</p>

            {incident.resolved_at && (
                <small>
                    Resolved on: {new Date(incident.resolved_at).toLocaleString()}
                </small>
            )}
        </div>
    )}

{incident.status === "WAITING_FOR_USER" && (
    <div className="userResponseSection">
        <h3>Additional Information Required</h3>

        <p>
            Your technician needs additional information to continue
            investigating this incident. Please provide the requested details.
        </p>

        <textarea
            placeholder="Enter your response..."
            value={userResponse}
            onChange={(e) => setUserResponse(e.target.value)}
        />

        {responseError && (
            <p className="verificationError">{responseError}</p>
        )}

        {responseMessage && (
            <p className="verificationMessage">{responseMessage}</p>
        )}

        <button
            onClick={submitResponse}
            disabled={responseLoading || !userResponse.trim()}
        >
            {responseLoading ? "Submitting..." : "Submit Response"}
        </button>
    </div>
)}
            {/* Employee Resolution Verification */}
            {incident.status === "RESOLVED" && (
                <section className="track-card verificationSection">

                    <h2>Resolution Verification</h2>

                    <p>
                        Your technician has marked this incident as resolved.
                        Please confirm whether the issue has been fixed.
                    </p>

                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Optional feedback about the resolution..."
                    />

                    {verificationError && (
                        <p className="verificationError">
                            {verificationError}
                        </p>
                    )}

                    {verificationMessage && (
                        <p className="verificationSuccess">
                            {verificationMessage}
                        </p>
                    )}

                    <div className="verificationActions">

                        <button
                            disabled={verificationLoading}
                            onClick={() => verifyResolution(true)}
                        >
                            {verificationLoading
                                ? "Processing..."
                                : "Accept Resolution"}
                        </button>

                        <button
                            className="rejectResolution"
                            disabled={
                                verificationLoading || !feedback.trim()
                            }
                            onClick={() => verifyResolution(false)}
                        >
                            Reject Resolution
                        </button>

                    </div>
                </section>
            )}

            {incident.status === "VERIFIED" && (
                <section className="track-card">
                    <h2>Resolution Verified</h2>
                    <p>
                        You have confirmed that the incident has been resolved.
                        It is awaiting formal closure.
                    </p>
                </section>
            )}

        </div>
    );
}

export default TrackIncident;
