import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

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

function TechnicianDashboard() {
    return (
        <section className="dashboardSection">
            <div className="sectionHeading">
                <div>
                    <h2>Technician Workspace</h2>
                    <p>Tools for managing and resolving incidents.</p>
                </div>
            </div>

            <div className="actionGrid">
                <div className="actionCard">
                    <div className="actionIcon purpleIcon">▤</div>
                    <h3>Assigned Incidents</h3>
                    <p>View and manage incidents assigned to you.</p>
                    <span className="comingSoon">Coming soon</span>
                </div>

                <div className="actionCard">
                    <div className="actionIcon blueIcon">⌕</div>
                    <h3>Investigate Incidents</h3>
                    <p>Review incident details and update their progress.</p>
                    <span className="comingSoon">Coming soon</span>
                </div>

                <div className="actionCard">
                    <div className="actionIcon greenIcon">◷</div>
                    <h3>My Workload</h3>
                    <p>Monitor your assigned work and pending tasks.</p>
                    <span className="comingSoon">Coming soon</span>
                </div>
            </div>
        </section>
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
            icon: "♙",
            path: null
        },
        {
            title: "Manage Technicians",
            description: "Manage technician skills, availability, and workload.",
            icon: "⚙",
            path: null
        },
        {
            title: "Manage Services",
            description: "Configure the IT services supported.",
            icon: "▦",
            path: null
        },
        {
            title: "Configure SLAs",
            description: "Define service-level agreements and targets.",
            icon: "◷",
            path: null
        },
        {
            title: "View Reports",
            description: "Review incident trends and service performance.",
            icon: "▥",
            path: null
        },
        {
        title: "Classify Incidents",
        description: "Review new incidents and determine their priority.",
        icon: "▤",
        path: "/admin/classification"
        }

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