import "./Register.css"
import { Link } from "react-router-dom";

function Register() {
  return (
    <div className="registerScreen">
      <header className="registerHeading">
        ResolveIt
      </header>

      <form className="registerCo">
        <h1 className="registerWindowHeading">Create an account</h1>
        <p className="registerSubtitle">
          Sign up to get started with ResolveIt.
        </p>

        <div className="registerInputGroup">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Choose a username"
            autoComplete="username"
            required
          />
        </div>

        <div className="registerInputGroup">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            autoComplete="email"
            required
          />
        </div>

        <div className="registerInputGroup">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="registerInputGroup">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            autoComplete="new-password"
            required
          />
        </div>

        <button type="submit" className="registerButton">
          Create account
        </button>

        <p className="registerFooter">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}

export default Register;