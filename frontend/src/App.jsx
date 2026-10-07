import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Lab from "./pages/Lab";
import Scoreboard from "./pages/Scoreboard";
import Challenges from "./pages/admin/Challenges";
import ChallengeForm from "./pages/admin/ChallengeForm";
import Instances from "./pages/admin/Instances";
import Users from "./pages/admin/Users";

export default function App() {
  const { loading } = useAuth();
  if (loading) return null;

  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lab/:challengeId"
            element={
              <ProtectedRoute>
                <Lab />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scoreboard"
            element={
              <ProtectedRoute>
                <Scoreboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/challenges"
            element={
              <ProtectedRoute adminOnly>
                <Challenges />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/challenges/new"
            element={
              <ProtectedRoute adminOnly>
                <ChallengeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/challenges/:id/edit"
            element={
              <ProtectedRoute adminOnly>
                <ChallengeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/instances"
            element={
              <ProtectedRoute adminOnly>
                <Instances />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute adminOnly>
                <Users />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </>
  );
}
