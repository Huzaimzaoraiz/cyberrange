import { useEffect, useState } from "react";
import { api } from "../api";

const POLL_MS = 3000;

export default function ScoreIpPortal() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadPortal() {
      try {
        const data = await api.get("/scoreboard/portal");
        if (!mounted) return;
        setRows(Array.isArray(data.portal) ? data.portal : []);
        setLastSync(new Date());
        setError("");
      } catch (err) {
        if (!mounted) return;
        setError(err?.detail || "Failed to load portal data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPortal();
    const timer = setInterval(loadPortal, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) return <div className="loading">Loading score portal...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Score Portal</h1>
      </div>

      {error && <div className="flash flash-error">{error}</div>}

      <div className="lab-info" style={{ marginBottom: "1rem" }}>
        <div>
          Live refresh every {Math.floor(POLL_MS / 1000)}s. Last sync: {lastSync ? lastSync.toLocaleTimeString() : "-"}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No players yet.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Score</th>
                <th>Challenge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.user_id}-${r.challenge_id || "none"}-${i}`}>
                  <td>{r.username}</td>
                  <td>{r.score ?? 0}</td>
                  <td>{r.challenge_id || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
