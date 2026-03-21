import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";

function ProducerDetail() {
  const { id } = useParams();
  const [producer, setProducer] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    api.get(`/producers/${id}`).then((res) => setProducer(res.data));
  }, [id]);

  const toggleFavorite = async () => {
    try {
      if (isFav) {
        await api.delete(`/users/me/favorites/${id}`);
        setIsFav(false);
      } else {
        await api.post(`/users/me/favorites/${id}`);
        setIsFav(true);
      }
    } catch {
      alert("יש להתחבר כדי לשמור מועדפים");
    }
  };

  if (!producer) return <div style={{ padding: "2rem" }}>טוען...</div>;

  const images = producer.images || [];
  const hasImages = images.length > 0;

  return (
    <div className="producer-detail">
      <Link to="/" className="back-link">&rarr; חזרה לדף הבית</Link>

      {hasImages && (
        <div className="gallery">
          <div className="gallery-main">
            <img src={images[currentImage]} alt={producer.name} />
            {images.length > 1 && (
              <>
                <button
                  className="gallery-nav gallery-prev"
                  onClick={() =>
                    setCurrentImage((prev) =>
                      prev > 0 ? prev - 1 : images.length - 1
                    )
                  }
                >
                  &#8250;
                </button>
                <button
                  className="gallery-nav gallery-next"
                  onClick={() =>
                    setCurrentImage((prev) =>
                      prev < images.length - 1 ? prev + 1 : 0
                    )
                  }
                >
                  &#8249;
                </button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="gallery-thumbs">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt=""
                  className={i === currentImage ? "active" : ""}
                  onClick={() => setCurrentImage(i)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="producer-header">
        <div>
          <h1>
            {producer.name}
            {producer.is_verified && (
              <span className="verified-badge">מאומת ע״י מהמקור</span>
            )}
          </h1>
        </div>
        <button
          className={`fav-btn-large ${isFav ? "active" : ""}`}
          onClick={toggleFavorite}
        >
          {isFav ? "❤" : "♡"} {isFav ? "נשמר" : "שמור למועדפים"}
        </button>
      </div>

      <p className="producer-description">{producer.description}</p>

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

      <section className="contact-section">
        <h2>יצירת קשר</h2>
        <div className="contact-buttons">
          {producer.phone && (
            <a href={`tel:${producer.phone}`} className="contact-btn phone">
              📞 טלפון
            </a>
          )}
          {producer.phone && (
            <a
              href={`https://wa.me/${producer.phone.replace(/[^0-9+]/g, "").replace(/^0/, "972")}`}
              target="_blank"
              rel="noreferrer"
              className="contact-btn whatsapp"
            >
              💬 ווטסאפ
            </a>
          )}
          {producer.instagram && (
            <a
              href={`https://instagram.com/${producer.instagram.replace("@", "")}`}
              target="_blank"
              rel="noreferrer"
              className="contact-btn instagram"
            >
              📷 אינסטגרם
            </a>
          )}
          {producer.website && (
            <a
              href={producer.website}
              target="_blank"
              rel="noreferrer"
              className="contact-btn website"
            >
              🌐 אתר
            </a>
          )}
        </div>
      </section>

      {producer.city && (
        <section>
          <h2>מיקום</h2>
          <p>
            {producer.city}{" "}
            <Link to={`/map`} className="map-link">
              הצג במפה
            </Link>
          </p>
        </section>
      )}

      {producer.delivery_areas?.length > 0 && (
        <section>
          <h2>משלוחים</h2>
          <table className="delivery-table">
            <thead>
              <tr>
                <th>עיר</th>
                <th>יום משלוח</th>
                <th>מינימום הזמנה</th>
              </tr>
            </thead>
            <tbody>
              {producer.delivery_areas.map((da) => (
                <tr key={da.id}>
                  <td>{da.city}</td>
                  <td>{da.delivery_day || "—"}</td>
                  <td>{da.min_order > 0 ? `${da.min_order}₪` : "ללא מינימום"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {producer.products?.length > 0 && (
        <section>
          <h2>מוצרים</h2>
          <div className="products-list">
            {producer.products.map((p) => (
              <div key={p.id} className="product-item">
                <span>{p.name}</span>
                <span className="product-price">{p.price_range}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default ProducerDetail;
