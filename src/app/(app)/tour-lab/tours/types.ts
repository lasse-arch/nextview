/**
 * One tour's setup - everything the tour engine (../[slug]/experience.tsx)
 * needs to show a customer's tour. Hand-written per customer in the
 * prototype; the scalable version keeps it in Arpo, edited in the editor.
 */

export type WelcomeGo = { drone: string | null } | { room: string; name: string } | { href: string } | { guide: true } | { day: true };

/** A real spot in the tour with a photo of it (e.g. one of the model's own Matterport photos). */
export type TourPlace = { name: string; kicker?: string; href: string; image: string };

/** How a link out of the tour opens: over the tour, in a new tab, or instead of the tour. */
export type LinkOpen = "popup" | "tab" | "same";

export type TourInfo = {
  title: string;
  text: string;
  image?: string;
  /** A YouTube or Vimeo link - played in the tag's card. */
  video?: string;
  /** E.g. "Fra 495 kr./md." - shown big on the card. */
  price?: string;
  link?: { label: string; href: string };
  position: { x: number; y: number; z: number };
  ss: number[];
};

export type PlaceCard = {
  ss: number[];
  title: string;
  text: string;
  more?: { label: string; text: string };
  buttons?: ({ label: string; room: string } | { label: string; href: string })[];
  seconds?: number;
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
  /** Where "Gå ind i rummet" lands (a link to a spot in the tour), if anywhere. */
  tour: string | null;
  /** A 360° photo at the point (folder under panos.basePath). */
  pano?: string;
  text: string;
  chips: string[];
  /** How big the point is on the map: 1 = normal (0.6-1.8). */
  size?: number;
};

export type MenuEntry = { title: string; href: string } | { title: string; items: [string, string][] };

