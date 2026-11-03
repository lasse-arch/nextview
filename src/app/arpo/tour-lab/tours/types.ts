/**
 * One tour's setup - everything the tour engine (../[slug]/experience.tsx)
 * needs to show a customer's tour. Hand-written per customer in the
 * prototype; the scalable version keeps it in Arpo, edited in the editor.
 */

/** The guide's turn at a stop: "as" = the usual slow turn, "other" = the other way, "none" = no turn. */
export type GuideTurn = "as" | "other" | "none";
/** How fast the view turns at a stop (left out: "normal"). */
export type GuideTurnSpeed = "slow" | "normal" | "fast";
/** How long it turns at a stop: one short turn, once all the way round, or all the while (see GuideSetup.turnMode). */
export type GuideTurnMode = "once" | "round" | "continuous";
export type FindButtonPlace = "top" | "bottom-left" | "bottom-right" | "under-menu" | "under-live" | "menu";
export type DroneLook = { down?: number; up?: number; zoomIn?: number; zoomOut?: number; point?: "keep" | number };
/** A tile in the "Fliser" (bento) menu: `title` may have line breaks (\n); `href` as a menu item's. */
export type BentoTile = { title: string; kicker?: string; tag?: string; href: string; size?: "wide" | "tall"; style?: "light" | "dark" | "accent" };

/** A 360° photo's copies: 4096 px (phones - and computers at once, while the sharp one comes) and 8192 px (computers); the photo itself where it isn't bigger. */
export type PanoCopies = { phone: string; computer: string };

/** Where the drone picture looks (set from the editor's preview). */
export type DroneView = { yaw: number; pitch: number; hfov: number };
/** `view`: a tile to the drone picture can turn it to its own spot, per device - else the start view. `menu`: opens the menu on that group (by its title; the side menu opens the group, other menus just open). */
export type WelcomeGo = { drone: string | null; view?: { desktop?: DroneView; mobile?: DroneView } } | { room: string; name: string } | { href: string } | { guide: true | string } | { day: true } | { menu: string };

/** One guided tour ("Vis mig rundt"): its stops and how it runs. */
export type GuideSetup = {
  seconds?: number;
  /** Where its button is in the menu: at the top (left out), at the bottom, or not there (then started from a tile, a point or a button - "#rundvisning"). */
  menu?: "bottom" | false;
  /** The hint "Træk i billedet …" on the guide's card: on every stop ("all"), none ("none"), or the first N (left out: the first 2). */
  walkHint?: "all" | "none" | number;
  /** The visitor presses "Næste" themselves (no timer) - calm, e.g. for a voice tour. */
  manual?: boolean;
  /** The guide's stop button: "self" = "Gå selv rundt" (stay where you are), "overview" = back to the drone scene / map. Not set: back to it when the guide only shows its points (see guideExit). */
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
  /** How fast it turns at each stop. A stop can have its own. */
  turnSpeed?: GuideTurnSpeed;
  /**
   * "continuous": it keeps turning (evenly, in step with the screen) until the next stop or until the visitor touches the tour.
   * "round": once all the way round (360°) at each stop, then it stands still - also stopped by a touch.
   * Left out: one short turn, then it stands still (as always).
   */
  turnMode?: Exclude<GuideTurnMode, "once">;
  /** A stop: where (empty href = stay, e.g. a closing card; a picture "#billede:<address>" = shown full screen, a 2:1 one as 360°, e.g. a drone photo), its text, and optionally a voice (an audio file) that plays there. */
  stops: ({ point: string; turn?: GuideTurn; turnSpeed?: GuideTurnSpeed; turnMode?: GuideTurnMode } | { href: string; title: string; text: string; audio?: string; /** The text a made voice (ElevenLabs) was read from - it only plays while the stop says just that (not after a change, not in another language). */ audioText?: string; /** What the card shows instead of `text` - e.g. short, concrete words (one thing per sentence) for a special school. `text` stays what the voice says, so the voice keeps playing; left out = `text` is shown. When a stop has a voice, rewrite this - never `text`. */ short?: string; turn?: GuideTurn; turnSpeed?: GuideTurnSpeed; turnMode?: GuideTurnMode; /** The stop's own button, e.g. "Se alle linjer" to the school's page - on the last stop instead of the tour's main button. */ button?: { label: string; href: string }; /** The people met at the stop (up to 3: photo, name, role), e.g. the dance teacher. Left out: the people on the place card where the stop stands (same scan point), if it has any; [] = none. */ people?: CardPerson[] })[];
};

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

