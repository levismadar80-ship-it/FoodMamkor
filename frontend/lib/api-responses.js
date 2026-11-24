// @ts-check
/**
 * Module:   api-responses
 * Purpose:  The response schemas the app's non-map call sites parse with
 *           (workflow rule 19), taken from the GENERATED schemas in
 *           lib/generated/api.zod.js under the names the call sites use.
 * Does NOT: declare a single response field. Every schema here is a generated
 *           one, a `pick` of one, a generated one with an extra `check`, or one
 *           whose existing key gets a looser check (`safeExtend`, the invite
 *           email and the saved-items envelope — each says why).
 *           That is the point of the file: a hand-written field list is what
 *           stripped fields silently seven times (MEH-826 … MEH-1719), and
 *           `ApiResponsesNoFieldLists.test.js` fails if one comes back here.
 *           The producer feed schemas of the grid and /map stay in
 *           lib/schemas.js, as do the request-side schemas (Sapir's 14/08
 *           ruling on MEH-1748 keeps the request side hand-written).
 * Related:  lib/generated/api.zod.js (orval, from backend/openapi.json —
 *           never edited by hand; scripts/checks/openapi-codegen-drift-guard.sh)
 * History:  MEH-1748 (replaces the hand-written lib/api-schemas.js)
 *
 * WHY `pick` in three places
 *   A call site that reads two fields of a large response would otherwise fail
 *   on any of the other fields — and for a write that already succeeded
 *   (ProducerAdminCreatedSchema, DraftProductSchema) that would show an error
 *   for a business or product that was in fact created. `pick` keeps the
 *   generated type of the fields it names, so the field list is still the
 *   backend's, not ours.
 *
 * WHY every derived schema carries a @__PURE__ mark
 *   A call at module level (`X.check(...)`, `zod.pick(...)`) may be kept by a
 *   bundler even when nothing imports its result, keeping every generated
 *   schema it touches alive with it. The generated file marks its own schemas
 *   the same way (orval `variant: 'mini'`). Measured on `next build` 20/11
 *   (gz of each route's client chunks, branch vs staging): /producers +4.2 KB,
 *   /claim +1.9 KB, /about +1.9 KB, home −1.3 KB, /favorites −2.5 KB,
 *   /group-buys/[id] −2.5 KB — inside MEH-1748's +5 KB gate for /producers.
 *
 * WHY the extra checks
 *   The backend contract says `url: str`; the screens copy that URL into a chat
 *   or a clipboard, so an empty or non-URL string must route to the error
 *   state. Same for a name that becomes a page heading. These are rules about
 *   the screen, not about the response shape, so they sit on top of the
 *   generated schema instead of replacing it.
 */
import * as zod from "zod/mini";
import {
  AdminCreateDraftProductAdminProducersProducerIdProductsPostResponse,
  AdminCreateProducerAdminProducersPostResponse,
  ClaimProducerProducerClaimPostResponse,
  CreateClaimLinkAdminProducersProducerIdClaimLinkPostResponse,
  CreateOwnerInviteAdminProducersProducerIdOwnerInvitePostResponse,
  GetFavoritesUsersMeFavoritesGetResponseItem,
  GetOwnerInviteAuthOwnerInviteTokenGetResponse,
  GetProducerProducersProducerIdGetResponse,
  GetReviewInviteLinkProducersMeReviewLinkGetResponse,
  GetSavedIdsUsersMeSavedIdsGetResponse,
  GetSavedUsersMeSavedGetResponse,
  GetStatsStatsGetResponse,
  ListCategoriesCategoriesGetResponse,
  ListMyGroupBuysProducersMeGroupBuysGetResponseItem,
  ListReviewsNestedProducersProducerIdReviewsGetResponse,
  PreviewClaimProducerClaimPreviewPostResponse,
  ProducerNameCheckProducerNameCheckGetResponse,
  RandomProducerProducersRandomGetResponse,
  UpdateGroupBuyStatusGroupBuysGroupBuyIdStatusPatchResponse,
} from "@/lib/generated/api.zod";

/** @param {unknown} value */
const isUrl = (value) => zod.safeParse(zod.url(), value).success;

/** @param {unknown} value */
const isFilled = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * The element schema of an array field on a generated object — the generated
 * file inlines row schemas, so this is how a per-row caller gets one without
 * redeclaring it.
 * @param {any} objectSchema
 * @param {string} key
 * @returns {any}
 */
const rowOf = (objectSchema, key) => objectSchema.shape[key].def.element;

// --- home page ------------------------------------------------------------
export const CategoriesResponseSchema = ListCategoriesCategoriesGetResponse;
export const StatsSchema = GetStatsStatsGetResponse;
export const RandomProducerSchema = RandomProducerProducersRandomGetResponse;

