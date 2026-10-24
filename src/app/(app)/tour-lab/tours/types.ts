/**
 * One tour's setup - everything the tour engine (../[slug]/experience.tsx)
 * needs to show a customer's tour. Hand-written per customer in the
 * prototype; the scalable version keeps it in Arpo, edited in the editor.
 */

export type WelcomeGo = { drone: string | null } | { room: string; name: string } | { href: string };

export type TourPoint = {
  id: string;
  name: string;
  cat: string;
  icon: string;
  /** Position on the drone picture, degrees. */
  yaw: number;
  pitch: number;
  /** Where "Gå ind i rummet" lands (a U-link / MPSkins link), if anywhere. */
  tour: string | null;
  /** A 360° photo at the point (folder under panos.basePath). */
  pano?: string;
  text: string;
  chips: string[];
};

export type MenuEntry = { title: string; href: string } | { title: string; items: [string, string][] };

export type TourConfig = {
  slug: string;
  /** Short name, e.g. "Halvorsminde". */
  brand: string;
  title: string;
  /** The current MPSkins tour - scan points and model id are read from it. */
  tourPage: string;
  /** MPSkins "Starting Point" (a U-link). */
  start: string;
  /** Logo for dark backgrounds - unless logoOnLight. */
  logo: string;
  /** The logo is made for light backgrounds (shown on white instead of the main colour). */
  logoOnLight?: boolean;
  subtitle?: string;
  colors: { main: string; accent: string; accentDark: string; soft: string };
  font: string;
  cta: { label: string; href: string; primary: boolean }[];
  /** Contact card at the bottom of the menu. */
  contact?: { address?: string; mapUrl?: string; phone?: string; email?: string; instagram?: string };
  /** The drone scene in front of the tour - leave out to start straight in the tour. */
  drone?: {
    basePath: string;
    maxLevel: number;
    cubeResolution: number;
    start: { yaw: number; pitch: number; hfov: number };
    startMobile: { yaw: number; pitch: number; hfov: number };
    intro: { title: string; lead: string };
    /** "Skolen fra luften" etc. */
    backLabel: string;
    filterTitle: string;
  };
  panos?: { basePath: string; maxLevel: number; cubeResolution: number };
  categories: Record<string, { name: string; color: string }>;
  points: TourPoint[];
  /** The welcome tiles - leave out for no welcome. */
  welcome?: {
    kicker: string;
    title: string;
    lead: string;
    tiles: { kicker: string; title: string; go: WelcomeGo; style: "dark" | "light" | "accent"; recommended?: boolean }[];
    skip: string;
  };
  /** "free": walk around as in Matterport. "points": only the menu and points move you. */
  navigation: "free" | "points";
  /** Extra scan points to hide (sweep ids) - the ones hidden in MPSkins are picked up automatically. */
  hiddenSweeps: string[];
  /** MPSkins "navOpenOnStart", per device. */
  menuOpenOnStart: { desktop: boolean; mobile: boolean };
  menu: MenuEntry[];
  /** MPSkins "Codes" as Matterport URL parameters. */
  matterportParams: Record<string, string>;
  /** MPSkins "Deep Link Transitions" time. */
  flyMs: number;
};