/** A point in the tour's 3D room (Matterport's world coordinates, metres). */
/** A pitch or cabin on the site plan. */
export type SiteUnit = {
  id: string;
  name: string;
  /** On the plan picture, in %. */
  x: number;
  y: number;
  kind?: "plads" | "hytte";
  /** The booking's own category (fx "Campingplads", "Hytte 4 pers.", "Motelværelse") - its colour and filter on the tour. */
  cat?: string;
  /** Where the booking itself puts it (its own map's pixels) - kept so the dots can be fitted onto our plan again. */
  bx?: number;
  by?: number;
  /** "Gå rundt": a place in the tour (a Matterport link) inside this cabin or room - else its category's. */
  tour?: string;
};

export type Point3 = { x: number; y: number; z: number };

/**
 * Virtual staging: something put onto a surface in the tour - a video on the
 * TV in the common room, a picture or poster on a wall, a web page (iframe) on
 * a screen, a sign, or the year wheel (`yearWheel`). Placed by its four corners
 * in the room, clicked in the editor's preview in the order top left, top
 * right, bottom right, bottom left - it follows the surface in perspective.
 * Shown only from the scan points in `ss` (never through a wall), and only
 * inside the tour (not in the dollhouse or floor plan).
 */
export type StagingItem = {
  id: string;
  /** What it shows. "yearwheel" = the tour's `yearWheel`, playing by itself and clickable. */
  kind: "video" | "image" | "iframe" | "sign" | "yearwheel";
  /** Its name in the editor (and for screen readers). */
  title?: string;
  /** The file (video: MP4, image) or the page (iframe: https only - a YouTube/Vimeo link plays its video). */
  src?: string;
  /** A sign's text (a line break = a new line). */
  text?: string;
  /** Top left, top right, bottom right, bottom left (made from `place` when it has one). */
  corners: [Point3, Point3, Point3, Point3];
  /**
   * Where it sits, as one click on the surface: its middle, the surface's
   * direction (towards the room) and its size in metres. The editor makes
   * the corners from it - always a true rectangle, resized and moved with
   * buttons. Left out on items placed by their four corners.
   */
  place?: { center: Point3; normal: Point3; w: number; h: number };
  /** The scan points it is seen from. */
  ss: number[];
  /** A tap opens this - a page, or in the tour ("#rundvisning", "#kontakt", a place, "#aarshjul" …). Without one, a tap on a video turns its sound on. */
  action?: { label: string; href: string };
  /** How a picture or video fills the surface: "cover" (fills it, may crop - default) or "contain" (all of it, may leave edges). */
  fit?: "cover" | "contain";
};

/**
 * "Et år på …": the school year as a wheel - month by month with what happens
 * (a picture, a title, a line), turning by itself like a film, and the
 * visitor can tap a month or a card. Shown full screen from any link
 * "#aarshjul" and, as virtual staging (kind "yearwheel"), on a screen in the
 * tour. Ends with `cta` (e.g. book a visit).
 */
/** How much of the sphere a picture covers, in degrees: across (h, up to 360) and up/down (v, up to 180) - e.g. a 180° photo. */
export type PanoCover = { h: number; v: number };

export type YearWheel = {
  /** The opening line, e.g. "Et år. Én årgang." */
  title: string;
  /** Under the month in the middle, e.g. "på Stidsholt". */
  subtitle?: string;
  /** The month the year starts with (1-12) - a school year: 8 (August). Default 8. */
  startMonth?: number;
  /** The picture behind the opening line. */
  image?: string;
  months: { month: number; events: { title: string; text?: string; image?: string; href?: string }[] }[];
  /** The last card, e.g. { label: "Book en rundvisning", href: "#kontakt" } with a line above it. */
  cta?: { title: string; label: string; href: string };
  /** Seconds per month when it plays by itself. Default 4. */
  seconds?: number;
};

