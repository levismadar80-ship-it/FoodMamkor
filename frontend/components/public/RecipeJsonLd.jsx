/**
 * RecipeJsonLd — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * Emits a schema.org/Recipe JSON-LD <script> block for search engines.
 * Splits `ingredients` and `instructions` by newline so each line
 * becomes a separate `recipeIngredient` / `recipeInstructions` entry.
 *
 * Validation: paste the output of buildRecipeSchema() into
 * https://validator.schema.org — the schema must pass.
 *
 * Server-component-safe: pure props → string. No React hooks.
 */

const ISO_MIN_LIMIT = 1440; // matches the Pydantic ge/le on prep/cook fields.

function minutesToIso8601(minutes) {
  // Schema.org expects an ISO 8601 duration. PnDTnHnMnS — we only ever
  // emit PT<H>H<M>M because recipes don't span days. Drop zero parts so
  // PT30M (not PT0H30M) — validator accepts both, the shorter form is
  // friendlier to crawlers.
  if (!minutes || minutes <= 0 || minutes > ISO_MIN_LIMIT) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  let out = "PT";
  if (h) out += `${h}H`;
  if (m) out += `${m}M`;
  return out === "PT" ? null : out;
}

function splitLines(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildRecipeSchema({ recipe, producerName, canonicalUrl }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description || undefined,
    image: recipe.image_url || undefined,
    author: producerName
      ? { "@type": "Organization", name: producerName }
      : undefined,
    recipeIngredient: splitLines(recipe.ingredients),
    recipeInstructions: splitLines(recipe.instructions).map((step) => ({
      "@type": "HowToStep",
      text: step,
    })),
    prepTime: minutesToIso8601(recipe.prep_time_min),
    cookTime: minutesToIso8601(recipe.cook_time_min),
    recipeYield: recipe.servings ? String(recipe.servings) : undefined,
    url: canonicalUrl,
    inLanguage: "he-IL",
  };
  // Strip undefined keys for a clean serialization.
  return Object.fromEntries(
    Object.entries(schema).filter(([, v]) => v !== undefined)
  );
}

export default function RecipeJsonLd({ recipe, producerName, canonicalUrl }) {
  const schema = buildRecipeSchema({ recipe, producerName, canonicalUrl });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
