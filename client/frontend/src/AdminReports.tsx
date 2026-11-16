
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminReports.css";

interface Summary {
    total_incidents: string;
    active_incidents: string;
    resolved_incidents: string;
    avg_resolution_hours: string | null;
}

interface Distribution {
    status?: string;
    priority?: string;
    count: string;
}

interface ReportData {
    summary: Summary;
    byStatus: Distribution[];
    byPriority: Distribution[];
}

function AdminReports() {
    const navigate = useNavigate();

    const [reports, setReports] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function fetchReports() {
        const token = localStorage.getItem("token");

        if (!token) {
            navigate("/");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const response = await fetch(
                "http://localhost:8080/incidents/admin/reports/overview",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to fetch reports");
            }

            setReports(data);

        } catch (err) {
            console.error("REPORTS ERROR:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to load reports"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchReports();
    }, []);

    function renderDistribution(items: Distribution[], key: "status" | "priority") {
        const maxCount = Math.max(
            ...items.map(item => Number(item.count)),
            1
        );

        return (
            <div className="reportDistribution">
                {items.length === 0 ? (
                    <p className="reportEmpty">No data available.</p>
                ) : (
                    items.map((item, index) => (
                        <div className="distributionItem" key={index}>
                            <div className="distributionInfo">
                                <span>
                                    {item[key]?.replaceAll("_", " ")}
                                </span>
                                <strong>{item.count}</strong>
                            </div>

                            <div className="distributionTrack">
                                <div
                                    className="distributionFill"
                                    style={{
                                        width: `${(Number(item.count) / maxCount) * 100}%`
                                    }}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="adminReportsScreen">
                <p>Loading reports...</p>
            </div>
        );
    }

    return (
        <div className="adminReportsScreen">
            <header className="adminReportsHeader">
                <div>
                    <h1>Incident Reports</h1>
                    <p>Overview of incident management performance.</p>
                </div>

                <div className="reportHeaderActions">
                    <button onClick={() => navigate("/dashboard")}>
                        Dashboard
                    </button>

                    <button onClick={fetchReports}>
                        Refresh
                    </button>
                </div>
            </header>

            {error && (
                <div className="reportError">
                    {error}
                </div>
            )}

            {reports && (
                <>
                    <section className="reportSummaryGrid">
                        <div className="reportCard">
                            <span>Total Incidents</span>
                            <h2>{reports.summary.total_incidents}</h2>
                        </div>

                        <div className="reportCard">
                            <span>Active Incidents</span>
                            <h2>{reports.summary.active_incidents}</h2>
                        </div>

                        <div className="reportCard">
                            <span>Resolved Incidents</span>
                            <h2>{reports.summary.resolved_incidents}</h2>
                        </div>

                        <div className="reportCard">
                            <span>Average Resolution Time</span>
                            <h2>
                                {reports.summary.avg_resolution_hours === null
                                    ? "N/A"
                                    : `${reports.summary.avg_resolution_hours} hrs`}
                            </h2>
                        </div>
                    </section>

                    <section className="reportChartsGrid">
                        <div className="reportPanel">
                            <h2>Incidents by Status</h2>
                            {renderDistribution(reports.byStatus, "status")}
                        </div>

                        <div className="reportPanel">
                            <h2>Incidents by Priority</h2>
                            {renderDistribution(reports.byPriority, "priority")}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

export default AdminReports;
