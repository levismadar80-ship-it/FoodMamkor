// MEH-471 strangler-fig: maps homegrown flat keys → next-intl dotted keys.
// Used by language-context.js (LanguageProvider shim) + use-home-page.js
// so downstream consumers of useLanguage().t can keep passing old keys
// until Wave 2 migrates each call site to useTranslations() directly.
// DELETE THIS FILE when language-context.js is removed in Wave 2.
export const OLD_TO_NEW = {
  nav_discover: "nav.discover",
  nav_map: "nav.map",
  nav_events: "nav.events",
  nav_neighbor: "nav.neighbor",
  nav_about: "nav.about",
  nav_favorites: "nav.favorites",
  nav_admin: "nav.admin",
  nav_login: "nav.login",
  nav_logout: "nav.logout",
  nav_add_business: "nav.add_business",
  nav_mobile_label: "nav.mobile_label",
  nav_profile: "nav.profile",
  hero_title: "home.hero.title",
  hero_subtitle: "home.hero.subtitle",
  search_placeholder: "home.search.placeholder",
  search_sr_label: "home.search.sr_label",
  search_submit: "home.search.submit",
  footer_discover: "nav.footer.discover",
  footer_community: "nav.footer.community",
  footer_businesses: "nav.footer.businesses",
  footer_trust: "nav.footer.trust",
  footer_home: "nav.footer.home",
  footer_map: "nav.footer.map",
  footer_all_businesses: "nav.footer.all_businesses",
  footer_new_businesses: "nav.footer.new_businesses",
  footer_events: "nav.footer.events",
  footer_neighbor_kitchen: "nav.footer.neighbor_kitchen",
  footer_about: "nav.footer.about",
  footer_add_business: "nav.footer.add_business",
  footer_login: "nav.footer.login",
  footer_manage: "nav.footer.manage",
  footer_terms: "nav.footer.terms",
  footer_privacy: "nav.footer.privacy",
  footer_accessibility: "nav.footer.accessibility",
  footer_contact: "nav.footer.contact",
  footer_copyright: "nav.footer.copyright",
  footer_made_with_love: "nav.footer.made_with_love",
  cta_show_on_map: "common.cta.show_on_map",
  cta_more_info: "common.cta.more_info",
};

export function mapKey(oldKey) {
  return OLD_TO_NEW[oldKey] ?? oldKey;
}
