import { useState, useEffect } from "react";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";

const SCOREBOARD_REFRESH_EVENT = "scoreboard:refresh";

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function loadUsers() {
    return api.get("/admin/users").then((data) => setUsers(data.users || []));
  }

  useEffect(() => {
    loadUsers()
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateUser(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await api.post("/admin/users", { username, password, role });
      setSuccess("User created successfully");
      setUsername("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (err) {
      setError(err.detail || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(userRow) {
    setError("");
    setSuccess("");
    if (Number(userRow.id) === Number(currentUser?.user_id)) {
      setError("You cannot remove your own account");
      return;
    }
    if (!confirm(`Remove user ${userRow.username}?`)) return;
    try {
      await api.del(`/admin/users/${userRow.id}`);
      setSuccess(`User ${userRow.username} removed`);
      await loadUsers();
      window.dispatchEvent(new CustomEvent(SCOREBOARD_REFRESH_EVENT));
    } catch (err) {
      setError(err.detail || "Failed to remove user");
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
      </div>

      <div className="simple-panel">
        <h3>Create User (Admin Only)</h3>
        {error && <div className="flash flash-error">{error}</div>}
        {success && <div className="flash flash-success">{success}</div>}
        <form onSubmit={handleCreateUser} className="inline-form-row">
          <div className="inline-number-field">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
            />
          </div>
          <div className="inline-number-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="inline-number-field">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating..." : "Create user"}
          </button>
        </form>
      </div>

      {users.length === 0 ? (
        <div className="empty">No users registered.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "badge-hard" : "badge-easy"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{u.created_at}</td>
                  <td>
                    {Number(u.id) === Number(currentUser?.user_id) ? (
                      <span className="badge">Current</span>
                    ) : (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u)}>
                        Remove
                      </button>
                    )}
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