export type PlaceCard = {
  /** The scan points in the 3D tour where the card comes up. */
  ss: number[];
  /** Points on the drone scene / map (their ids) whose 360° photo shows the card when it opens - like arriving in a room. */
  points?: string[];
  title: string;
  text: string;
  more?: { label: string; text: string };
  buttons?: ({ label: string; room: string } | { label: string; href: string })[];
  seconds?: number;
  /**
   * The people you meet here - e.g. the kitchen staff by the dining hall, or
   * a line's teachers in its room: up to 3, each a small round photo under
   * the text, with name and role if given (both may be left out - then just the photo). More than 3 are left out. Left out =
   * none.
   */
  people?: CardPerson[];
};
export type CardPerson = { name?: string; role?: string; image: string };

/** One part of a day on a line ("En dag på din linje"): when, what, where in the tour - and who you're with there. */
export type LineDayStop = {
  /** Short and unique within the day, e.g. "morgenmad". */
  id: string;
  /** "07.25", "Før 7.25", "Eftermiddag". */
  time: string;
  /** Over the title, e.g. "Stalden på Gården" or "Actionhuset". */
  place?: string;
  title: string;
  text?: string;
  /** Where in the tour (a place link, as in the menu) - left out: the stop has no place, only its text. */
  href?: string;
  /** The people met there (up to 4): teachers, the rider, the kitchen. */
  people?: CardPerson[];
  /** Small facts as chips, e.g. "Fitness", "Lys ud kl. 23.00". */
  tags?: string[];
};

