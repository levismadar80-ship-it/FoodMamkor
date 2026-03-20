import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import api from "../api/client";

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapPage() {
  const [producers, setProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [deliveryCity, setDeliveryCity] = useState("");

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data));
  }, []);

  useEffect(() => {
    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    if (deliveryCity) params.delivery_city = deliveryCity;
    api.get("/producers", { params }).then((res) => setProducers(res.data));
  }, [selectedCategory, deliveryCity]);

  const addFavorite = async (producerId) => {
    try {
      await api.post(`/users/me/favorites/${producerId}`);
      alert("נוסף למועדפים!");
    } catch {
      alert("יש להתחבר כדי לשמור מועדפים");
    }
  };

  return (
    <div className="map-page">
      <div className="sidebar">
        <h2>סינון עסקים</h2>

        <div className="filter-group">
          <label>עיר משלוח</label>
          <input
            type="text"
            placeholder="לדוגמה: תל אביב"
            value={deliveryCity}
            onChange={(e) => setDeliveryCity(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>קטגוריה</label>
          <div className="category-chips">
            <button
              className={`category-chip ${!selectedCategory ? "active" : ""}`}
              onClick={() => setSelectedCategory(null)}
            >
              הכל
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`category-chip ${
                  selectedCategory === cat.id ? "active" : ""
                }`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.emoji} {cat.name}
              </button>
            ))}
          </div>
        </div>

        <h2>תוצאות ({producers.length})</h2>
        {producers.map((p) => (
          <div key={p.id} className="producer-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Link to={`/producers/${p.id}`}>
                <h3>{p.name}</h3>
                <div className="city">{p.city}</div>
              </Link>
              <button className="fav-btn" onClick={() => addFavorite(p.id)}>
                &#9825;
              </button>
            </div>
            <div className="categories">
              {p.categories?.map((c) => (
                <span key={c.id} className="cat-tag">
                  {c.emoji} {c.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="map-container">
        <MapContainer
          center={[31.8, 35.0]}
          zoom={8}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {producers
            .filter((p) => p.lat && p.lng)
            .map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]}>
                <Popup>
                  <strong>{p.name}</strong>
                  <br />
                  {p.city}
                  <br />
                  <Link to={`/producers/${p.id}`}>לפרטים</Link>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default MapPage;
