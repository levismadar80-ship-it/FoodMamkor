import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    api
      .get("/users/me/favorites")
      .then((res) => setFavorites(res.data))
      .catch(() => {});
  }, []);

  const removeFavorite = async (producerId) => {
    await api.delete(`/users/me/favorites/${producerId}`);
    setFavorites((prev) => prev.filter((f) => f.producer_id !== producerId));
  };

  return (
    <div className="recipes-page">
      <h1 style={{ color: "#2d6a4f", marginBottom: "1rem" }}>המועדפים שלי</h1>

      {favorites.length === 0 && <p>אין מועדפים עדיין</p>}

      {favorites.map((fav) => (
        <div key={fav.producer_id} className="producer-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Link to={`/producers/${fav.producer_id}`}>
              <h3>{fav.producer?.name}</h3>
              <div className="city">{fav.producer?.city}</div>
            </Link>
            <button className="fav-btn" onClick={() => removeFavorite(fav.producer_id)} title="הסר מהמועדפים">
              &#9829;
            </button>
          </div>
          <div className="categories">
            {fav.producer?.categories?.map((c) => (
              <span key={c.id} className="cat-tag">
                {c.emoji} {c.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default FavoritesPage;
