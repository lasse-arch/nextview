/**
 * One tour's setup - everything the tour engine (../[slug]/experience.tsx)
 * needs to show a customer's tour. Hand-written per customer in the
 * prototype; the scalable version keeps it in Arpo, edited in the editor.
 */

/** The guide's turn at a stop: "as" = the usual slow turn, "other" = the other way, "none" = no turn. */
export type GuideTurn = "as" | "other" | "none";
export type WelcomeGo = { drone: string | null } | { room: string; name: string } | { href: string } | { guide: true } | { day: true };

/** A real spot in the tour with a photo of it (e.g. one of the model's own Matterport photos). */
export type TourPlace = { name: string; kicker?: string; href: string; image: string };

/** How a link out of the tour opens: over the tour, in a new tab, or instead of the tour. */
export type LinkOpen = "popup" | "tab" | "same";
/** How big a popup over the tour is (see links.tsx). */
export type PopupSize = "lille" | "mellem" | "stor" | "egen" | "fuld";

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
  /** Where the 360° photo opens, in degrees (default: straight ahead, a little down). */
  panoStart?: { yaw: number; pitch: number };
  /** An uploaded 360° photo (one equirectangular picture, 2:1) at the point - opens with "Oplev i 360°", like `pano`. */
  panorama?: string;
  /**
   * Photos on the point's card, swiped through at the top - e.g. the
   * customer's own summer photos of a pool that is closed when the drone flew,
   * or a place that isn't scanned yet.
   */
  images?: string[];
  /** A button on the point's card, e.g. "Book en komfortplads" (opens like any link out of the tour). */
  button?: { label: string; href: string };
  /** Where the point is on the tour's site plan (sitePlan), as fractions of the plan picture (x1, y1, x2, y2) - gives the card a button that shows the plan zoomed in on it. */
  planBox?: [number, number, number, number];
  text: string;
  chips: string[];
  /** How big the point is on the map: 1 = normal (0.6-1.8). */
  size?: number;
  /** Walking times to other points (by id): "2 min til Stranden" on the card, and lines on the picture while it's open. */
  walks?: { to: string; minutes: number }[];
};