/** What the Find vej button can step aside for: a place card, "Din plads venter", the stories playing, "Du er fremme". */
export type FindStepAside = "cards" | "nudge" | "stories" | "arrived";
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
  /**
   * Book from the customer's webshop: a product page with a date calendar (e.g.
   * https://webshop.nymarksminde.dk/da/product/bed-and-breakfast). The card gets
   * "Vælg datoer": the days that can be booked (the shop's own calendar, read
   * every 10 minutes), guests, the shop's price for the stay - and Book, which
   * opens the product in the shop. `label`: the button's words (default "Vælg datoer").
   */
  shop?: { url: string; label?: string };
  /** Where the point is on the tour's site plan (sitePlan), as fractions of the plan picture (x1, y1, x2, y2) - gives the card a button that shows the plan zoomed in on it. */
  planBox?: [number, number, number, number];
  text: string;
  chips: string[];
  /** A short line over the name, e.g. "Med traktor og vogn, alle åbningsdage". */
  kicker?: string;
  /** Facts in two columns, e.g. ["Afgang", "Kl. 13.30"], ["Pris", "20 kr. pr. person"]. */
  facts?: [string, string][];
  /** A video at the top of the card (instead of the photos). */
  video?: { src: string; poster?: string };
  /** A good tip, in small type under the text. */
  tip?: string;
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
  /** false: the menu's top shows only the logo - no name and subtitle under it (for a logo that already says the name). */
  menuName?: false;
  /** What's behind the logo (the welcome box, the logo in the tour): left out = automatic (a light card behind a dark logo, the main colour behind a light one); "none" = transparent; "light" = white; "main" = the main colour. */
  logoBg?: "none" | "light" | "main";
  /** The same for the logo on the welcome tiles' box (left out: as logoBg). */
  logoBgTiles?: "none" | "light" | "main";
  /** Where the logo sits in the welcome tiles' box (left out: in the middle). */
  logoAlignTiles?: "left" | "right";
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
  /** `phone` (a flat picture on an upright phone): "fit" = the whole picture, or how much of the screen's height it fills (0.5-1; left out = 1, fills it - dragged sideways). */
  /**
   * `cover`: a picture that isn't a full 360° - e.g. a 180° photo - with how
   * many degrees it covers across (h) and up/down (v). Shown as a picture you
   * look around in, only as far as it goes (no black beyond its edges) -
   * wherever it's used (menu, points, the guide, the drone scene). Left out =
   * a 2:1 picture is a full 360°, any other a flat photo.
   */
  imageView?: Record<string, { desktop?: number; mobile?: number; yaw?: number; pitch?: number; phone?: "fit" | number; cover?: PanoCover }>;
  /** The "Fliser" (bento) menu's tiles (design.menu "bento") - left out: made from the main action and the menu. */
  bento?: { tiles: BentoTile[] };
  /** Set by Arpo when the tour is saved: each 360° photo's smaller copies (by the photo's address). */
  panoCopies?: Record<string, PanoCopies>;
  overviewUi?: {
    box?: { desktop?: false; mobile?: false };
    filter?: { desktop?: false; mobile?: false };
    /** true: on a phone the top box shows the title beside the logo (only when there is room for it). Left out: the logo and the button only - the logo says the name. */
    titleMobile?: true;
    /** The points' names on the drone scene / map: always, only when zoomed in, or never (the open point's card has the name). Default: computer always, phone when zoomed in. */
    names?: { desktop?: "always" | "zoom" | "never"; mobile?: "always" | "zoom" | "never" };
    /** The points' size (icon and name) on the drone scene / map, per device: 1 = normal. Default: computer 1, phone 0.85. */
    pointSize?: { desktop?: number; mobile?: number };
    /** Phones: the filter's categories in rows of 2-4 of the same width. Default: all shown, as many to a row as fit. */
    filterColumns?: 2 | 3 | 4;
    /** Phones: the categories in one row to scroll sideways instead (fewer lines over the picture). */
    filterScroll?: true;
  };
  /**
   * How one can look around the 360° aerial photo, per device (left out = as always):
   * `down`/`up` = how far down/up one can look (degrees, -90 = straight down),
   * `zoomIn`/`zoomOut` = the closest and widest view (field of view in degrees),
   * `point` = the view when a point is pressed: "keep" the zoom, or a field of view (small = in, big = out).
   */
  droneLook?: { desktop?: DroneLook; mobile?: DroneLook };
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
  sitePlan?: {
    image: string;
    label: string;
    /**
     * "Pladskort" over the flat start picture (`map`): the site plan laid
     * see-through on top of the drone photo, switched on and off by the
     * visitor. `corners` = where the plan's four corners land on the picture
     * (x, y in % of it; top left, top right, bottom right, bottom left), so it
     * can follow a photo that isn't quite straight down. `opacity` 0.2-1
     * (default 0.55). On a 360° start picture (a 360° map) the corners are
     * spots on the 360° photo (x, y in % of it, like the points): the plan lies
     * on the ground there and stays put while the visitor turns.
     */
    overlay?: { corners: [[number, number], [number, number], [number, number], [number, number]]; opacity?: number };
    /** The pitches and cabins on the plan (x, y in % of the plan picture) - lit green when free for the dates the visitor picks. `id` = the booking system's id. */
    units?: SiteUnit[];
    /** The plan picture before its background was made see-through (Gør baggrunden gennemsigtig) - to go back to. */
    imageBefore?: string;
    /** The units' kinds (the booking's categories): their name on the tour, colour and a place in the tour to walk round in. */
    unitCats?: Record<string, { label?: string; color?: string; tour?: string }>;
    /** Live availability from Next-Stay (the campsite's booking): `tenantId` from its booking address (online.next-stay-booking.dk/search/<tenantId>); `book` = where "Book" goes (default that booking page). */
    nextStay?: { tenantId: string; book?: string };
  };
  /** `walks: false`: its points' cards don't show walking times (e.g. Faciliteter - the pitches show the way to them instead). */
  categories: Record<string, { name: string; color: string; walks?: false }>;
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
    /** "none" = straight into the tour - the welcome's tiles are kept (not shown), so they're back when a start with tiles is chosen again. */
    welcome: "tiles" | "cover" | "simple" | "none";
    menu: "side" | "dock" | "picker" | "simple" | "bento";
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
  /** Steder: real spots with a photo, written once - the cover's places, the dock's "Steder" and welcome tiles with `place`. */
  places?: TourPlace[];
  cover?: {
    kicker: string;
    title: string;
    lead: string;
    image: string;
    imageMobile?: string;
    enter: string;
    placesTitle: string;
    /**
     * "Forside med film": a film (e.g. the drone flying in) runs silently in a
     * loop behind the cover instead of the still photo - the photo is shown
     * while it loads, and instead of it for visitors who have turned motion
     * off or save data. `srcMobile`: an upright version for phones. Keep it
     * short and small (720p, 2-4 MB, no sound). Set = the tour starts as
     * "Forside med film"; the film before the tour (`intro`) isn't used then.
     */
    video?: { src: string; srcMobile?: string };
  };
  dock?: { label: string; icon: DockIcon; go: "places" | "guide" | { href: string }; primary?: boolean }[];
  /**
   * "Vis mig rundt": the tour flies from stop to stop by itself with a short
   * text at each - and a voice, if the stop has one. A stop can borrow a drone point's name and text ({ point: id }).
   * The tour's main guided tour; more of them in `guides`.
   */
  guide?: GuideSetup;
  /**
   * More guided tours beside the main one (`guide`), each with its own name,
   * stops and settings - e.g. one per linjefag ("Padel", "Ridning") next to
   * "Vis mig rundt" for the whole school. Started from a welcome tile
   * ({ guide: "<id>" }) or any link "#rundvisning:<id>" (menu, tiles, buttons,
   * dock); the menu's "Vis mig rundt" then lets the visitor choose. The main
   * one is "#rundvisning". `id`: short, lowercase, no spaces (e.g. "padel").
   * `linkOnly`: shown nowhere in the tour (menu, "Vis mig rundt", welcome,
   * cover) - only the tour's own link with "?rundvisning=<id>" starts it, e.g.
   * a guided tour of just the facilities for one page on the customer's site
   * or a mail. Left out = shown like the others.
   */
  guides?: (GuideSetup & { id: string; title: string; linkOnly?: true })[];
  /**
   * "Vej til skolen": the visitor types their address (or postcode) and sees
   * how far it is and how long it takes by car, bike and on foot - and a link
   * to the journey by bus/train in Google Maps. `meet` = when one meets
   * ("08:10"), shown with the bus link. Opened from any link "#vej".
   */
  commute?: {
    place: string;
    lat: number;
    lon: number;
    title?: string;
    meet?: string;
    /** The address as found (shown in the editor). */
    address?: string;
    /** Ways left out (a bike or a walk over 45 / 60 minutes is never shown anyway). */
    hide?: { car?: true; bike?: true; walk?: true; transit?: true };
    /** A button on the tour that opens it (left out: none - from the menu and links "#vej" only). */
    button?: "under-menu" | "bottom-left" | "bottom-right";
  };
  /** The voice that reads the guided tours' stops aloud (ElevenLabs) - each tour its own. */
  voice?: { id: string; name: string };
  /** Seconds from a stop showing until its voice starts (all stops, every guided tour) - left out: at once. */
  voiceDelay?: number;
  /**
   * "Sådan ser en dag ud": the day as a calm timeline (time, what happens,
   * and where - "Se stedet" shows it). For visitors who like to know what's
   * coming, e.g. a special efterskole. A step without href has no place.
   */
  /**
   * "En dag på din linje": the visitor picks a line and lives a school day -
   * the line's own places and the school's shared ones woven together,
   * each with its time, a few words and the people met there. `shared` =
   * the stops every line has (written once); each line lists its day as ids
   * of shared stops and its own stops. "Lidt af det hele" (`mix`) is the
   * shared day with a short visit to every line (each line's `signature`
   * stop, default its first own stop) after the shared stop `mix.after`.
   * Opened by the link "#linjedag" (the picker) or "#linjedag:<line id>".
   * `visit` = the ending's call to action (e.g. the next besøgsaften).
   */
  lineDays?: {
    title: string;
    lead?: string;
    shared: LineDayStop[];
    lines: {
      id: string;
      name: string;
      /** "... der starter i stalden, før du har åbnet en bog." */
      teaser?: string;
      /** The line's teachers on the picker and its stops (up to 4). */
      people?: CardPerson[];
      /** The day in order: a shared stop's id, or a stop of the line's own. */
      day: (string | LineDayStop)[];
      /** The line's stop shown in "Lidt af det hele" - its id; left out = its first own stop. */
      signature?: string;
      /** The ending's line, e.g. "Linjen fylder 7 timer om ugen - resten af tiden er du sammen med hele skolen." */
      outro?: string;
    }[];
    mix?: false | { title?: string; after?: string };
    visit?: { title: string; text?: string; label: string; href: string };
  };
  day?: { title: string; lead?: string; /** Its place in the menu, as a guided tour's. */ menu?: "bottom" | false; steps: { time: string; title: string; text?: string; /** Where "Se stedet" goes: a place in the tour (a Matterport link), a point on the drone scene / map ("#punkt:<id>" - its card opens), or that point's 360° photo ("#punkt:<id>/360"). Left out: no place. */ href?: string }[] };
  /**
   * Info points: small pulsing dots on things in the room; a tap opens a card.
   * `position` is a spot in the 3D model (placed with "Placér infopunkt" in the
   * prototype panel), `ss` the scan points it's shown from.
   */
  info?: TourInfo[];
  /** Virtual staging: videos, pictures, web pages, signs and the year wheel on surfaces in the tour (see StagingItem). */
  staging?: StagingItem[];
  /** The year wheel (see YearWheel) - opened by "#aarshjul", and on a screen as staging. */
  yearWheel?: YearWheel;
  /**
   * Cards that come up when the visitor arrives at a scan point (MPSkins'
   * "sweep action" popups): one at a time, bottom-left, gone by themselves
   * after `seconds` unless the visitor reads on. `more` = a second page
   * ("Læs mere"); a button flies to a room by its menu name or opens a link.
   */
  placeCards?: PlaceCard[];
  /** How big the place cards (and the card that comes by itself) are: "lille" (title, two lines, the buttons - for phones above all), "mellem" (the default), "stor". They scale with the screen either way (a small phone gets smaller ones). */
  placeCardSize?: "lille" | "mellem" | "stor";
  /**
   * "Få det læst op" on the place cards: the device reads the card's title and
   * text aloud (its own voice, in the tour's language - free, nothing to make).
   * For visitors who find reading hard. `label`: the button's words (default
   * "Svært ved at læse? Få det læst op"). Left out: no button.
   */
  placeCardVoice?: { label?: string };
  /** Which side the place cards stand on, per device - left out: the left (bottom left corner). */
  placeCardSide?: { desktop?: "right"; mobile?: "right" };
  /** How big the card of "Vis mig rundt" is: "lille" (title, a few lines, the buttons), "mellem" (the default), "stor" (the whole width on a phone). Scales with the screen either way. */
  guideCardSize?: "lille" | "mellem" | "stor";
  /** Its size on a phone, when it should differ from guideCardSize (left out: the same). */
  guideCardSizeMobile?: "lille" | "mellem" | "stor";
  /** A card that comes by itself after a while (e.g. "Din plads venter") - never while the menu or a place card is open. */
  nudge?: { afterSeconds: number; title: string; text: string; buttons: { label: string; href: string; primary?: boolean }[] };
  /**
   * A contact form inside the tour ("Skriv til os") - no popup to the
   * customer's own form: the message is mailed to `to` (the customer), with
   * the visitor's address to answer. Opened from the contact box, and from any
   * link "#kontakt" (menu, buttons). `phone`: false = no phone field.
   */
  /**
   * `inBox`: its button in the contact box - true: always, false: never.
   * Left out: only when no main button (cta) already opens the form (#kontakt),
   * so the same thing isn't offered twice. `boxLabel`: that button's own text.
   */
  contactForm?: { to: string; title?: string; lead?: string; phone?: boolean; thanks?: string; inBox?: boolean; boxLabel?: string };
  /** Phones: no pinch-zoom in the tour, and a little zoomed out (MPSkins' mobile zoom lock). */
  mobileZoomLock?: boolean;
  /** How zoomed the view is, per device: 1 = Matterport's normal, under 1 = zoomed out (more of the room), over 1 = zoomed in. */
  zoom?: { desktop?: number; mobile?: number };
  /**
   * "Find vej": the visitor picks a room (from the menu) or a box number, and
   * the tour walks them there from where they stand, scan point by scan point.
   * `boxes`: box number -> link to the scan point in front of it.
   */
  /** `button`: where the Find vej button stands, per device ("menu" = not shown; open it from a menu item "#findvej"). Left out: top centre on a computer, bottom right on a phone. */
  /** `arrive`: the button on "Du er fremme" - its own (label and link, e.g. "#live"), or false for none. Left out: the tour's main button. */
  /** The button stays on the screen (the standard); `stepAside`: what it steps aside for instead ("Træd til side for"). `always: false` (older): steps aside for all of them. Staying - also while a place card, "Din plads venter", the stories or "Du er fremme" show (on a phone it moves up out of their way). `arriveHide`: "Du er fremme" goes by itself after so many seconds (left out = it stays until closed). */
  /**
   * "Find vej". `skip`: places from the menu (by their link) it doesn't offer -
   * every place in the menu can be found unless left out here, so new menu
   * places come with by themselves.
   */
  wayfinding?: { skip?: string[]; boxes?: Record<string, string>; button?: { desktop?: FindButtonPlace; mobile?: FindButtonPlace }; arrive?: { label: string; href: string } | false; always?: boolean; stepAside?: FindStepAside[]; arriveHide?: number };
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
  /** Right after stepping in: a short arrow to where the menu is - on phones, or on every screen. Left out = none. */
  menuHint?: "mobile" | "all";
  /**
   * false: on a website the tour starts with a play button (a picture, its
   * name and "Gå ind i touren") - nothing loads until it's pressed, and then
   * it opens in full screen. Default: it starts by itself.
   */
  autoplay?: false;
  /**
   * On a phone, where the tour sits in someone's page. Left out (the
   * standard): it loads in the frame, and the first tap in it puts it in full
   * screen (an iPhone, where a frame can't go full screen, gets a "Fuld skærm"
   * button that opens it in its own tab). "play": a picture with a play button
   * first - nothing loads until it's pressed. "inline": it stays in the frame.
   */
  phoneEmbed?: "inline" | "play";
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
    /** "priser": prices and memberships (a gym's memberships, a menu …) - shown without counts, "ledig" or badges. Default: free units. */
    kind?: "priser";
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
    /**
     * `place`: the tile is one of the tour's Steder (`places`, by name) - it
     * takes its name, small heading, photo and spot from there, so a place is
     * written once. The tile's own title/kicker/image only win when filled in.
     */
    tiles: { kicker: string; title: string; go: WelcomeGo; style: "dark" | "light" | "accent"; recommended?: boolean; image?: string; place?: string }[];
    skip: string;
    /**
     * A looping film behind the tiles instead of the tour itself (e.g. the
     * drone film) - muted, played over and over; `srcMobile` is a lighter
     * version for phones. Without it, the tiles lie over the tour.
     */
    video?: {
      src: string;
      srcMobile?: string;
      /** How big the tiles are over the film - "small" leaves the most film in view (few tiles: small/medium; many: medium/large). Default "medium". */
      size?: "small" | "medium" | "large";
      /** Where the tiles sit on the film, so they don't cover what matters in it. Default "bottom". */
      place?: "bottom" | "center" | "top" | "bottom-left" | "bottom-right";
      /** The same on phones (an upright screen - other parts of the film show): size default `size`, place default "bottom". */
      sizeMobile?: "small" | "medium" | "large";
      placeMobile?: "bottom" | "center" | "top";
    };
  };
  /** "free": walk around as in Matterport. "points": only the menu and points move you. */
  navigation: "free" | "points";
  /**
   * "Låst inde i rummene" (with "free"): the hidden scan points (Scanpunkter,
   * MPSkins) stay closed even where the menu links to them. A place in the
   * menu takes the visitor in, and there they stay - no walking out to other
   * points - until they choose something in the menu. Everywhere else they
   * walk freely. (The start point is never locked.)
   */
  lockInHidden?: true;
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
