import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";

export default function Instances() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    const instancesData = await api.get("/admin/instances");
    setInstances(instancesData.instances || []);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleKill(id) {
    if (!confirm(`Kill instance ${id}?`)) return;
    try {
      await api.post(`/admin/instances/${id}/kill`);
      setInstances((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert(err.detail || "Failed to kill instance");
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Running Instances</h1>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => navigate("/scoreboard")}>
            Scoreboard
          </button>
          <button className="btn btn-secondary" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
            Refresh
          </button>
        </div>
      </div>
      {instances.length === 0 ? (
        <div className="empty">No running instances.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Challenge</th>
                <th>IP</th>
                <th>Started</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst) => (
                <tr key={inst.id}>
                  <td>{inst.id}</td>
                  <td>{inst.username || inst.user_id}</td>
                  <td>{inst.challenge_id}</td>
                  <td><code>{inst.target_ip}</code></td>
                  <td>{inst.created_at}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleKill(inst.id)}>
                      Kill
                    </button>
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
