import "./Register.css";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:8080/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Registration failed");
        return;
      }

      navigate("/profile");

    } catch (err) {
      console.error(err);
      setError("Unable to connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="registerScreen">
      <header className="registerHeading">
        ResolveIt
      </header>

      <form className="registerCo" onSubmit={handleSubmit}>
        <h1 className="registerWindowHeading">
          Create an account
        </h1>

        <p className="registerSubtitle">
          Sign up to get started with ResolveIt.
        </p>

        <div className="registerInputGroup">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="Choose a username"
            autoComplete="username"
            value={formData.username}
            onChange={handleChange}
            required
          />
        </div>

        <div className="registerInputGroup">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="Enter your email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="registerInputGroup">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Create a password"
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>

        <div className="registerInputGroup">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>

        {error && <p className="errorMessage">{error}</p>}

        <button
          type="submit"
          className="registerButton"
          disabled={loading}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="registerFooter">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}

export default Register;
