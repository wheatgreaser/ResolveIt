import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./ReportIncident.css";

type Severity = "LOW" | "MEDIUM" | "HIGH";

interface IncidentForm {
    title: string;
    description: string;
    affected_service: string;
    impact: Severity;
    urgency: Severity;
}

function ReportIncident() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState<IncidentForm>({
        title: "",
        description: "",
        affected_service: "",
        impact: "MEDIUM",
        urgency: "MEDIUM"
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    function handleChange(
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const token = localStorage.getItem("token");

        if (!token) {
            navigate("/");
            return;
        }

        try {
            const response = await fetch(
                "http://localhost:8080/incidents/",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(formData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(data.message || "Failed to report incident");
                return;
            }

            navigate("/dashboard");

        } catch (err) {
            console.error(err);
            setError("Unable to connect to server");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="incidentScreen">
            <header className="incidentHeader">
                <h1>ResolveIt</h1>
                <button onClick={() => navigate("/dashboard")}>
                    Back to Dashboard
                </button>
            </header>

            <form className="incidentForm" onSubmit={handleSubmit}>
                <h2>Report an Incident</h2>
                <p>Describe the IT issue you're experiencing.</p>

                <div className="incidentInputGroup">
                    <label htmlFor="title">Incident Title</label>
                    <input
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        placeholder="e.g. Unable to access payment application"
                        maxLength={200}
                        required
                    />
                </div>

                <div className="incidentInputGroup">
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="Describe the problem in detail..."
                        rows={5}
                        required
                    />
                </div>

                <div className="incidentInputGroup">
                    <label htmlFor="affected_service">Affected Service</label>
                    <input
                        id="affected_service"
                        name="affected_service"
                        value={formData.affected_service}
                        onChange={handleChange}
                        placeholder="e.g. Payment Application"
                        maxLength={100}
                        required
                    />
                </div>

                <div className="incidentFormRow">
                    <div className="incidentInputGroup">
                        <label htmlFor="impact">Impact</label>
                        <select
                            id="impact"
                            name="impact"
                            value={formData.impact}
                            onChange={handleChange}
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                        </select>
                    </div>

                    <div className="incidentInputGroup">
                        <label htmlFor="urgency">Urgency</label>
                        <select
                            id="urgency"
                            name="urgency"
                            value={formData.urgency}
                            onChange={handleChange}
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                        </select>
                    </div>
                </div>

                {error && <p className="incidentError">{error}</p>}

                <button
                    type="submit"
                    className="incidentSubmit"
                    disabled={loading}
                >
                    {loading ? "Submitting..." : "Submit Incident"}
                </button>
            </form>
        </div>
    );
}

export default ReportIncident;
