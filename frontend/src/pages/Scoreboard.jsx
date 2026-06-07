import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

const SCOREBOARD_REFRESH_EVENT = "scoreboard:refresh";

export default function Scoreboard() {
  const [rows, setRows] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api.get("/scoreboard/portal");
    const scoreRows = Array.isArray(data.scoreboard) ? [...data.scoreboard] : [];

    setRows(
      scoreRows.map((row, index) => ({
        ...row,
        rank: index + 1,
        score: Number(row.net_score ?? row.total_points ?? 0),
      }))
    );
    setLastSync(new Date());
  }, []);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    async function handleRefreshEvent() {
      try {
        await load();
      } catch {
        // Keep existing scoreboard on transient refresh failures.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handleRefreshEvent();
      }
    }

    window.addEventListener(SCOREBOARD_REFRESH_EVENT, handleRefreshEvent);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener(SCOREBOARD_REFRESH_EVENT, handleRefreshEvent);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  if (loading) return <div className="loading">Loading scoreboard...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Scoreboard</h1>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      <div className="simple-note">
        <span>Updated on submissions.</span>
        <span>Last sync: {lastSync ? lastSync.toLocaleTimeString() : "-"}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No scores yet.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Score</th>
                <th>Solves</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={r.rank <= 3 ? `rank-${r.rank}` : ""}>{r.rank}</td>
                  <td>{r.username}</td>
                  <td>{r.score ?? 0}</td>
                  <td>{r.solves ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
