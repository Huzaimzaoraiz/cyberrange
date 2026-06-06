import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Dashboard() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/challenges").then((data) => setChallenges(data.challenges || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading challenges...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Challenges</h1>
      </div>
      {challenges.length === 0 ? (
        <div className="empty">No challenges available yet.</div>
      ) : (
        <div className="challenge-grid">
          {challenges.map((c) => (
            <div
              key={c.id}
              className={`challenge-card${c.solved ? " solved" : ""}`}
              onClick={() => navigate(`/lab/${c.id}`)}
            >
              <h3>{c.name}</h3>
              <p>{c.description}</p>
              <div className="card-footer">
                <span className={`badge badge-${c.difficulty}`}>{c.difficulty}</span>
                <span className="badge badge-points">{c.points} pts</span>
                {c.solved && <span className="badge badge-solved">Solved</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