/** A menu item: a spot in the tour, "#luften" (back to the drone scene / map), "#punkt:<point id>" (a point on the drone scene / map, its card open), "#plan" (the site plan full screen), or a page out of the tour. */
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
  /** Which top corner the logo sits in - the menu button takes the other one. Default "left". */
  logoSide?: "left" | "right";
  /** The logo's height over the tour, in px (computer; a phone shows it a bit smaller). Default 46. */
  logoSize?: number;
  /** The logo's distance (px) from the top and from its side of the screen - both devices. Unset: 14/16 on a computer, 12/12 on a phone. */
  logoOffset?: { top?: number; side?: number };
  subtitle?: string;
  colors: { main: string; accent: string; accentDark: string; soft: string };
  font: string;
  cta: { label: string; href: string; primary: boolean }[];
  /**
   * How links out of the tour open: a default, and single links (by their URL)
   * set differently. Left out = new tab. `size`: how big a popup is (left out =
   * "stor"). A popup says which site it shows ("Fra claude.ai"), so visitors
   * know they're not on the tour's own page - `showSite: false` leaves it out.
   */
  /** `custom`: the popup's own size in px (size "egen") - never bigger than the screen. */
  linkOpen?: { default: LinkOpen; byUrl?: Record<string, LinkOpen>; size?: PopupSize; custom?: { w: number; h: number }; showSite?: false };
  /**
   * Links to the customer's own pages get utm_source=nextview360 (medium
   * "virtuel-tour", campaign = the tour's slug), so their analytics/booking
   * system can count the bookings the tour brings. false = leave links as they are
   * (only if a booking page breaks with the extra parameters).
   */
  utm?: false;
  /** Contact card at the bottom of the menu. */
  /**
   * Contact card at the bottom of the menu. `social`: links to the customer's
   * social media (facebook, instagram, linkedin, tiktok, youtube, x), shown as
   * icons - only the ones filled in. `instagram` is the older single field
   * (still shown, as its icon).
   */
  contact?: { address?: string; mapUrl?: string; phone?: string; email?: string; instagram?: string; social?: Partial<Record<import("./social").SocialKind, string>> };
  /** The drone scene in front of the tour - leave out to start straight in the tour. */
  /**
   * What lies over the drone scene / map, per device - false hides it: the
   * box at the top (logo, title, text and the first button) and the
   * category filter ("Vis").
   */
  /**
   * How a 360° picture opens (menu pictures, a point's 360° photo), by the
   * picture's address: zoom per device (1 = the device's normal, over 1
   * closer) and where it looks (yaw/pitch, degrees).
   */
  imageView?: Record<string, { desktop?: number; mobile?: number; yaw?: number; pitch?: number }>;
  overviewUi?: {
    box?: { desktop?: false; mobile?: false };
    filter?: { desktop?: false; mobile?: false };
    /** The points' names on the drone scene / map: always, only when zoomed in, or never (the open point's card has the name). Default: computer always, phone when zoomed in. */
    names?: { desktop?: "always" | "zoom" | "never"; mobile?: "always" | "zoom" | "never" };
    /** Phones: the filter's categories side by side in rows of 2-4, so all are seen at once. Default: one row to scroll sideways. */
    filterColumns?: 2 | 3 | 4;
  };
  drone?: {
    /** One 360° photo (equirectangular) instead of the tiles below - set by the engine for a 360° map. */
    panorama?: string;
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
    /**
     * The picture is a 360° photo (equirectangular, 2:1): the tour shows it as
     * a 360° scene to look around in, with the points on it - `spots` are
     * still % of the flat picture (x = around, y = up/down), and `start` the
     * view it opens on (zoom 1 = a normal view).
     */
    panorama?: boolean;
  };
  panos?: { basePath: string; maxLevel: number; cubeResolution: number };
  /**
   * The place's own site plan (e.g. a campsite's pladskort): shown full screen
   * from the menu ("#plan") and from points with a planBox, zoomed in on them.
   * `label`: the points' button, e.g. "Se på pladskortet".
   */
  sitePlan?: { image: string; label: string };
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
  design?: {
    welcome: "tiles" | "cover" | "simple";
    menu: "side" | "dock" | "picker" | "simple";
    /** Room picker: the room a size opens in when it's picked (e.g. "Tomt"). Left out, or not in that size = the size's first. */
    first?: string;
  };
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
    /** The guide's stop button: "self" = "Gå selv rundt" (stay where you are), "overview" = back to the drone scene / map - for tours you can't walk around in. Default "self". */
    exit?: "self" | "overview";
    /**
     * Made from the menu instead of `stops`: one stop per place in the menu,
     * in the menu's order - `menuPlaces` = the places to include, by their
     * key (as in ?rum=; all when left out), `menuTurns` = a place's own turn (by key).
     */
    fromMenu?: boolean;
    menuPlaces?: string[];
    menuTurns?: Record<string, GuideTurn>;
    /** How the view turns at each stop: left out = a slow turn as always, "other" = the other way, "none" = stands still. A stop can have its own. */
    turn?: GuideTurn;
    /** A stop: where (empty href = stay, e.g. a closing card), its text, and optionally a voice (an audio file) that plays there. */
    stops: ({ point: string } | { href: string; title: string; text: string; audio?: string; turn?: GuideTurn })[];
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
  /**
   * A contact form inside the tour ("Skriv til os") - no popup to the
   * customer's own form: the message is mailed to `to` (the customer), with
   * the visitor's address to answer. Opened from the contact box, and from any
   * link "#kontakt" (menu, buttons). `phone`: false = no phone field.
   */
  contactForm?: { to: string; title?: string; lead?: string; phone?: boolean; thanks?: string };
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
   * "Find din plads": a few questions on the drone scene/map (who are you,
   * what do you sleep in, what matters most); each answer points at the
   * points that fit it, and the point with most answers wins - the scene
   * flies there and opens its card, with the next best as alternatives.
   * Opened from a button in the box at the top, and from any link "#find".
   */
  finder?: {
    title: string;
    lead?: string;
    /** The button's text, e.g. "Find jeres plads". */
    button: string;
    questions: { q: string; options: { label: string; points: string[] }[] }[];
  };
  /**
   * "Vejret" on the drone scene: the weather right now where the place is
   * (DMI), and what each month is typically like - for visitors planning a
   * stay. `place` is the name shown ("Vejret i Hals").
   */
  weather?: { lat: number; lon: number; place: string };
  /** "Sådan går du rundt": a short help (drag, walk, the menu) when the visitor first steps inside - once per visitor. */
  onboarding?: boolean;
  /**
   * false: on a website the tour starts with a play button (a picture, its
   * name and "Gå ind i touren") - nothing loads until it's pressed, and then
   * it opens in full screen. Default: it starts by itself.
   */
  autoplay?: false;
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
    /** Where every unit's button goes - a web page of the customer's. Empty: the unit's own link from the list, else the tour's primary button. */
    bookHref?: string;
    /** Show each unit's size / number of free places (when the page has it) - false: leave it out. Default shown. */
    showSize?: false;
    /** How often the page is read again, in minutes (default 10). */
    refreshMinutes?: number;
    /** Where each unit is in the tour (unit name -> link to the spot) - "Se" flies there, "Find vej" walks there. */
    places?: Record<string, string>;
  };
  welcome?: {
    kicker: string;
    title: string;
    lead: string;
    /** `image`: a photo behind the tile (white text on it) - makes the welcome feel like the place itself. */
    tiles: { kicker: string; title: string; go: WelcomeGo; style: "dark" | "light" | "accent"; recommended?: boolean; image?: string }[];
    skip: string;
  };
  /** "free": walk around as in Matterport. "points": only the menu and points move you. */
  navigation: "free" | "points";
  /** Scan points to hide (sweep ids) - set under Scanpunkter. */
  hiddenSweeps: string[];
  /** Is the menu open when the tour starts, per device. */
  menuOpenOnStart: { desktop: boolean; mobile: boolean };
  /** The tour dims behind an open menu, and a tap on it closes the menu - false: no dimming. */
  menuDim?: false;
  /**
   * More languages than Danish ("en", "de" … - see LANGUAGES in i18n.ts): the
   * visitor gets a language button, and a link can pick one with ?sprog=en.
   * The tour also starts in the visitor's own language when it's one of these.
   */
  languages?: string[];
  /**
   * Where the visitor picks the language, per device: "top" = a button at the
   * top in the middle, "corner" = next to the menu button, "menu" = in the
   * menu (the side menu; others fall back to the button), "hidden" = not at all
   * (only a link with ?sprog=). Default: computer "top", phone "menu".
   */
  langSwitch?: { desktop?: "top" | "corner" | "menu" | "hidden"; mobile?: "top" | "corner" | "menu" | "hidden" };
  /** Per language: Danish text -> the same text in that language (the setup's texts and the engine's words). Made by nextviewAI, editable under Sprog. A text without one shows in Danish. */
  translations?: Record<string, Record<string, string>>;
  menu: MenuEntry[];
  /**
   * "Historier": the rooms as Instagram-style story cards along the bottom,
   * each with a picture of the room. `rooms` picks and orders them (menu
   * names); left out = every room in the menu, in menu order.
   */
  /**
   * The rooms as story cards along the bottom. `scroll`: the row scrolls
   * sideways (default on both) - false on a device = every card shown,
   * wrapped onto more rows.
   */
  stories?: { mobile: boolean; desktop: boolean; rooms?: string[]; scroll?: { mobile?: false; desktop?: false } };
  /** Matterport URL parameters for the viewer. */
  matterportParams: Record<string, string>;
  /** How long a fly to a spot takes (ms). */
  flyMs: number;
};