// --- favorites and saved items -------------------------------------------
// The hearts' cache needs `producer_id` only. Picking it keeps one bad nested
// producer from emptying every heart on the site.
export const FavoritesResponseSchema = /* @__PURE__ */ zod.array(
  zod.pick(GetFavoritesUsersMeFavoritesGetResponseItem, { producer_id: true }),
);
// The /favorites page row, parsed one row at a time (MEH-1713: one bad row
// costs one card). The nested producer is the whole ProducerListOut, so no
// field ProducerCard renders can be stripped.
export const FavoriteWithProducerSchema = GetFavoritesUsersMeFavoritesGetResponseItem;
export const SavedIdsResponseSchema = GetSavedIdsUsersMeSavedIdsGetResponse;
// The envelope loosens the three generated row lists to `unknown`, so a bad row
// is dropped by the page (savedItems.js keepValid) instead of failing the whole
// response. `safeExtend` replaces existing generated keys (plain `extend` refuses: the
// generated schema carries a `describe` check); it adds none.
// (The cast: safeExtend's types demand the replacement be assignable to the
// row type, which `unknown` is not, by design — the runtime does exactly this.)
export const SavedItemsResponseSchema = /* @__PURE__ */ zod.safeExtend(/** @type {any} */ (GetSavedUsersMeSavedGetResponse), {
  recipes: zod.array(zod.unknown()),
  events: zod.array(zod.unknown()),
  experiences: zod.array(zod.unknown()),
});
export const SavedRecipeSchema = /* @__PURE__ */ rowOf(GetSavedUsersMeSavedGetResponse, "recipes");
export const SavedEventSchema = /* @__PURE__ */ rowOf(GetSavedUsersMeSavedGetResponse, "events");
export const SavedExperienceSchema = /* @__PURE__ */ rowOf(GetSavedUsersMeSavedGetResponse, "experiences");

// --- reviews --------------------------------------------------------------
export const ReviewInviteLinkSchema = /* @__PURE__ */ GetReviewInviteLinkProducersMeReviewLinkGetResponse.check(
  zod.refine((body) => isUrl(body.url), { message: "review link is not a URL" }),
);
// ReviewOut carries `user_name`; the share card must never print it, and
// ApiResponsesNoFieldLists.test.js holds the card to that.
// The contract says `stars: int`; the card draws that many stars, so a value
// outside 1–5 is a malformed page (the hand-written schema held the same line).
const MAX_STARS = 5;
export const ReviewsPageSchema = /* @__PURE__ */ ListReviewsNestedProducersProducerIdReviewsGetResponse.check(
  zod.refine((page) => page.reviews.every((r) => r.stars >= 1 && r.stars <= MAX_STARS), {
    message: "a review has stars outside 1–5",
  }),
);

// --- claim a draft business ----------------------------------------------
export const ProducerClaimPreviewSchema = /* @__PURE__ */ PreviewClaimProducerClaimPreviewPostResponse.check(
  zod.refine((body) => isFilled(body.name), { message: "preview has no name" }),
);
export const ProducerClaimResultSchema = ClaimProducerProducerClaimPostResponse;

// --- admin ----------------------------------------------------------------
export const ProducerAdminCreatedSchema = /* @__PURE__ */ zod.pick(AdminCreateProducerAdminProducersPostResponse, {
  id: true,
});
export const ProducerClaimLinkSchema = /* @__PURE__ */ CreateClaimLinkAdminProducersProducerIdClaimLinkPostResponse.check(
  zod.refine((body) => isUrl(body.url), { message: "claim link is not a URL" }),
);
// `email` is `zod.email()` in the generated schema, stricter than the backend's
// own EmailStr (zod rejects e.g. a Hebrew local part that email-validator
// accepts). The page shows it read-only, so a stricter check here would turn a
// valid invite into the "malformed invite" page. The key is the generated one;
// only its check is relaxed to "a string or nothing".
const INVITE_EMAIL = { email: zod.optional(zod.nullable(zod.string())) };
export const OwnerInvitePublicSchema = /* @__PURE__ */ zod.safeExtend(
  GetOwnerInviteAuthOwnerInviteTokenGetResponse,
  INVITE_EMAIL,
).check(
  zod.refine((body) => isFilled(body.producer_name), { message: "invite has no business name" }),
);
export const OwnerInviteCreatedSchema = /* @__PURE__ */ zod.safeExtend(
  CreateOwnerInviteAdminProducersProducerIdOwnerInvitePostResponse,
  INVITE_EMAIL,
).check(
  zod.refine((body) => isUrl(body.invite_url), { message: "invite link is not a URL" }),
);
export const DraftProductSchema = /* @__PURE__ */ zod
  .pick(AdminCreateDraftProductAdminProducersProducerIdProductsPostResponse, {
    id: true,
    name: true,
    price_min: true,
    price_max: true,
    price_unit: true,
  })
  .check(zod.refine((row) => isFilled(row.name), { message: "product has no name" }));

// --- group buys -----------------------------------------------------------
export const GroupBuyStatusResultSchema = UpdateGroupBuyStatusGroupBuysGroupBuyIdStatusPatchResponse;
// GroupBuyOut.status is a plain `str` in the contract, but the card's action
// buttons branch on it, so an unknown value must fail the row rather than
// render a card with no actions. The four values come from the generated
// status-change response, whose `status` IS the closed set — not from a list
// written here.
const GROUP_BUY_STATUS = /* @__PURE__ */ (() => GroupBuyStatusResultSchema.shape.status)();
export const OwnerGroupBuySchema = /* @__PURE__ */ ListMyGroupBuysProducersMeGroupBuysGetResponseItem.check(
  zod.refine((row) => zod.safeParse(GROUP_BUY_STATUS, row.status).success, {
    message: "unknown group-buy status",
    path: ["status"],
  }),
);
// The public group page reads the business's delivery fields and, under a "no"
// verdict, its phone and name — all of ProducerDetailOut, so the whole of it.
export const GroupBuyProducerDeliverySchema = GetProducerProducersProducerIdGetResponse;
// MEH-3755: the buyer's order page reads the business's name, slug and contact
// fields for its link and contact button.
export const OrderBusinessSchema = GetProducerProducersProducerIdGetResponse;

// --- sign-up --------------------------------------------------------------
export const NameCheckResponseSchema = ProducerNameCheckProducerNameCheckGetResponse;
