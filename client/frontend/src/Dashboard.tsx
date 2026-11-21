import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";
import NotificationBell from "./NotificationBell";
import Chatbot from "./Chatbot";

type UserRole = "EMPLOYEE" | "TECHNICIAN" | "ADMIN";

interface User {
    user_id: number;
    username: string;
    role: UserRole;
}

function Dashboard() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const navigate = useNavigate();

    useEffect(() => {
        async function fetchUser() {
            const token = localStorage.getItem("token");

            if (!token) {
                navigate("/");
                return;
            }

            try {
                const response = await fetch(
                    "http://localhost:8080/auth/me",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                if (!response.ok) {
                    localStorage.removeItem("token");
                    navigate("/");
                    return;
                }

                const data = await response.json();
                setUser(data.user);

            } catch (error) {
                console.error("Error fetching user:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchUser();
    }, [navigate]);

    function handleLogout() {
        localStorage.removeItem("token");
        navigate("/");
    }

    if (loading) {
        return <div className="dashboardLoading">Loading dashboard...</div>;
    }

    if (!user) {
        return <div className="dashboardLoading">Unable to load dashboard.</div>;
    }

    return (
        <div className="dashboardScreen">

            <header className="dashboardHeader">
                <h1>ResolveIt</h1>
                <NotificationBell />
                <div className="headerUser">
                    <div className="userAvatar">
                        {user.username.charAt(0).toUpperCase()}
                    </div>

                    <span>{user.username}</span>

                    <button className="logoutButton" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboardContent">

                <section className="welcomeSection">
                    <div>
                        <p className="welcomeLabel">YOUR WORKSPACE</p>
                        <h2>Welcome back, {user.username}</h2>
                        <p>
                            {user.role === "EMPLOYEE"
                                ? "Report issues and keep track of your IT incidents."
                                : user.role === "TECHNICIAN"
                                ? "Manage your assigned incidents and resolve technical issues."
                                : "Oversee incidents, users, and IT service operations."
                            }
                        </p>
                    </div>

                    <div className="welcomeDecoration">
                        <span>R</span>
                    </div>
                </section>

                {user.role === "EMPLOYEE" && <EmployeeDashboard />}
                {user.role === "TECHNICIAN" && <TechnicianDashboard />}
                {user.role === "ADMIN" && <AdminDashboard />}

            </main>
            <Chatbot />
        </div>
    );
}

function EmployeeDashboard() {
    const navigate = useNavigate();

    return (
        <>
            <section className="dashboardSection">
                <div className="sectionHeading">
                    <div>
                        <h2>Quick Actions</h2>
                        <p>What would you like to do today?</p>
                    </div>
                </div>

                <div className="actionGrid">

                    <div
                        className="actionCard reportCard"
                        onClick={() => navigate("/report-incident")}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                navigate("/report-incident");
                            }
                        }}
                    >
                        <div className="actionIcon purpleIcon">
                            <span>＋</span>
                        </div>

                        <h3>Report an Incident</h3>

                        <p>
                            Experiencing an IT issue? Submit a new incident
                            report for the support team.
                        </p>

                        <span className="cardLink">
                            Create incident <span>→</span>
                        </span>
                    </div>

                    <div
                        className="actionCard"
                        onClick={() => navigate("/my-incidents")}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                navigate("/my-incidents");
                            }
                        }}
                    >
                        <div className="actionIcon blueIcon">
                            <span>▤</span>
                        </div>

                        <h3>My Incidents</h3>

                        <p>
                            View the incidents you've reported and follow
                            their progress.
                        </p>

                        <span className="cardLink">
                            View incidents <span>→</span>
                        </span>
                    </div>

                </div>
            </section>

            <section className="workflowSection">
                <h2>How ResolveIt works</h2>
                <p className="workflowSubtitle">
                    Your incident moves through these stages.
                </p>

                <div className="workflowGrid">
                    <div className="workflowItem">
                        <span className="workflowNumber">01</span>
                        <h3>Report</h3>
                        <p>Submit details about your technical issue.</p>
                    </div>

                    <div className="workflowItem">
                        <span className="workflowNumber">02</span>
                        <h3>Classification</h3>
                        <p>Your incident is assessed for priority and urgency.</p>
                    </div>

                    <div className="workflowItem">
                        <span className="workflowNumber">03</span>
                        <h3>Resolution</h3>
                        <p>A technician investigates and works on the issue.</p>
                    </div>

                    <div className="workflowItem">
                        <span className="workflowNumber">04</span>
                        <h3>Closure</h3>
                        <p>Track the resolution and final closure of your incident.</p>
                    </div>
                </div>
            </section>
        </>
    );
}


interface TechnicianIncident {
    incident_id: number;
    title: string;
    description: string;
    category?: string | null;
    affected_service: string;
    impact: string;
    urgency: string;
    priority: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    reporter_name: string;
}

