import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";

function RecipeDetail() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState(null);

  useEffect(() => {
    api.get(`/recipes/${id}`).then((res) => setRecipe(res.data));
  }, [id]);

  if (!recipe) return <div style={{ padding: "2rem" }}>טוען...</div>;

  return (
    <div className="producer-detail">
      <Link to="/recipes" style={{ color: "#2d6a4f", fontSize: "0.9rem" }}>
        &rarr; חזרה למתכונים
      </Link>

      <h1>{recipe.title}</h1>
      <p>{recipe.description}</p>

      {recipe.ingredients?.length > 0 && (
        <section>
          <h2>מרכיבים</h2>
          {recipe.ingredients.map((ing) => (
            <div key={ing.id} className="product-item">
              <span>{ing.ingredient_name}</span>
              {ing.producer_id && (
                <Link to={`/producers/${ing.producer_id}`} style={{ color: "#2d6a4f", fontSize: "0.85rem" }}>
                  מהיצרן &larr;
                </Link>
              )}
              {ing.notes && <span style={{ color: "#888", fontSize: "0.85rem" }}>{ing.notes}</span>}
            </div>
          ))}
        </section>
      )}

      {recipe.steps?.length > 0 && (
        <section>
          <h2>שלבי הכנה</h2>
          <ol style={{ paddingRight: "1.2rem" }}>
            {recipe.steps.map((step, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export default RecipeDetail;
