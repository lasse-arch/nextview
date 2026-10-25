/**
 * One tour's setup - everything the tour engine (../[slug]/experience.tsx)
 * needs to show a customer's tour. Hand-written per customer in the
 * prototype; the scalable version keeps it in Arpo, edited in the editor.
 */

export type WelcomeGo = { drone: string | null } | { room: string; name: string } | { href: string } | { guide: true };

/** A real spot in the tour with a photo of it (e.g. one of the model's own Matterport photos). */
export type TourPlace = { name: string; kicker?: string; href: string; image: string };

/** How a link out of the tour opens: over the tour, in a new tab, or instead of the tour. */
export type LinkOpen = "popup" | "tab" | "same";

export type TourInfo = {
  title: string;
  text: string;
  image?: string;
  link?: { label: string; href: string };
  position: { x: number; y: number; z: number };
  ss: number[];
};

export type DockIcon = "places" | "menu" | "book" | "order" | "map" | "phone" | "play";

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
  /** How links out of the tour open: a default, and single links (by their URL) set differently. Left out = new tab. */
  linkOpen?: { default: LinkOpen; byUrl?: Record<string, LinkOpen> };
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
  /** The tiles of the tile menu. */
  /**
   * A short film before the tour (e.g. a drone flying down to the entrance).
   * It ends in the tour at `start`, then the welcome (or the menu) opens.
   */
  intro?: {
    /** The film in each format and size - the browser takes the first it can play (media: e.g. "(max-width: 760px)"). */
    sources: { src: string; type: "video/webm" | "video/mp4"; media?: string }[];
    poster?: string;
  };
  /**
   * The look: which welcome and which menu. Left out = the classic ones
   * (tile welcome, side menu). "cover" = the place's own photo full-screen
   * with its places to pick; "dock" = a bar at the bottom with what guests came for.
   */
  design?: { welcome: "tiles" | "cover"; menu: "side" | "dock" };
  /** Font for big headings (a Google font), if not the body font. */
  fontHeading?: string;
  /** Real spots with a photo - the cover's and the dock's "places". */
  places?: TourPlace[];
  cover?: { kicker: string; title: string; lead: string; image: string; imageMobile?: string; enter: string; placesTitle: string };
  dock?: { label: string; icon: DockIcon; go: "places" | "guide" | { href: string }; primary?: boolean }[];
  /**
   * "Vis mig rundt": the tour flies from stop to stop by itself with a short
   * text at each. A stop can borrow a drone point's name and text ({ point: id }).
   */
  guide?: { seconds?: number; stops: ({ point: string } | { href: string; title: string; text: string })[] };
  /**
   * Info points: small pulsing dots on things in the room; a tap opens a card.
   * `position` is a spot in the 3D model (placed with "Placér infopunkt" in the
   * prototype panel), `ss` the scan points it's shown from.
   */
  info?: TourInfo[];
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
  /**
   * "Historier": the rooms as Instagram-style story cards along the bottom,
   * each with a picture of the room. `rooms` picks and orders them (menu
   * names); left out = every room in the menu, in menu order.
   */
  stories?: { mobile: boolean; desktop: boolean; rooms?: string[] };
  /** MPSkins "Codes" as Matterport URL parameters. */
  matterportParams: Record<string, string>;
  /** MPSkins "Deep Link Transitions" time. */
  flyMs: number;
};