function TechnicianDashboard() {
    const navigate = useNavigate();

    const [incidents, setIncidents] = useState<TechnicianIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function loadIncidents() {
        const token = localStorage.getItem("token");

        if (!token) {
            navigate("/");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const response = await fetch(
                "http://localhost:8080/incidents/assigned",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (response.status === 401) {
                localStorage.removeItem("token");
                navigate("/");
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch assigned incidents");
            }

            const data = await response.json();
            setIncidents(data.incidents);

        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Something went wrong"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadIncidents();
    }, []);

    const awaitingAcknowledgement = incidents.filter(
        incident => incident.status === "ASSIGNED"
    ).length;

    const inProgress = incidents.filter(
        incident => incident.status === "IN_PROGRESS"
    ).length;

    const waitingForUser = incidents.filter(
        incident => incident.status === "WAITING_FOR_USER"
    ).length;

    if (loading) {
        return (
            <section className="dashboardSection">
                <p>Loading assigned incidents...</p>
            </section>
        );
    }

    return (
        <>
            <section className="dashboardSection">

                <div className="sectionHeading">
                    <div>
                        <h2>Technician Workspace</h2>
                        <p>Manage and resolve your assigned incidents.</p>
                    </div>

                    <button onClick={loadIncidents}>
                        Refresh
                    </button>
                </div>

                {error && (
                    <p className="technicianError">{error}</p>
                )}

                <div className="actionGrid">

                    <div className="actionCard">
                        <div className="actionIcon purpleIcon">▤</div>
                        <h3>Total Assigned</h3>
                        <p>{incidents.length} active assignments.</p>
                    </div>

                    <div className="actionCard">
                        <div className="actionIcon blueIcon">◷</div>
                        <h3>Awaiting Acknowledgement</h3>
                        <p>{awaitingAcknowledgement} incidents pending.</p>
                    </div>

                    <div className="actionCard">
                        <div className="actionIcon greenIcon">✓</div>
                        <h3>In Progress</h3>
                        <p>{inProgress} incidents being investigated.</p>
                    </div>

                    <div className="actionCard">
                        <div className="actionIcon purpleIcon">⌕</div>
                        <h3>Waiting for User</h3>
                        <p>{waitingForUser} incidents awaiting information.</p>
                    </div>

                </div>
            </section>

            <section className="dashboardSection">

                <div className="sectionHeading">
                    <div>
                        <h2>Assigned Incidents</h2>
                        <p>Incidents currently assigned to your account.</p>
                    </div>
                </div>

                {incidents.length === 0 ? (
                    <div className="emptyTechnician">
                        <h3>No assigned incidents</h3>
                        <p>You currently have no incidents to investigate.</p>
                    </div>
                ) : (
                    <div className="technicianIncidentList">

                        {incidents.map(incident => (
                            <article
                                className="technicianIncidentCard"
                                key={incident.incident_id}
                            >
                                <div className="technicianIncidentInfo">

                                    <span className="incidentReference">
                                        INCIDENT #{incident.incident_id}
                                    </span>

                                    <h3>{incident.title}</h3>

                                    <p>{incident.description}</p>

                                    <div className="technicianMetadata">
                                        <span>
                                            Service: {incident.affected_service}
                                        </span>

                                        <span>
                                            Category: {incident.category || "Unspecified"}
                                        </span>

                                        <span>
                                            Reported: {
                                                new Date(
                                                    incident.created_at
                                                ).toLocaleDateString()
                                            }
                                        </span>
                                    </div>

                                </div>

                                <div className="technicianIncidentActions">

                                    <span className={`priorityBadge ${incident.priority || ""}`}>
                                        {incident.priority || "UNPRIORITIZED"}
                                    </span>

                                    <span className="statusBadge">
                                        {(incident.status ?? "UNKNOWN").replaceAll("_", " ")}
                                    </span>

                                    <button
                                        onClick={() =>
                                            navigate(
                                                `/technician/incidents/${incident.incident_id}`
                                            )
                                        }
                                    >
                                        View Incident →
                                    </button>

                                </div>
                            </article>
                        ))}

                    </div>
                )}

            </section>
        </>
    );
}


function AdminDashboard() {
    const navigate = useNavigate();

    const adminActions = [
        {
            title: "Assignment Management",
            description: "Configure assignment strategies and assign incidents to technicians.",
            icon: "⇄",
            path: "/admin/assignments"
        },
        {
            title: "Manage Users",
            description: "Manage employee and technician accounts.",
            icon: "♟",
            path: "/admin/users"
        },
        {
            title: "Manage Technicians",
            description: "Manage technician skills, availability, and workload.",
            icon: "⚙",
            path: "/admin/technicians"
        },
        {
            title: "Manage Services",
            description: "Configure the IT services supported.",
            icon: "▦",
            path: "/admin/services"
        },
        {
            title: "Configure SLAs",
            description: "Set response and resolution targets for each incident priority.",
            icon: "◷",
            path: "/admin/sla-config"
        },
        {
            title: "View Reports",
            description: "Review incident trends and service performance.",
            icon: "▥",
            path: "/admin/reports"
        },
        {
        title: "Classify Incidents",
        description: "Review new incidents and determine their priority.",
        icon: "▤",
        path: "/admin/classification"
        },
        {
        title: "Incident Management",
        description: "Review incidents, inspect resolutions, and close verified incidents.",
        icon: "▣",
        path: "/admin/incidents"
},


    ];

    return (
        <section className="dashboardSection">
            <div className="sectionHeading">
                <div>
                    <h2>Administration</h2>
                    <p>Manage users, services, and incident operations.</p>
                </div>
            </div>

            <div className="actionGrid">
                {adminActions.map((action) => (
                    <div
                        className="actionCard"
                        key={action.title}
                        onClick={() => {
                            if (action.path) {
                                navigate(action.path);
                            }
                        }}
                        role={action.path ? "button" : undefined}
                        tabIndex={action.path ? 0 : undefined}
                        onKeyDown={(e) => {
                            if (
                                action.path &&
                                (e.key === "Enter" || e.key === " ")
                            ) {
                                e.preventDefault();
                                navigate(action.path);
                            }
                        }}
                    >
                        <div className="actionIcon purpleIcon">
                            {action.icon}
                        </div>

                        <h3>{action.title}</h3>
                        <p>{action.description}</p>

                        {action.path ? (
                            <span className="cardLink">
                                Open Management <span>→</span>
                            </span>
                        ) : (
                            <span className="comingSoon">
                                Coming soon
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
export default Dashboard;
