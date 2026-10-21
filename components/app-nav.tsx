// Retired: the app's section links now live in components/v2/nav.ts (V2_NAV_LINKS, V2_FOOTER_LINKS), rendered by
// AppShell. These aliases keep any older import working.
export {
  V2_FOOTER_LINKS as APP_FOOTER_LINKS,
  V2_NAV_LINKS as APP_NAV_LINKS,
  isV2NavActive as isAppNavActive,
  type V2NavLink as AppNavLink,
} from "@/components/v2/nav";
