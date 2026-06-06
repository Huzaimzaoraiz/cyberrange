import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.post("/login", { username, password });
      login(data.token, { user_id: data.user_id, username: data.username, role: data.role });
      navigate("/dashboard");
    } catch (err) {
      setError(err.detail || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-box">
      <h2>$ login</h2>
      {error && <div className="flash flash-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Authenticating..." : "Login"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: "1rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
        Accounts are created by admins only.
      </p>
    </div>
  );
}
