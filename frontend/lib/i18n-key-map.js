// MEH-471 strangler-fig: maps homegrown flat keys → next-intl dotted keys.
// Used by language-context.js (LanguageProvider shim) + use-home-page.js
// so downstream consumers of useLanguage().t can keep passing old keys
// until Wave 2 migrates each call site to useTranslations() directly.
// DELETE THIS FILE when language-context.js is removed in Wave 2.
export const OLD_TO_NEW = {
  nav_discover: "nav.discover",
  nav_map: "nav.map",
  nav_events: "nav.events",
  nav_about: "nav.about",
  nav_favorites: "nav.favorites",
  nav_admin: "nav.admin",
  nav_login: "nav.login",
  // MEH-868: nav_logout alias removed — nav.logout was deleted in this PR
  // (AccountSheet now uses the plural account.menu.logout; no live consumer).
  nav_add_business: "nav.add_business",
  nav_mobile_label: "nav.mobile_label",
  nav_profile: "nav.profile",
  hero_title: "home.hero.title",
  hero_subtitle: "home.hero.subtitle",
  search_placeholder: "home.search.placeholder",
  search_sr_label: "home.search.sr_label",
  search_submit: "home.search.submit",
  // MEH-867: footer_discover/community/businesses/trust/home/map/
  // all_businesses/new_businesses/manage/privacy/contact/copyright/
  // made_with_love aliases removed — their nav.footer.* targets were the
  // dead keys deleted in this PR (grep-confirmed no live consumers).
  footer_events: "nav.footer.events",
  footer_about: "nav.footer.about",
  footer_add_business: "nav.footer.add_business",
  footer_login: "nav.footer.login",
  footer_terms: "nav.footer.terms",
  footer_accessibility: "nav.footer.accessibility",
  cta_show_on_map: "common.cta.show_on_map",
  cta_more_info: "common.cta.more_info",
};

export function mapKey(oldKey) {
  return OLD_TO_NEW[oldKey] ?? oldKey;
}