export type TourConfig = {
  slug: string;
  /** Short name, e.g. "Halvorsminde". */
  brand: string;
  title: string;
  /** Legacy: an MPSkins tour page the scan points used to be read from. Empty for every tour connected straight to Matterport (all new ones) - "Frakobl MPSkins" moves the old ones over. */
  tourPage: string;
  /**
   * The Matterport model (e.g. "rxaXbNZcETf") - scan points, floors and floor
   * plans come straight from Matterport's own model data.
   */
  modelId?: string;
  /** Where the tour starts: a link to a spot (my.matterport.com/show/?m=…&ss=…, with &rot= for the exact view). */
  start: string;
  /** Logo for dark backgrounds - unless logoOnLight. */
  logo: string;
  /** The little icon in the browser tab (the customer's own favicon) - left out = the logo. */
  favicon?: string;
  /** The logo is made for light backgrounds (shown on white instead of the main colour). */
  logoOnLight?: boolean;
  /** A dark logo sits on a light card in the tour - false: straight on the tour, transparent, no glow (as in MPSkins). */
  logoCard?: false;
  /** The logo's height over the tour, in px (computer; a phone shows it a bit smaller). Default 46. */
  logoSize?: number;
  subtitle?: string;
  colors: { main: string; accent: string; accentDark: string; soft: string };
  font: string;
  cta: { label: string; href: string; primary: boolean }[];
  /** How links out of the tour open: a default, and single links (by their URL) set differently. Left out = new tab. */
  linkOpen?: { default: LinkOpen; byUrl?: Record<string, LinkOpen> };
  /**
   * Links to the customer's own pages get utm_source=nextview360 (medium
   * "virtuel-tour", campaign = the tour's slug), so their analytics/booking
   * system can count the bookings the tour brings. false = leave links as they are
   * (only if a booking page breaks with the extra parameters).
   */
  utm?: false;
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
  /**
   * A flat start picture instead of the 360° drone scene (an illustrated map, a
   * site plan, a drone photo): the drone's texts and points, placed on the
   * picture by `spots` (point id -> x, y in % of the picture). Points without a
   * spot aren't on the map. Start view: x, y in % and zoom (1 = fill the screen).
   */
  map?: {
    image: string;
    w: number;
    h: number;
    spots: Record<string, [number, number]>;
    start?: { x: number; y: number; zoom: number };
    startMobile?: { x: number; y: number; zoom: number };
    searchPlaceholder?: string;
    clouds?: boolean;
    /** The words over the map (a tour with a drone scene uses its own). */
    intro?: { title: string; lead: string };
    /** The button back to the map from inside the tour. */
    backLabel?: string;
    /** The heading over the category filter. */
    filterTitle?: string;
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
   * with its places to pick; "dock" = a bar at the bottom with what guests came for;
   * "picker" = a room picker at the bottom - the menu's groups (e.g. sizes) on one
   * row, the chosen group's rooms (e.g. empty / furnished) on the next.
   * "simple" (welcome and menu) = "Helt enkel": a few big buttons one below the
   * other, and a menu that is one list of big buttons - no tiles, sub-menus or
   * side panels. For visitors who need it calm and plain (special schools).
   */
  design?: { welcome: "tiles" | "cover" | "simple"; menu: "side" | "dock" | "picker" | "simple" };
  /**
   * How the menu moves you: "fly" through the model (default), "instant" - a
   * straight switch to the room, or "fade" - a cross-fade from a picture of
   * the old view (a touch slower to start).
   */
  jump?: "fly" | "fade" | "instant";
  /**
   * Matterport's measurements shown over the tour (its measuring mode, with all
   * its buttons hidden and clicks caught, so visitors see the measurements but
   * can't add their own) - with a "Vis mål / Skjul mål" button.
   */
  measure?: boolean;
  /** Keep Matterport's own buttons (dollhouse, floor plan, settings…). Default: hidden - the tour's own UI is the UI. */
  matterportUi?: boolean;
  /**
   * A colour filter over the 3D tour (like MPSkins' "Color filter" was) - e.g. a touch
   * brighter and warmer. brightness/contrast/saturate: 1 = unchanged;
   * grayscale 0-1; hue in degrees.
   */
  filter?: { brightness?: number; contrast?: number; saturate?: number; grayscale?: number; hue?: number };
  /**
   * The tour's own design on top of the engine's - CSS for what the fields
   * don't cover (round shapes, a particular style, hiding or moving
   * something). Everything sits inside \`.hv\`; the main parts: .hv-logo,
   * .hv-menuknap (menu button), .hv-panel/.hv-menu (side menu), .hv-btn
   * (buttons), .dz-dock (bottom bar), .pk (room picker), .hv-wel* (welcome),
   * .dz-cover (cover), .pc (place cards), .pc-nudge ("Din plads venter"),
   * .ip-dot/.ip-card (tags), .hv-stories (stories), .gd-card (guide).
   * Colours: var(--c-main), var(--c-accent), var(--c-accent-dark), var(--c-soft).
   */
  customCss?: string;
  /** Font for big headings (a Google font), if not the body font. */
  fontHeading?: string;
  /** Real spots with a photo - the cover's and the dock's "places". */
  places?: TourPlace[];
  cover?: { kicker: string; title: string; lead: string; image: string; imageMobile?: string; enter: string; placesTitle: string };
  dock?: { label: string; icon: DockIcon; go: "places" | "guide" | { href: string }; primary?: boolean }[];
  /**
   * "Vis mig rundt": the tour flies from stop to stop by itself with a short
   * text at each - and a voice, if the stop has one. A stop can borrow a drone point's name and text ({ point: id }).
   */
  guide?: {
    seconds?: number;
    /** The visitor presses "Næste" themselves (no timer) - calm, e.g. for a voice tour. */
    manual?: boolean;
    /** A stop: where (empty href = stay, e.g. a closing card), its text, and optionally a voice (an audio file) that plays there. */
    stops: ({ point: string } | { href: string; title: string; text: string; audio?: string })[];
  };
  /**
   * "Sådan ser en dag ud": the day as a calm timeline (time, what happens,
   * and where - "Se stedet" shows it). For visitors who like to know what's
   * coming, e.g. a special efterskole. A step without href has no place.
   */
  day?: { title: string; lead?: string; steps: { time: string; title: string; text?: string; href?: string }[] };
  /**
   * Info points: small pulsing dots on things in the room; a tap opens a card.
   * `position` is a spot in the 3D model (placed with "Placér infopunkt" in the
   * prototype panel), `ss` the scan points it's shown from.
   */
  info?: TourInfo[];
  /**
   * Cards that come up when the visitor arrives at a scan point (MPSkins'
   * "sweep action" popups): one at a time, bottom-left, gone by themselves
   * after `seconds` unless the visitor reads on. `more` = a second page
   * ("Læs mere"); a button flies to a room by its menu name or opens a link.
   */
  placeCards?: PlaceCard[];
  /** A card that comes by itself after a while (e.g. "Din plads venter") - never while the menu or a place card is open. */
  nudge?: { afterSeconds: number; title: string; text: string; buttons: { label: string; href: string; primary?: boolean }[] };
  /** Phones: no pinch-zoom in the tour, and a little zoomed out (MPSkins' mobile zoom lock). */
  mobileZoomLock?: boolean;
  /** How zoomed the view is, per device: 1 = Matterport's normal, under 1 = zoomed out (more of the room), over 1 = zoomed in. */
  zoom?: { desktop?: number; mobile?: number };
  /**
   * "Find vej": the visitor picks a room (from the menu) or a box number, and
   * the tour walks them there from where they stand, scan point by scan point.
   * `boxes`: box number -> link to the scan point in front of it.
   */
  wayfinding?: { boxes?: Record<string, string> };
  /**
   * Available rooms fetched live (every 10 min) and shown in the room picker:
   * per menu group (by its title) the size range (m³) it covers.
   */
  availability?: { source: "boxdepotet"; url: string; ranges: Record<string, [number, number]> };
  /**
   * Live data from the customer's own website - free camping pitches,
   * storage rooms, rooms… read off \`url\` every \`refreshMinutes\` (default 10) with \`pattern\`
   * (a regular expression over the page as text, links written as
   * [text](href); named groups: name (required), and any of size, price,
   * from, link). Made by Claude in the editor (Live data) and checked there.
   * Shown as "<title> · N" in the tour, and as a "Ledig" badge on menu items
   * named like a free unit. \`exclude\`: units never shown (by name).
   */
  /**
   * The tour on the customer's own website: the site, the size of the box,
   * and which of its pages each place goes on (place key, see startPlaces →
   * the page's address; "" = the whole tour). Shown with the codes in the
   * customer portal.
   */
  embeds?: { site?: string; size?: { kind: "16:9" | "4:3" | "fast" | "skaerm"; height: number }; pages?: Record<string, string> };
  live?: {
    url: string;
    title: string;
    pattern: string;
    flags?: string;
    exclude?: string[];
    bookLabel?: string;
    /** How often the page is read again, in minutes (default 10). */
    refreshMinutes?: number;
    /** Where each unit is in the tour (unit name -> link to the spot) - "Se" flies there, "Find vej" walks there. */
    places?: Record<string, string>;
  };
  welcome?: {
    kicker: string;
    title: string;
    lead: string;
    tiles: { kicker: string; title: string; go: WelcomeGo; style: "dark" | "light" | "accent"; recommended?: boolean }[];
    skip: string;
  };
  /** "free": walk around as in Matterport. "points": only the menu and points move you. */
  navigation: "free" | "points";
  /** Scan points to hide (sweep ids) - set under Scanpunkter. */
  hiddenSweeps: string[];
  /** Is the menu open when the tour starts, per device. */
  menuOpenOnStart: { desktop: boolean; mobile: boolean };
  menu: MenuEntry[];
  /**
   * "Historier": the rooms as Instagram-style story cards along the bottom,
   * each with a picture of the room. `rooms` picks and orders them (menu
   * names); left out = every room in the menu, in menu order.
   */
  stories?: { mobile: boolean; desktop: boolean; rooms?: string[] };
  /** Matterport URL parameters for the viewer. */
  matterportParams: Record<string, string>;
  /** How long a fly to a spot takes (ms). */
  flyMs: number;
};
