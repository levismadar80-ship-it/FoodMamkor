"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

function Confetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20,
      r: Math.random() * 6 + 3,
      color: ["#2e6853", "#4cb08b", "#F5F0E8", "#fbbf24", "#f87171"][Math.floor(Math.random() * 5)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.1,
    }));

    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    const timer = setTimeout(() => cancelAnimationFrame(frame), 4000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9990 }}
    />
  );
}

function progressPct(commits, min, max) {
  const denom = max || min;
  return Math.min(100, Math.round((commits / denom) * 100));
}

export default function GroupBuyDetailClient({ id }) {
  const t = useTranslations("group_buys.detail");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [gb, setGb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatusRef = useRef(null);

  const load = async () => {
    try {
      const r = await api.get(`/group-buys/${id}`);
      const data = r.data;
      // Trigger confetti when status transitions to funded
      if (prevStatusRef.current && prevStatusRef.current !== "funded" && data.status === "funded") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4500);
      }
      prevStatusRef.current = data.status;
      setGb(data);
    } catch {
      setGb(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (user?.phone && !phone) setPhone(user.phone);
  }, [user]);

  const handleCommit = async (e) => {
    e.preventDefault();
    if (!user) {
      router.push("/login");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api.post(`/group-buys/${id}/commit`, { quantity, phone: phone || undefined });
      await load();
      if (gb?.status === "funded" || prevStatusRef.current === "funded") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4500);
      }
    } catch (err) {
      setError(err.response?.data?.detail || t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm(t("cancel_confirm"))) return;
    setCancelling(true);
    try {
      await api.delete(`/group-buys/${id}/commit`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || t("errors.cancel_failed"));
    } finally {
      setCancelling(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-fg-muted">
        {t("loading")}
      </div>
    );
  }

  if (!gb) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-lg font-medium text-text">{t("not_found_title")}</p>
        <Link href="/group-buys" className="text-primary hover:underline mt-4 inline-block">
          {t("back_to_list")}
        </Link>
      </div>
    );
  }

  const funded = gb.status === "funded";
  const fulfilled = gb.status === "fulfilled";
  const cancelled = gb.status === "cancelled";
  const open = gb.status === "open";
  const expired = new Date(gb.deadline) < new Date();
  const pct = progressPct(gb.commits_count, gb.min_participants, gb.max_participants);
  const discount = Math.round(
    ((Number(gb.price_per_unit_regular) - Number(gb.price_per_unit_group)) /
      Number(gb.price_per_unit_regular)) *
      100,
  );
  const waShareText = encodeURIComponent(
    t("share_text", {
      title: gb.title,
      city: gb.city || t("share_default_region"),
      id,
    }),
  );

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Back */}
        <Link href="/group-buys" className="text-sm text-primary hover:underline mb-6 inline-block">
          {t("back_to_list_arrow")}
        </Link>

        {/* Funded banner */}
        {funded && (
          <div className="mb-6 rounded-[12px] bg-primary text-white px-5 py-4 text-center">
            <p className="text-xl font-bold">{t("funded_title")}</p>
            <p className="text-sm mt-1 opacity-90">
              {t("funded_subtitle", { name: gb.producer_name })}
            </p>
          </div>
        )}
        {cancelled && (
          <div className="mb-6 rounded-[12px] bg-border px-5 py-3 text-center text-fg-muted text-sm">
            {t("cancelled")}
          </div>
        )}
        {fulfilled && (
          <div className="mb-6 rounded-[12px] bg-green-50 border border-primary/20 px-5 py-3 text-center text-primary text-sm font-medium">
            {t("fulfilled")}
          </div>
        )}

        <div className="bg-white rounded-[16px] border border-border shadow-sm p-6 md:p-8">
          {/* Header */}
          <div className="mb-4">
            {gb.city && (
              <span className="text-xs bg-green-50 text-primary px-2 py-0.5 rounded-full">
                {gb.city}
              </span>
            )}
            <h1 className="font-headline text-2xl font-bold text-text mt-2 mb-1">
              {gb.title}
            </h1>
            {gb.producer_name && (
              <p className="text-sm text-fg-muted">{t("by_producer", { name: gb.producer_name })}</p>
            )}
            {gb.description && (
              <p className="text-sm text-text mt-3 leading-relaxed">{gb.description}</p>
            )}
          </div>

          {/* Price */}
          <div className="flex items-center gap-3 mb-4 p-4 rounded-[12px] bg-green-50">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">
                  ₪{Number(gb.price_per_unit_group).toFixed(0)}
                </span>
                <span className="text-fg-muted line-through text-lg">
                  ₪{Number(gb.price_per_unit_regular).toFixed(0)}
                </span>
                {gb.unit && <span className="text-sm text-fg-muted">{t("unit_suffix", { unit: gb.unit })}</span>}
              </div>
              <p className="text-xs text-fg-muted mt-0.5">
                {t("discount_hint", { discount })}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium text-text">
                {t("progress_label", { commits: gb.commits_count, min: gb.min_participants })}
              </span>
              <span className="text-fg-muted text-xs">
                {pct}%
              </span>
            </div>
            <div className="w-full bg-border rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${funded || fulfilled ? "bg-primary" : "bg-primary/50"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {!expired && open && (
              <p className="text-xs text-fg-muted mt-1.5">
                {t("remaining_to_open", { n: Math.max(0, gb.min_participants - gb.commits_count) })}
              </p>
            )}
            <p className="text-xs text-fg-muted mt-1">
              {t("deadline_prefix", { date: new Date(gb.deadline).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) })}
            </p>
          </div>

          {/* Commit form */}
          {open && !expired && !gb.user_committed && (
            <form onSubmit={handleCommit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("quantity_label")}</label>
                <input
                  type="number"
                  min={1}
                  max={gb.max_participants || 100}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full border border-border rounded-[10px] px-3 py-2 text-right"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("phone_label")}</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("phone_placeholder")}
                  className="w-full border border-border rounded-[10px] px-3 py-2"
                  dir="ltr"
                />
              </div>
              {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
              >
                {submitting ? t("submitting") : user ? t("submit_join") : t("submit_login")}
              </button>
              {!user && (
                <p className="text-center text-xs text-fg-muted">
                  {t("login_required")}
                </p>
              )}
            </form>
          )}

          {/* Already committed */}
          {gb.user_committed && (
            <div className="space-y-3">
              <div className="rounded-[12px] bg-[#EAF3DE] border border-primary/20 px-4 py-3 text-primary text-sm font-medium text-center">
                {t("committed_confirm")}
                {gb.user_commit?.quantity > 1 && t("committed_units", { count: gb.user_commit.quantity })}
              </div>
              {open && !expired && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full text-sm text-fg-muted hover:text-red-500 transition text-center"
                >
                  {cancelling ? t("cancelling") : t("cancel_cta")}
                </button>
              )}
            </div>
          )}

          {expired && open && (
            <div className="rounded-[12px] bg-border px-4 py-3 text-fg-muted text-sm text-center">
              {t("deadline_passed")}
            </div>
          )}

          {/* WhatsApp share */}
          <div className="mt-6 pt-5 border-t border-border">
            <a
              href={`https://wa.me/?text=${waShareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp-outline flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] text-sm font-medium"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t("share_wa")}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
