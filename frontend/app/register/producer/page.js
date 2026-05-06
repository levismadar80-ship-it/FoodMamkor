"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Leaf, WhatsappLogo } from "@phosphor-icons/react";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
import CategoryRequestModal from "@/components/CategoryRequestModal";
import CategorySelector from "@/components/CategorySelector";
import PasswordStrength from "@/components/PasswordStrength";
import ProducerOAuthButtons from "@/components/ProducerOAuthButtons";
import { passwordValid, validateIsraeliPhone, validateEmail } from "@/lib/validators";
import { useAuth } from "@/lib/auth-context";

const DRAFT_KEY = "producer_registration_draft";

const EMPTY_FORM = {
  email: "", name: "", password: "",
  producer_name: "", phone: "",
  category_ids: [],
  gluten_free: false,
  vegan: false,
  lactose_free: false,
};

export default function RegisterProducerPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-12 text-center text-site-muted">טוען טופס הרשמה...</div>}>
      <RegisterProducerPageBody />
    </Suspense>
  );
}

function RegisterProducerPageBody() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillToken = params.get("prefill");
  const { user, loading: authLoading, refreshUser } = useAuth();
  // MEH-143: if already logged in, skip account-creation step.
  const isUpgrade = !!user;
  // Initialize step from localStorage token so there's no flicker — auth
  // context loads async, but the token presence is synchronous.
  // Wrapped in try/catch — localStorage can throw on quota / private-mode.
  const [step, setStep] = useState(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("token")) return 2;
    } catch {
      // private browsing / storage disabled — fall through to step 1
    }
    return 1;
  });
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stepError, setStepError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [emailExistsWarning, setEmailExistsWarning] = useState("");
  const [emailExistsSubmitError, setEmailExistsSubmitError] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  // MEH-287: true when server confirms Twilio config is present (WhatsApp
  // expected to arrive). False → show dashboard-fallback banner on step 3.
  const [whatsappSent, setWhatsappSent] = useState(true);

  // Sync step when auth resolves (user may load after initial render).
  useEffect(() => {
    if (isUpgrade && step === 1) setStep(2);
  }, [isUpgrade]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.producer_name || parsed.name || parsed.email) setShowDraftBanner(true);
      }
    } catch {}
  }, []);

  // MEH-22: admin-minted prefill token
  useEffect(() => {
    if (!prefillToken || prefillApplied) return;
    api
      .get(`/register/producer/prefill/${prefillToken}`)
      .then((r) => {
        const d = r.data || {};
        setForm((prev) => ({
          ...prev,
          producer_name: d.name ?? prev.producer_name,
          phone: d.phone ?? prev.phone,
        }));
        setPrefillApplied(true);
      })
      .catch(() => setPrefillApplied(true));
  }, [prefillToken, prefillApplied]);

  const saveDraft = (updated) => {
    try {
      const { password, ...safe } = updated;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
    } catch {}
  };

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate shape — reject anything that isn't a plain object,
        // or that has a non-array category_ids. Drop garbage drafts so
        // we don't merge stale schemas (e.g. from before category_ids
        // existed) into form state.
        const shapeOk =
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed.category_ids === undefined || Array.isArray(parsed.category_ids));
        if (shapeOk) {
          setForm((prev) => ({ ...prev, ...parsed }));
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // Bad JSON or storage disabled — clear and ignore.
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }
    setShowDraftBanner(false);
  };

  // Functional updater + draft save in one step. Used for every field —
  // text inputs, checkboxes, multi-select category list — so draft
  // persistence covers all writes uniformly (previously only text inputs
  // hit saveDraft, so checkboxes/categories were silently lost on refresh).
  // saveDraft is called inside the updater; in React strict mode the
  // updater can run twice — localStorage writes are idempotent so the
  // duplicate write is harmless.
  const setAndSave = (updater) => {
    setForm((prev) => {
      const next = updater(prev);
      saveDraft(next);
      return next;
    });
  };

  const set = (field) => (e) => {
    const value = e.target.value;
    if (field === "email") setEmailExistsSubmitError(false);
    setAndSave((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCategory = (id) => {
    setAndSave((prev) => ({
      ...prev,
      category_ids: prev.category_ids.includes(id)
        ? prev.category_ids.filter((c) => c !== id)
        : [...prev.category_ids, id],
    }));
  };

  const handleEmailBlur = async () => {
    // Clear stale warning first — covers the case where the user erased
    // the email after a previous "exists" check; the early return below
    // would otherwise leave the warning stuck on screen.
    setEmailExistsWarning("");
    if (!form.email || !validateEmail(form.email)) return;
    try {
      const res = await api.get(`/auth/email-exists?email=${encodeURIComponent(form.email)}`);
      if (res.data?.exists) {
        setEmailExistsWarning(
          "האימייל הזה כבר רשום. התחברי לחשבון שלך — ותוכלי להוסיף עסק ישירות מדף ההרשמה."
        );
      }
    } catch {
      // Network/API failure — leave the warning cleared (nothing to show).
    }
  };

  const handleSubmit = async () => {
    setError("");
    setEmailExistsSubmitError(false);
    setLoading(true);
    try {
      const body = {
        producer_name: form.producer_name,
        phone: form.phone,
        category_ids: form.category_ids,
        gluten_free: form.gluten_free,
        vegan: form.vegan,
        lactose_free: form.lactose_free,
        primary_contact_method: "whatsapp",
      };
      // MEH-143: logged-in users upgrade; account fields not needed.
      if (!isUpgrade) {
        body.email = form.email;
        body.name = form.name;
        body.password = form.password;
      }
      const res = await api.post("/auth/register/producer", body);
      localStorage.setItem("token", res.data.access_token);
      localStorage.removeItem(DRAFT_KEY);
      // MEH-287: default true for older servers that don't return the flag.
      setWhatsappSent(res.data.whatsapp_sent ?? true);
      // Refresh auth context so user.role reflects the upgrade immediately.
      await refreshUser();
      setStep(3);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 409) {
        if (isUpgrade) {
          setError("כבר יש לך עסק רשום בחשבון זה.");
        } else {
          setEmailExistsSubmitError(true);
        }
      } else {
        setError(detail || "שגיאת תקשורת — נסי שוב.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Don't show step 1 (account form) until we know whether user is logged in —
  // prevents the flash of email/password inputs for already-authenticated users.
  if (authLoading && step === 1) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-site-muted">טוען...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="bg-white rounded-[12px] p-8">
        <h1 className="font-headline text-2xl font-bold text-site-text mb-2 text-center">תני לעסק שלך בית</h1>
        <p className="text-site-muted text-center mb-4">5 דקות. בלי עמלות. בלי מתווכים.</p>

        {/* MEH-143: logged-in upgrade banner */}
        {isUpgrade && step < 3 && (
          <div className="bg-light border border-primary/30 rounded-[12px] px-4 py-3 mb-4 text-sm text-site-text flex items-start gap-2">
            <Leaf size={16} weight="duotone" className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="block">את מחוברת עם {user.email}</span>
              <span className="block">העסק יצורף לחשבון הזה</span>
            </span>
          </div>
        )}

        {showDraftBanner && step < 3 && (
          <div className="bg-light border border-primary/20 rounded-[12px] px-4 py-3 mb-4 flex items-center justify-between text-sm">
            <span className="text-site-text">שמרנו טיוטה ממילוי קודם — רוצה להמשיך?</span>
            <div className="flex gap-3">
              <button onClick={restoreDraft} className="text-primary font-medium hover:underline">כן, המשך</button>
              <button onClick={() => setShowDraftBanner(false)} className="text-site-muted hover:text-site-text">לא</button>
            </div>
          </div>
        )}

        {step < 3 && !isUpgrade && (
          <div className="flex gap-2 mb-8">
            {[1, 2].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-gray-200"}`} />
            ))}
          </div>
        )}

        {prefillToken && prefillApplied && (
          <div className="bg-light text-primary border border-primary/30 rounded-[12px] p-3 mb-4 text-sm inline-flex items-center gap-2">
            <Leaf size={16} weight="duotone" aria-hidden="true" className="shrink-0" />
            מילאנו עבורך את פרטי העסק — אפשר לעדכן כל שדה לפני המשך.
          </div>
        )}

        {/* Step 1: Account */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">1. פרטי חשבון</h2>

            {/* MEH-170 — Step 0 OAuth on top. Unmounts gracefully when
                no Google/Apple client_id is configured. */}
            <ProducerOAuthButtons
              onSuccess={async () => {
                await refreshUser();
                setStep(2);
              }}
              onError={(msg, meta) => {
                if (meta?.redirectToLogin) {
                  router.push(`/login?redirect=${encodeURIComponent("/register/producer")}`);
                  return;
                }
                setStepError(msg);
              }}
            />

            <h3 className="text-sm font-medium text-site-muted pt-2">הרשמה עם אימייל</h3>

            <input
              placeholder="שם מלא *"
              value={form.name}
              onChange={set("name")}
              className="w-full border rounded-[12px] ps-3 pe-3 py-2 text-right"
              dir="rtl"
            />
            <input
              type="email"
              placeholder="אימייל *"
              value={form.email}
              onChange={set("email")}
              onBlur={handleEmailBlur}
              className="w-full border rounded-[12px] px-3 py-2"
              dir="ltr"
            />
            {emailExistsWarning && (
              <p className="text-amber-600 text-xs mt-1">
                יש לך כבר חשבון במהמקור.{" "}
                <Link
                  href={`/login?email=${encodeURIComponent(form.email || "")}`}
                  className="underline font-medium hover:text-amber-700"
                >
                  התחברי ←
                </Link>
                {" "}והוסיפי את העסק שלך
              </p>
            )}
            <div>
              <input
                type="password"
                placeholder="סיסמה *"
                value={form.password}
                onChange={set("password")}
                className="w-full border rounded-[12px] px-3 py-2"
                dir="ltr"
                minLength={8}
              />
              <PasswordStrength password={form.password} />
            </div>
            {stepError && <p className="text-red-500 text-sm">{stepError}</p>}
            <button
              onClick={() => {
                if (!form.name || !form.email || !form.password) {
                  setStepError("יש למלא את כל שדות החובה");
                  return;
                }
                if (!validateEmail(form.email)) {
                  setStepError("אימייל לא תקין");
                  return;
                }
                if (!passwordValid(form.password)) {
                  setStepError("הסיסמה חייבת להכיל לפחות 8 תווים, אות גדולה ומספר");
                  return;
                }
                setStepError("");
                setStep(2);
              }}
              className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition"
            >
              הבא →
            </button>
          </div>
        )}

        {/* Step 2: Business basics */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">2. פרטי העסק</h2>
            <p className="text-sm text-site-muted">
              3 שדות בלבד — תשלימי את שאר הפרטים מהדשבורד אחרי האישור.
            </p>

            <input
              placeholder="שם העסק *"
              value={form.producer_name}
              onChange={set("producer_name")}
              className="w-full border rounded-[12px] ps-3 pe-3 py-2 text-right"
              dir="rtl"
            />

            <div>
              <input
                placeholder="טלפון WhatsApp * (0501234567)"
                value={form.phone}
                onChange={set("phone")}
                className={`w-full border rounded-[12px] px-3 py-2 ${
                  form.phone && !validateIsraeliPhone(form.phone) ? "border-red-400" : ""
                }`}
                dir="ltr"
              />
              {form.phone && !validateIsraeliPhone(form.phone) && (
                <p className="text-xs text-red-500 mt-1">❌ מספר טלפון לא תקין</p>
              )}
              {form.phone && validateIsraeliPhone(form.phone) && (
                <p className="text-xs text-primary mt-1">✓ מספר תקין</p>
              )}
              <p className="text-xs text-site-muted mt-1">
                נשלח לך הודעת WhatsApp לאישור ולהשלמת הפרופיל
              </p>
            </div>

            <CategorySelector
              categories={categories}
              selectedIds={form.category_ids}
              onChange={toggleCategory}
              onRequestCategory={() => setShowCategoryModal(true)}
            />

            {/* Dietary labels */}
            <div>
              <p className="text-sm font-medium text-site-text mb-2">סימוני תזונה (אופציונלי)</p>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gluten_free}
                    onChange={(e) => setAndSave((prev) => ({ ...prev, gluten_free: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  🌾 ללא גלוטן
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.vegan}
                    onChange={(e) => setAndSave((prev) => ({ ...prev, vegan: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  🥦 טבעוני
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.lactose_free}
                    onChange={(e) => setAndSave((prev) => ({ ...prev, lactose_free: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  🥛 ללא לקטוז
                </label>
              </div>
            </div>

            {/* Legal consent — Israeli Consumer Protection Law + food license declaration */}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0"
                required
              />
              <span className="leading-relaxed text-site-muted">
                קראתי ואני מסכימה{" "}
                <a href="/terms" target="_blank" className="text-primary hover:underline">לתנאי השימוש</a>{" "}
                ו<a href="/privacy" target="_blank" className="text-primary hover:underline">למדיניות הפרטיות</a>,
                ומצהירה שיש ברשותי את כל הרישיונות הנדרשים למכירת המוצרים לפי חוק רישוי עסקים.
              </span>
            </label>

            {emailExistsSubmitError && (
              <p className="text-sm text-amber-700 mt-2">
                האימייל הזה כבר רשום אצלנו.{" "}
                <Link
                  href={`/login?email=${encodeURIComponent(form.email || "")}`}
                  className="underline font-medium"
                >
                  התחברי
                </Link>
              </p>
            )}
            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              {!isUpgrade && (
                <button onClick={() => { setStepError(""); setError(""); setEmailExistsSubmitError(false); setStep(1); }} className="text-text-secondary">שלב קודם</button>
              )}
              <button
                onClick={() => {
                  // Clear stale error first so the next failure renders a
                  // visible reset (otherwise the same error text appears
                  // to "stick" across submit attempts even after the user
                  // fixes one field).
                  setError("");
                  if (!form.producer_name) {
                    setError("יש למלא שם עסק");
                    return;
                  }
                  if (!form.phone || !validateIsraeliPhone(form.phone)) {
                    setError("יש למלא מספר טלפון תקין");
                    return;
                  }
                  if (form.category_ids.length === 0) {
                    setError("יש לבחור לפחות קטגוריה אחת");
                    return;
                  }
                  if (!agreedToTerms) {
                    setError("יש לאשר את תנאי השימוש לפני ההצטרפות");
                    return;
                  }
                  handleSubmit();
                }}
                disabled={loading}
                className="flex-1 bg-secondary text-white py-3 rounded-[12px] hover:bg-secondary-light transition font-medium disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <ButtonSpinner />
                    שולחת...
                  </span>
                ) : (
                  "הצטרפי →"
                )}
              </button>
            </div>
          </div>
        )}

      <CategoryRequestModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        producerId={null}
      />

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="text-center py-8">
            <div className="mb-4 flex justify-center">
              <CheckCircle size={64} weight="fill" className="text-primary" aria-hidden="true" />
            </div>
            <h2 className="font-headline text-2xl font-bold text-site-text mb-2">הצטרפת!</h2>
            <p className="text-site-muted mb-6">
              {whatsappSent
                ? "שלחנו לך הודעת WhatsApp עם קישור להשלמת הפרופיל. הבקשה ממתינה לאישור — בדרך כלל תוך 1-2 ימי עסקים."
                : "הרשמה הושלמה! השלימי את הפרופיל ישירות מהדשבורד. הבקשה ממתינה לאישור — בדרך כלל תוך 1-2 ימי עסקים."}
            </p>
            {!whatsappSent && (
              <div
                role="status"
                className="bg-amber-50 border border-amber-200 text-amber-900 rounded-[12px] px-4 py-3 mb-6 text-sm text-end"
              >
                לא קיבלת הודעת WhatsApp? ייתכן שמספר הטלפון שגוי, או שתוכלי להמשיך ולהשלים את הפרופיל ישירות מהדשבורד.
              </div>
            )}
            <div className="bg-light rounded-[16px] p-5 text-right mb-6">
              <h3 className="font-semibold text-site-text mb-3">מה הלאה?</h3>
              <ul className="text-sm text-site-muted space-y-2">
                <li>✓ השלימי את הפרופיל מהדשבורד — תמונות, תיאור, משלוחים</li>
                <li>✓ הצוות שלנו יבדוק את הבקשה תוך 1-2 ימי עסקים</li>
                <li>✓ אחרי האישור — העסק יופיע במפה ובחיפוש</li>
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push("/producer/dashboard")}
                className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium text-sm"
              >
                לדשבורד שלי ←
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  "היי 🌿 הצטרפתי עכשיו למהמקור — אתר ישראלי שמחבר בתי עסק מקומיים עם קונות שמחפשות אוכל אמיתי. מוזמנת להצטרף: https://mehamakor.online/register/producer"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm"
              >
                <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
                הזמיני שכנה
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
