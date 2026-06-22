import { Input } from "mehamakor-frontend";

const wrap: React.CSSProperties = { maxWidth: 340 };

export function WithLabel() {
  return (
    <div style={wrap}>
      <Input label="שם העסק" placeholder="לדוגמה: מאפיית הבוקר" />
    </div>
  );
}

export function WithHelper() {
  return (
    <div style={wrap}>
      <Input
        type="email"
        label="אימייל"
        placeholder="name@example.com"
        helperText="לא נשתף את הכתובת עם אף אחד"
      />
    </div>
  );
}

export function WithError() {
  return (
    <div style={wrap}>
      <Input
        type="tel"
        label="טלפון ליצירת קשר"
        placeholder="050-0000000"
        error="מספר טלפון לא תקין"
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={wrap}>
      <Input
        label="מספר עוסק מורשה"
        value="514237890"
        disabled
        helperText="ננעל לאחר אימות"
      />
    </div>
  );
}
