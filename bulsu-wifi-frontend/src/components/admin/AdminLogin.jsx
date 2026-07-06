import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BulsuHeader from "../layout/BulsuHeader";
import Button from "../ui/Button";
import AlertBanner from "../ui/AlertBanner";
import PageBackground from "../layout/PageBackground";
import Card from "../layout/Card";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
      if (res.data.role !== "admin") {
        setError("Access denied. Admin accounts only.");
        setLoading(false);
        return;
      }
      localStorage.setItem("adminToken", res.data.token);
      navigate("/admin/overview");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid credentials.");
      setLoading(false);
    }
  };

  return (
    <PageBackground imageSrc="/src/assets/bulsu-bg.png">
      <Card>
        <BulsuHeader subtitle="Admin Dashboard" />
        <form onSubmit={handleLogin}>
          <AlertBanner message={error} />
          <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="w-full border border-pink-200 rounded-xl px-3 py-2.5 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            required
          />
          <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-pink-200 rounded-xl px-3 py-2.5 mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          By connecting you agree to the BulSU Acceptable Use Policy.
        </p>
      </Card>
    </PageBackground>
  );
}
