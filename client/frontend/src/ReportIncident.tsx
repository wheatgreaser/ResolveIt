
import { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./ReportIncident.css";

type Severity = "LOW" | "MEDIUM" | "HIGH";

interface IncidentForm {
    title: string;
    description: string;
    service_id: string;
    impact: Severity;
    urgency: Severity;
}

interface Service {
    service_id: number;
    service_name: string;
    description: string | null;
    category: string | null;
}

function ReportIncident() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState<IncidentForm>({
        title: "",
        description: "",
        service_id: "",
        impact: "MEDIUM",
        urgency: "MEDIUM"
    });

    const [services, setServices] = useState<Service[]>([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [servicesError, setServicesError] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [triageLoading, setTriageLoading] = useState(false);
    const [triageSuggestion, setTriageSuggestion] = useState("");
    const [triageError, setTriageError] = useState("");

    // Fetch available services
    useEffect(() => {
        async function fetchServices() {
            const token = localStorage.getItem("token");

            if (!token) {
                navigate("/");
                return;
            }

            try {
                setServicesLoading(true);
                setServicesError("");

                const response = await fetch(
                    "http://localhost:8080/incidents/services",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.message || "Unable to retrieve services"
                    );
                }

                setServices(data.services);

            } catch (err) {
                console.error("FETCH SERVICES ERROR:", err);

                setServicesError(
                    err instanceof Error
                        ? err.message
                        : "Unable to retrieve services"
                );
            } finally {
                setServicesLoading(false);
            }
        }

        fetchServices();
    }, [navigate]);

    function handleChange(
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
        setTriageSuggestion("");
    }

    async function getTriageSuggestion() {
        setTriageError("");
        setTriageSuggestion("");
        const token = localStorage.getItem("token");
        if (!token) {
            navigate("/");
            return;
        }
        setTriageLoading(true);
        try {
            const selectedService = services.find(service => String(service.service_id) === formData.service_id);
            const response = await fetch("http://localhost:8080/chatbot/triage", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    title: formData.title,
                    description: formData.description,
                    service: selectedService?.service_name || ""
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to get triage suggestions.");
            setTriageSuggestion(data.suggestion);
        } catch (err) {
            setTriageError(err instanceof Error ? err.message : "Unable to get triage suggestions.");
        } finally {
            setTriageLoading(false);
        }
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");

        if (!formData.service_id) {
            setError("Please select an affected service.");
            return;
        }

        setLoading(true);

        const token = localStorage.getItem("token");

        if (!token) {
            navigate("/");
            setLoading(false);
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
                    body: JSON.stringify({
                        ...formData,
                        service_id: Number(formData.service_id)
                    })
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

                <section className="triageCard" aria-labelledby="triageTitle">
                    <div className="triageHeading">
                        <div>
                            <span className="triageEyebrow">AI ASSIST</span>
                            <h3 id="triageTitle">Get a quick triage</h3>
                            <p>Review likely category, suggested impact and urgency, and safe first steps.</p>
                        </div>
                        <span className="triageSpark">✦</span>
                    </div>
                    <button type="button" className="triageButton" onClick={getTriageSuggestion}
                        disabled={triageLoading || !formData.title.trim() || !formData.description.trim()}>
                        {triageLoading ? "Reviewing your issue…" : "Suggest next steps"}
                    </button>
                    {triageError && <p className="incidentError" role="alert">{triageError}</p>}
                    {triageSuggestion && (
                        <div className="triageSuggestion" aria-live="polite">
                            <strong>Suggested triage</strong>
                            <p>{triageSuggestion}</p>
                            <span>Suggestions are AI-generated. Check impact and urgency before submitting.</span>
                        </div>
                    )}
                </section>

                <div className="incidentInputGroup">
                    <label htmlFor="service_id">
                        Affected Service
                    </label>

                    <select
                        id="service_id"
                        name="service_id"
                        value={formData.service_id}
                        onChange={handleChange}
                        required
                        disabled={servicesLoading || services.length === 0}
                    >
                        <option value="">
                            {servicesLoading
                                ? "Loading services..."
                                : services.length === 0
                                    ? "No services available"
                                    : "Select an affected service"}
                        </option>

                        {services.map(service => (
                            <option
                                key={service.service_id}
                                value={service.service_id}
                            >
                                {service.service_name}
                                {service.category
                                    ? ` (${service.category})`
                                    : ""}
                            </option>
                        ))}
                    </select>

                    {servicesError && (
                        <p className="incidentError">
                            {servicesError}
                        </p>
                    )}
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

                {error && (
                    <p className="incidentError">{error}</p>
                )}

                <button
                    type="submit"
                    className="incidentSubmit"
                    disabled={
                        loading ||
                        servicesLoading ||
                        services.length === 0
                    }
                >
                    {loading ? "Submitting..." : "Submit Incident"}
                </button>
            </form>
        </div>
    );
}

export default ReportIncident;
