import { ButtonSpinner } from "mehamakor-frontend";

export function InButton() {
  return (
    <button
      type="button"
      disabled
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderRadius: 8,
        border: "none",
        background: "#2e6853",
        color: "#fffefb",
        fontWeight: 600,
        cursor: "not-allowed",
      }}
    >
      <ButtonSpinner />
      בשליחה...
    </button>
  );
}

export function Standalone() {
  return (
    <span style={{ color: "#2e6853" }}>
      <ButtonSpinner />
    </span>
  );
}

export function Large() {
  return (
    <span style={{ color: "#8b6914" }}>
      <ButtonSpinner size={40} />
    </span>
  );
}
