import React, { useState, useEffect } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import MapPage from "./pages/MapPage";
import ProducerDetail from "./pages/ProducerDetail";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RegisterProducerPage from "./pages/RegisterProducerPage";
import AdminPage from "./pages/AdminPage";
import RecipesPage from "./pages/RecipesPage";
import RecipeDetail from "./pages/RecipeDetail";
import FavoritesPage from "./pages/FavoritesPage";

function App() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/");
  };

  return (
    <div className="app-container">
      <header className="header">
        <Link to="/">
          <h1>מהמקור</h1>
        </Link>
        <nav>
          <Link to="/">מפה</Link>
          <Link to="/recipes">מתכונים</Link>
          {user ? (
            <>
              {user.role === "admin" && <Link to="/admin">ניהול</Link>}
              <Link to="/favorites">מועדפים</Link>
              <button onClick={logout}>התנתק</button>
            </>
          ) : (
            <>
              <Link to="/login">התחבר</Link>
              <Link to="/register">הרשמה</Link>
            </>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/producers/:id" element={<ProducerDetail />} />
        <Route
          path="/login"
          element={<LoginPage onLogin={setUser} />}
        />
        <Route
          path="/register"
          element={<RegisterPage onLogin={setUser} />}
        />
        <Route
          path="/register/producer"
          element={<RegisterProducerPage onLogin={setUser} />}
        />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/favorites" element={<FavoritesPage />} />
      </Routes>
    </div>
  );
}

export default App;
