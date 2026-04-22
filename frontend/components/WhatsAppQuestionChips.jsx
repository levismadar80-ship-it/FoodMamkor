import { normalizePhone, getWhatsAppHref } from "@/lib/utils";
import { getProducerQuestions } from "@/lib/categoryQuestions";

export default function WhatsAppQuestionChips({ producer }) {
  const digits = normalizePhone(producer?.phone);
  if (!digits) return null;

  const city = producer.city || "האזור שלי";
  const name = producer.name || "";

  const questions = getProducerQuestions(producer).map((q) => q.replace("[עיר]", city));

  return (
    <div className="mb-3">
      <p className="text-xs mb-2 font-body" style={{ color: "#6B6B6B" }}>
        שאלי אותנו:
      </p>
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => {
          const href = getWhatsAppHref(digits, `שלום ${name}, ${q}`);
          return (
            <a
              key={q}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-body text-primary transition hover:bg-light"
              style={{
                border: "1px solid #e8e0d0",
                borderRadius: "20px",
                padding: "6px 12px",
                fontSize: "12px",
              }}
            >
              {q}
            </a>
          );
        })}
      </div>
    </div>
  );
}
