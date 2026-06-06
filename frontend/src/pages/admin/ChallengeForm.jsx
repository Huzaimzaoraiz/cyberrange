import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api";

const SCOREBOARD_REFRESH_EVENT = "scoreboard:refresh";

const EMPTY = {
  id: "",
  name: "",
  description: "",
  difficulty: "easy",
  category: "",
  points: 100,
  docker_image: "",
  internal_port: 80,
};

export default function ChallengeForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get("/admin/challenges").then((data) => {
      const c = (data.challenges || []).find((ch) => String(ch.id) === String(id));
      if (c) setForm(c);
    });
  }, [id, editing]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/admin/challenges/${id}`, form);
      } else {
        await api.post("/admin/challenges", form);
      }
      window.dispatchEvent(new CustomEvent(SCOREBOARD_REFRESH_EVENT));
      navigate("/admin/challenges");
    } catch (err) {
      setError(err.detail || "Failed to save challenge");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-box challenge-form-box">
      <h2>{editing ? "Edit Challenge" : "New Challenge"}</h2>
      {error && <div className="flash flash-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        {!editing && (
          <div className="form-group">
            <label>ID</label>
            <input value={form.id} onChange={(e) => update("id", e.target.value)} required />
          </div>
        )}
        <div className="form-group">
          <label>Name</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div className="form-group">
          <label>Difficulty</label>
          <select value={form.difficulty} onChange={(e) => update("difficulty", e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="form-group">
          <label>Category</label>
          <input value={form.category} onChange={(e) => update("category", e.target.value)} />
        </div>
        <div className="form-group">
          <label>Points</label>
          <input type="number" value={form.points} onChange={(e) => update("points", Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Docker Image</label>
          <input value={form.docker_image} onChange={(e) => update("docker_image", e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Internal Port</label>
          <input type="number" value={form.internal_port} onChange={(e) => update("internal_port", Number(e.target.value))} />
        </div>
        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Saving..." : editing ? "Update Challenge" : "Create Challenge"}
        </button>
      </form>
    </div>
  );
}
