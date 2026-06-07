import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

const SCOREBOARD_REFRESH_EVENT = "scoreboard:refresh";

function formatRemainingTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export default function Lab() {
  const { challengeId } = useParams();
  const [challenge, setChallenge] = useState(null);
  const [status, setStatus] = useState(null);
  const [flag, setFlag] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.get(`/lab/${challengeId}/status`);
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, [challengeId]);

  useEffect(() => {
    Promise.all([
      api.get("/challenges").then((data) => {
        const list = data.challenges || [];
        const c = list.find((ch) => String(ch.id) === String(challengeId));
        setChallenge(c || null);
      }),
      fetchStatus(),
    ]).finally(() => setLoading(false));
  }, [challengeId, fetchStatus]);

  useEffect(() => {
    if (!status?.running || status.remaining_seconds == null) return undefined;

    const timer = window.setInterval(() => {
      setStatus((current) => {
        if (!current?.running || current.remaining_seconds == null) return current;
        const nextRemaining = Math.max(0, Number(current.remaining_seconds) - 1);
        if (nextRemaining === current.remaining_seconds) return current;
        return { ...current, remaining_seconds: nextRemaining };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status?.running]);

  useEffect(() => {
    if (status?.running && status.remaining_seconds === 0) {
      fetchStatus();
    }
  }, [fetchStatus, status?.running, status?.remaining_seconds]);

  async function startLab() {
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const data = await api.post(`/lab/${challengeId}/start`);
      setMsg({ type: "success", text: data.message || "Lab started" });
      await fetchStatus();
    } catch (err) {
      setMsg({ type: "error", text: err.detail || "Failed to start lab" });
    } finally {
      setBusy(false);
    }
  }

  async function stopLab() {
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const data = await api.post(`/lab/${challengeId}/stop`);
      setMsg({ type: "success", text: data.message || "Lab stopped" });
      await fetchStatus();
    } catch (err) {
      setMsg({ type: "error", text: err.detail || "Failed to stop lab" });
    } finally {
      setBusy(false);
    }
  }

  async function submitFlag(e) {
    e.preventDefault();
    if (!flag.trim()) return;
    setMsg({ type: "", text: "" });
    try {
      const data = await api.post("/submit_flag", {
        challenge_id: String(challengeId),
        flag: flag.trim(),
      });
      window.dispatchEvent(new CustomEvent(SCOREBOARD_REFRESH_EVENT));
      if (data.correct) {
        setMsg({ type: "success", text: data.message || "Correct!" });
        setFlag("");
      } else {
        setMsg({ type: "error", text: data.message || "Incorrect flag" });
      }
    } catch (err) {
      setMsg({ type: "error", text: err.detail || "Incorrect flag" });
    }
  }

  if (loading) return <div className="loading">Loading lab...</div>;
  if (!challenge) return <div className="empty">Challenge not found.</div>;

  const running = status?.running === true;

  return (
    <>
      <div className="lab-panel">
        <h2>{challenge.name}</h2>
        <p>{challenge.description}</p>
        <div className="card-footer" style={{ marginBottom: "1rem" }}>
          <span className={`badge badge-${challenge.difficulty}`}>{challenge.difficulty}</span>
          <span className="badge badge-points">{challenge.points} pts</span>
        </div>

        {msg.text && (
          <div className={`flash flash-${msg.type}`}>{msg.text}</div>
        )}

        <div className="lab-status">
          <span className={`status-dot ${running ? "running" : "stopped"}`} />
          <span>{running ? "Running" : "Stopped"}</span>
        </div>

        <div className="lab-actions">
          <button className="btn btn-primary" onClick={startLab} disabled={busy || running}>
            {busy && !running ? "Starting..." : "Start Lab"}
          </button>
          <button className="btn btn-danger" onClick={stopLab} disabled={busy || !running}>
            {busy && running ? "Stopping..." : "Stop Lab"}
          </button>
        </div>

        {running && status?.target_ip && (
          <div className="lab-info">
            Your Machine IP: <code>{status.target_ip}</code>
            <a
              className="btn btn-secondary btn-sm"
              href={`http://${status.target_ip}`}
              target="_blank"
              rel="noreferrer"
              style={{ marginLeft: "0.75rem" }}
            >
              Open Machine
            </a>
          </div>
        )}

        {running && status?.instance_id && (
          <div className="lab-info">
            Lab Instance ID: <code>{status.instance_id}</code>
          </div>
        )}

        {running && status?.remaining_seconds != null && (
          <div className="lab-info lab-timer">
            Auto stop in: <code>{formatRemainingTime(status.remaining_seconds)}</code>
          </div>
        )}

      </div>

      <div className="lab-panel">
        <h2>Submit Flag</h2>
        <form className="flag-form" onSubmit={submitFlag}>
          <input
            placeholder="flag{...}"
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Submit
          </button>
        </form>
      </div>
    </>
  );
}
