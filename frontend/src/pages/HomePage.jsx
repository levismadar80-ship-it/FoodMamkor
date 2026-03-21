import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";

function HomePage() {
  const [producers, setProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [searchText, setSearchText] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data));
  }, []);

  useEffect(() => {
    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    if (deliveryOnly && cityFilter) params.delivery_city = cityFilter;
    api.get("/producers", { params }).then((res) => setProducers(res.data));
  }, [selectedCategory, cityFilter, deliveryOnly]);

  const filtered = producers.filter((p) => {
    if (searchText) {
      const s = searchText.toLowerCase();
      const match =
        p.name.toLowerCase().includes(s) ||
        p.city?.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s);
      if (!match) return false;
    }
    if (cityFilter && !deliveryOnly) {
      if (!p.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false;
    }
    return true;
  });

  const addFavorite = async (e, producerId) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.post(`/users/me/favorites/${producerId}`);
      alert("נוסף למועדפים!");
    } catch {
      alert("יש להתחבר כדי לשמור מועדפים");
    }
  };

  const showOnMap = () => {
    const params = new URLSearchParams();
    if (selectedCategory) params.set("category", selectedCategory);
    if (cityFilter) params.set("city", cityFilter);
    navigate(`/map?${params.toString()}`);
  };

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1>מהמקור</h1>
        <p className="home-subtitle">אוכל אמיתי, ישר מהמקור אליך</p>
        <div className="home-search">
          <input
            type="text"
            placeholder="חיפוש עסק, מוצר או עיר..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      <div className="home-filters">
        <div className="filter-item">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value || "")}
          >
            <option value="">כל הקטגוריות</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.emoji} {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <input
            type="text"
            placeholder="עיר..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          />
        </div>
        <div className="filter-item filter-checkbox">
          <label>
            <input
              type="checkbox"
              checked={deliveryOnly}
              onChange={(e) => setDeliveryOnly(e.target.checked)}
            />
            יש משלוחים בלבד
          </label>
        </div>
        <button className="btn btn-outline" onClick={showOnMap}>
          הצג במפה
        </button>
      </div>

      <div className="home-results-count">
        {filtered.length} עסקים נמצאו
      </div>

      <div className="home-grid">
        {filtered.map((p) => (
          <Link
            to={`/producers/${p.id}`}
            key={p.id}
            className="home-card"
          >
            <div className="home-card-img">
              {p.images && p.images.length > 0 ? (
                <img src={p.images[0]} alt={p.name} />
              ) : (
                <div className="home-card-placeholder">
                  {p.categories?.[0]?.emoji || "🌿"}
                </div>
              )}
            </div>
            <div className="home-card-body">
              <div className="home-card-header">
                <h3>{p.name}</h3>
                {p.is_verified && <span className="verified-badge">מאומת</span>}
              </div>
              <div className="home-card-city">{p.city}</div>
              <div className="home-card-categories">
                {p.categories?.map((c) => (
                  <span key={c.id} className="cat-tag">
                    {c.emoji} {c.name}
                  </span>
                ))}
              </div>
              <button
                className="fav-btn home-fav"
                onClick={(e) => addFavorite(e, p.id)}
              >
                &#9825;
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default HomePage;
