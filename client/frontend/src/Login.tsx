
import "./Login.css";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

function Login() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        username: "",
        password: ""
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch(
                "http://localhost:8080/auth/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(formData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(data.message || "Login failed");
                return;
            }

            // Store JWT
            localStorage.setItem("token", data.token);

            // Navigate to dashboard
            navigate("/dashboard");

        } catch (err) {
            console.error(err);
            setError("Unable to connect to server");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="loginScreen">
            <header className="heading">
                ResolveIt
            </header>

            <form className="loginCo" onSubmit={handleSubmit}>
                <h1 className="windowHeading">Welcome back</h1>

                <p className="loginSubtitle">
                    Sign in to your account to continue.
                </p>

                <div className="inputGroup">
                    <label htmlFor="username">Username</label>
                    <input
                        id="username"
                        name="username"
                        type="text"
                        className="username"
                        placeholder="Enter your username"
                        autoComplete="username"
                        value={formData.username}
                        onChange={handleChange}
                        required
                    />
                </div>

                <div className="inputGroup">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        className="password"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                    />
                </div>

                {error && (
                    <p className="errorMessage">{error}</p>
                )}

                <button
                    type="submit"
                    className="loginButton"
                    disabled={loading}
                >
                    {loading ? "Signing in..." : "Sign in"}
                </button>

                <p className="registerFooter">
                    Don't have an account?{" "}
                    <Link to="/register">Register</Link>
                </p>
            </form>
        </div>
    );
}

export default Login;
