import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <Link to="/" className="logo">
        HackThrough
      </Link>
      <div className="nav-links">
        {user ? (
          <>
            <Link to="/dashboard">Challenges</Link>
            <Link to="/scoreboard">Scoreboard</Link>
            {user.role === "admin" && (
              <>
                <Link to="/admin/challenges" className="admin-link">
                  Admin
                </Link>
                <Link to="/admin/users" className="admin-link">
                  Users
                </Link>
              </>
            )}
            <span className="username">{user.username}</span>
            <button className="btn btn-small" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
          </>
        )}
      </div>
    </nav>
  );
}
