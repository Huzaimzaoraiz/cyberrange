import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

const SCOREBOARD_REFRESH_EVENT = "scoreboard:refresh";

export default function Challenges() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await api.get("/admin/challenges");
    setChallenges(data.challenges || []);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm(`Delete challenge ${id}?`)) return;
    try {
      await api.del(`/admin/challenges/${id}`);
      setChallenges((prev) => prev.filter((c) => c.id !== id));
      window.dispatchEvent(new CustomEvent(SCOREBOARD_REFRESH_EVENT));
    } catch (err) {
      alert(err.detail || "Failed to delete");
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Manage Challenges</h1>
        <div className="page-actions">
          <Link to="/admin/instances" className="btn btn-secondary">
            Instances
          </Link>
          <Link to="/scoreboard" className="btn btn-secondary">
            Scoreboard
          </Link>
          <Link to="/admin/challenges/new" className="btn btn-primary">
            + New Challenge
          </Link>
        </div>
      </div>
      {challenges.length === 0 ? (
        <div className="empty">No challenges created yet.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Difficulty</th>
                <th>Points</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>
                    <span className={`badge badge-${c.difficulty}`}>{c.difficulty}</span>
                  </td>
                  <td>{c.points}</td>
                  <td>
                    <div className="admin-actions">
                      <Link to={`/admin/challenges/${c.id}/edit`} className="btn btn-secondary btn-sm">
                        Edit
                      </Link>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
