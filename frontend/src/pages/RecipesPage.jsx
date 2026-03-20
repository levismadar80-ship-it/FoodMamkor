import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

function RecipesPage() {
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data));
  }, []);

  useEffect(() => {
    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    api.get("/recipes", { params }).then((res) => setRecipes(res.data));
  }, [selectedCategory]);

  return (
    <div className="recipes-page">
      <h1 style={{ color: "#2d6a4f", marginBottom: "1rem" }}>מתכונים</h1>

      <div className="category-chips" style={{ marginBottom: "1.5rem" }}>
        <button
          className={`category-chip ${!selectedCategory ? "active" : ""}`}
          onClick={() => setSelectedCategory(null)}
        >
          הכל
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`category-chip ${selectedCategory === cat.id ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.emoji} {cat.name}
          </button>
        ))}
      </div>

      {recipes.length === 0 && <p>אין מתכונים להצגה</p>}

      {recipes.map((r) => (
        <Link to={`/recipes/${r.id}`} key={r.id}>
          <div className="recipe-card">
            <h3>{r.title}</h3>
            <p style={{ color: "#888", fontSize: "0.9rem" }}>{r.description}</p>
            <p style={{ fontSize: "0.85rem", color: "#aaa", marginTop: "0.3rem" }}>
              {r.ingredients?.length || 0} מרכיבים
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default RecipesPage;
