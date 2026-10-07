import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(e) {
    e.preventDefault();
    if (!email) return;
    setMsg({ type: "", text: "" });
    setLoading(true);

    try {
      await api.post("/register", { email });
      setMsg({ type: "success", text: "OTP sent to your email!" });
      setStep(2);
    } catch (err) {
      setMsg({ type: "error", text: err.error || "Failed to send OTP" });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!otp || !password) return;
    setMsg({ type: "", text: "" });
    setLoading(true);

    try {
      await api.post("/verify-register", { email, otp, password });
      setMsg({ type: "success", text: "Account created! You can now log in." });
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setMsg({ type: "error", text: err.error || "Failed to verify OTP" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Cyberrange Register</h2>

        {msg.text && <div className={`flash flash-${msg.type}`}>{msg.text}</div>}

        {step === 1 ? (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="cyberrange@internal.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !email}>
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={email} disabled />
            </div>
            <div className="form-group">
              <label>6-Digit OTP</label>
              <input
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="form-group">
              <label>Choose a Password</label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !otp || !password}>
              {loading ? "Verifying..." : "Complete Registration"}
            </button>
          </form>
        )}

        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <Link to="/login" style={{ color: "var(--brand-color)", textDecoration: "none" }}>
            Already have an account? Login here.
          </Link>
        </div>
      </div>
    </div>
  );
}
