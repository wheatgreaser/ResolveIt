import "./Login.css"
    
function Login() {
  return (
    <div className="loginScreen">
      <header className="heading">
        ResolveIt
      </header>

      <form className="loginCo">
        <h1 className="windowHeading">Welcome back</h1>
        <p className="loginSubtitle">
          Sign in to your account to continue.
        </p>

        <div className="inputGroup">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            className="username"
            placeholder="Enter your username"
            autoComplete="username"
            required
          />
        </div>

        <div className="inputGroup">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </div>


        <button type="submit" className="loginButton">
          Sign in
        </button>
      </form>
    </div>
  );
}


export default Login
