import React from "react";
import { Link } from "react-router-dom";

function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-hero">
        <h1>מהמקור</h1>
        <p>אוכל אמיתי, ישר מהמקור אליך</p>
      </div>

      <section className="about-section">
        <h2>הסיפור שלנו</h2>
        <p>
          בישראל יש עשרות יצרני אוכל בריא, חקלאים אורגניים, מגדלי בשר grass-fed,
          אופי מחמצת ויוצרי מוצרי טיפוח טבעיים — אבל כולם מפוזרים בקבוצות ווטסאפ,
          עמודי אינסטגרם ובפורומים סגורים.
        </p>
        <p>
          מהמקור נוצרה כדי לפתור בדיוק את הבעיה הזו — פלטפורמה אחת שמרכזת את כל
          היצרנים האמיתיים, עם מפה אינטראקטיבית, סינון לפי עיר ומשלוחים, ומדור
          מתכונים שמקשר ישירות ליצרנים.
        </p>
      </section>

      <section className="about-section">
        <h2>הערכים שלנו</h2>
        <div className="about-values">
          <div className="about-value-card">
            <span className="about-value-icon">🚫</span>
            <h3>ללא מעובד</h3>
            <p>אוכל אמיתי בלבד — ללא שמנים מזוקקים, ללא סוכר מוסף, ללא תוספים תעשייתיים</p>
          </div>
          <div className="about-value-card">
            <span className="about-value-icon">🔍</span>
            <h3>חומרי גלם מזוהים</h3>
            <p>יודעים בדיוק מאיפה הגיעו חומרי הגלם — שקיפות מלאה</p>
          </div>
          <div className="about-value-card">
            <span className="about-value-icon">🏡</span>
            <h3>ייצור קטן</h3>
            <p>ייצור ביתי, חקלאי או בוטיק — לא תעשייתי</p>
          </div>
          <div className="about-value-card">
            <span className="about-value-icon">🌱</span>
            <h3>טרי ואמיתי</h3>
            <p>מוצרים טריים שמגיעים ישירות מהיצרן אליכם</p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h2>קריטריוני הכניסה</h2>
        <p>כל עסק שנרשם לפלטפורמה עובר אישור ידני. הקריטריונים שלנו:</p>
        <ul className="about-criteria">
          <li>ללא אוכל מעובד או תעשייתי</li>
          <li>חומרי גלם מזוהים — יודעים מאיפה הגיע</li>
          <li>ייצור קטן, ביתי או חקלאי</li>
          <li>טרי ואמיתי</li>
          <li>ללא שמנים מזוקקים וללא סוכר מוסף</li>
        </ul>
      </section>

      <section className="about-cta">
        <h2>את/ה יצרן/ית?</h2>
        <p>הצטרפו לקהילת היצרנים של מהמקור — חינם, פשוט ומהיר</p>
        <Link to="/register/producer" className="btn btn-primary btn-lg">
          הצטרף כיצרן
        </Link>
      </section>
    </div>
  );
}

export default AboutPage;
