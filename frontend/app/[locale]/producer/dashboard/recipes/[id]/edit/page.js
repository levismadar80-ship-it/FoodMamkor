"use client";

/**
 * Producer recipe edit page — MEH-590 chunk 3/4.
 *
 * Loads the recipe via GET /producers/me/recipes/{id} (404 if not own)
 * and renders <RecipeForm mode="edit">. On save, navigates back to the
 * recipes list.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import RecipeForm from "@/components/RecipeForm";

export default function EditRecipePage() {
  const t = useTranslations("recipes.edit");
  const router = useRouter();
  const params = useParams();
  const recipeId = params?.id;
  const { user, loading: authLoading } = useAuth();
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api
      .get(`/producers/me/recipes/${recipeId}`)
      .then((r) => setRecipe(r.data))
      .catch(() => setError(t("not_found")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, recipeId]);

  if (authLoading || !user) return null;

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          href="/producer/dashboard/recipes"
          className="text-sm text-primary hover:underline"
        >
          {t("back")}
        </Link>
        <p className="mt-4 text-fg-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/producer/dashboard/recipes"
        className="text-sm text-primary hover:underline"
      >
        {t("back")}
      </Link>
      <h1 className="font-headline text-2xl font-bold text-site-text mt-1 mb-6">
        {t("heading")}
      </h1>
      {recipe ? (
        <RecipeForm
          mode="edit"
          initial={recipe}
          onSaved={() => router.push("/producer/dashboard/recipes")}
          onCancel={() => router.push("/producer/dashboard/recipes")}
        />
      ) : (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      )}
    </div>
  );
}
