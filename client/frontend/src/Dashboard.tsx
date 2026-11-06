
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
                navigate("/login");
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
                    navigate("/login");
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
        navigate("/login");
    }

    if (loading) {
        return <div>Loading dashboard...</div>;
    }

    if (!user) {
        return <div>Unable to load dashboard.</div>;
    }

    return (
        <div className="dashboardScreen">

            <header className="dashboardHeader">
                <h1>ResolveIt</h1>

                <div>
                    <span>{user.username}</span>
                    <button onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboardContent">

                <h2>Welcome, {user.username}</h2>

                {user.role === "EMPLOYEE" && (
                    <EmployeeDashboard />
                )}

                {user.role === "TECHNICIAN" && (
                    <TechnicianDashboard />
                )}

                {user.role === "ADMIN" && (
                    <AdminDashboard />
                )}

            </main>

        </div>
    );
}


// EMPLOYEE DASHBOARD
function EmployeeDashboard() {
    return (
        <section>
            <h2>Employee Dashboard</h2>

            <button>Report an Incident</button>
            <button>My Incidents</button>
            <button>Track Incident Status</button>
        </section>
    );
}


// TECHNICIAN DASHBOARD
function TechnicianDashboard() {
    return (
        <section>
            <h2>Technician Dashboard</h2>

            <button>Assigned Incidents</button>
            <button>Investigate Incidents</button>
            <button>My Workload</button>
        </section>
    );
}


// ADMIN DASHBOARD
function AdminDashboard() {
    return (
        <section>
            <h2>Administrator Dashboard</h2>

            <button>Manage Users</button>
            <button>Manage Technicians</button>
            <button>Manage Services</button>
            <button>Configure SLAs</button>
            <button>View Reports</button>
        </section>
    );
}

export default Dashboard;

