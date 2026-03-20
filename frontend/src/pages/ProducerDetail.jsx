import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";

function ProducerDetail() {
  const { id } = useParams();
  const [producer, setProducer] = useState(null);

  useEffect(() => {
    api.get(`/producers/${id}`).then((res) => setProducer(res.data));
  }, [id]);

  if (!producer) return <div style={{ padding: "2rem" }}>טוען...</div>;

  return (
    <div className="producer-detail">
      <Link to="/" style={{ color: "#2d6a4f", fontSize: "0.9rem" }}>
        &rarr; חזרה למפה
      </Link>

      <h1>{producer.name}</h1>
      <div className="meta">
        {producer.city}
        {producer.is_verified && " | מאומת ✓"}
      </div>

      <p>{producer.description}</p>

      {producer.phone && (
        <p>
          טלפון: <a href={`tel:${producer.phone}`}>{producer.phone}</a>
        </p>
      )}
      {producer.instagram && <p>אינסטגרם: {producer.instagram}</p>}
      {producer.website && (
        <p>
          אתר:{" "}
          <a href={producer.website} target="_blank" rel="noreferrer">
            {producer.website}
          </a>
        </p>
      )}

      <section>
        <h2>קטגוריות</h2>
        <div className="categories" style={{ marginTop: "0.5rem" }}>
          {producer.categories?.map((c) => (
            <span key={c.id} className="cat-tag">
              {c.emoji} {c.name}
            </span>
          ))}
        </div>
      </section>

      {producer.products?.length > 0 && (
        <section>
          <h2>מוצרים</h2>
          {producer.products.map((p) => (
            <div key={p.id} className="product-item">
              <span>{p.name}</span>
              <span style={{ color: "#888" }}>{p.price_range}</span>
            </div>
          ))}
        </section>
      )}

      {producer.delivery_areas?.length > 0 && (
        <section>
          <h2>אזורי משלוח</h2>
          {producer.delivery_areas.map((da) => (
            <div key={da.id} className="delivery-item">
              <span>{da.city}</span>
              <span style={{ color: "#888" }}>
                {da.min_order > 0 ? `מינימום ${da.min_order}₪` : "ללא מינימום"}
                {da.delivery_day && ` | ${da.delivery_day}`}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default ProducerDetail;
