"use client";

export default function Error({ reset }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <p className="text-6xl mb-6">😔</p>
      <h2 className="text-3xl font-bold mb-3">משהו השתבש</h2>
      <p className="text-text-secondary mb-8">
        אירעה שגיאה בלתי צפויה. אפשר לנסות שוב.
      </p>
      <button
        onClick={reset}
        className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-dark transition"
      >
        נסי שוב
      </button>
    </div>
  );
}
