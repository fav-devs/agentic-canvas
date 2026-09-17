/**
 * The font shelf.
 *
 * Fonts are fetched from Google Fonts on demand rather than bundled: pulling
 * sixty families through next/font would ship every one of them to every
 * visitor. A family's stylesheet is injected the first time it is previewed or
 * applied, and the canvas waits on `document.fonts` before drawing so text
 * never renders in the fallback.
 */

export type CreativeFontCategory =
  "sans" | "serif" | "display" | "handwriting" | "mono";

export type CatalogueFont = {
  family: string;
  category: CreativeFontCategory;
  /**
   * Weights to request. These must exist for the family — the Google CSS API
   * rejects the whole request if one doesn't, which would drop the font
   * entirely rather than just that weight.
   */
  weights: number[];
  /** Already present (app font or system stack); never fetched. */
  builtin?: boolean;
};

export const CREATIVE_FONT_CATEGORIES: Array<{
  id: CreativeFontCategory;
  label: string;
}> = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Hand" },
  { id: "mono", label: "Mono" },
];

const SINGLE = [400];
const REGULAR_BOLD = [400, 700];

export const CREATIVE_FONT_CATALOGUE: CatalogueFont[] = [
  // Shipped with the app or available on every system.
  { family: "Outfit", category: "sans", weights: REGULAR_BOLD, builtin: true },
  {
    family: "Geist Sans",
    category: "sans",
    weights: REGULAR_BOLD,
    builtin: true,
  },
  {
    family: "Geist Mono",
    category: "mono",
    weights: REGULAR_BOLD,
    builtin: true,
  },
  { family: "Arial", category: "sans", weights: REGULAR_BOLD, builtin: true },
  { family: "Verdana", category: "sans", weights: REGULAR_BOLD, builtin: true },
  {
    family: "Trebuchet MS",
    category: "sans",
    weights: REGULAR_BOLD,
    builtin: true,
  },
  {
    family: "Georgia",
    category: "serif",
    weights: REGULAR_BOLD,
    builtin: true,
  },
  {
    family: "Times New Roman",
    category: "serif",
    weights: REGULAR_BOLD,
    builtin: true,
  },
  {
    family: "Courier New",
    category: "mono",
    weights: REGULAR_BOLD,
    builtin: true,
  },

  // Sans
  { family: "Inter", category: "sans", weights: REGULAR_BOLD },
  { family: "Poppins", category: "sans", weights: REGULAR_BOLD },
  { family: "Montserrat", category: "sans", weights: REGULAR_BOLD },
  { family: "Raleway", category: "sans", weights: REGULAR_BOLD },
  { family: "Work Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "Nunito", category: "sans", weights: REGULAR_BOLD },
  { family: "Rubik", category: "sans", weights: REGULAR_BOLD },
  { family: "DM Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "Manrope", category: "sans", weights: REGULAR_BOLD },
  { family: "Karla", category: "sans", weights: REGULAR_BOLD },
  { family: "Barlow", category: "sans", weights: REGULAR_BOLD },
  { family: "Figtree", category: "sans", weights: REGULAR_BOLD },
  { family: "Archivo", category: "sans", weights: REGULAR_BOLD },
  { family: "Space Grotesk", category: "sans", weights: REGULAR_BOLD },
  { family: "Plus Jakarta Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "Lexend", category: "sans", weights: REGULAR_BOLD },
  { family: "Sora", category: "sans", weights: REGULAR_BOLD },
  { family: "Urbanist", category: "sans", weights: REGULAR_BOLD },
  { family: "Mulish", category: "sans", weights: REGULAR_BOLD },
  { family: "Noto Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "Source Sans 3", category: "sans", weights: REGULAR_BOLD },
  { family: "Roboto", category: "sans", weights: REGULAR_BOLD },
  { family: "Lato", category: "sans", weights: REGULAR_BOLD },
  { family: "Open Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "Ubuntu", category: "sans", weights: REGULAR_BOLD },
  { family: "Cabin", category: "sans", weights: REGULAR_BOLD },
  { family: "Quicksand", category: "sans", weights: REGULAR_BOLD },
  { family: "Josefin Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "League Spartan", category: "sans", weights: REGULAR_BOLD },
  { family: "Albert Sans", category: "sans", weights: REGULAR_BOLD },
  { family: "Exo 2", category: "sans", weights: REGULAR_BOLD },

  // Serif
  { family: "Playfair Display", category: "serif", weights: REGULAR_BOLD },
  { family: "Merriweather", category: "serif", weights: REGULAR_BOLD },
  { family: "Lora", category: "serif", weights: REGULAR_BOLD },
  { family: "Cormorant Garamond", category: "serif", weights: REGULAR_BOLD },
  { family: "Libre Baskerville", category: "serif", weights: REGULAR_BOLD },
  { family: "EB Garamond", category: "serif", weights: REGULAR_BOLD },
  { family: "Source Serif 4", category: "serif", weights: REGULAR_BOLD },
  { family: "Crimson Text", category: "serif", weights: REGULAR_BOLD },
  { family: "Bitter", category: "serif", weights: REGULAR_BOLD },
  { family: "Spectral", category: "serif", weights: REGULAR_BOLD },
  { family: "Fraunces", category: "serif", weights: REGULAR_BOLD },
  { family: "DM Serif Display", category: "serif", weights: SINGLE },
  { family: "Noto Serif", category: "serif", weights: REGULAR_BOLD },
  { family: "Bodoni Moda", category: "serif", weights: REGULAR_BOLD },
  { family: "Cardo", category: "serif", weights: REGULAR_BOLD },
  { family: "Prata", category: "serif", weights: SINGLE },
  { family: "Cormorant", category: "serif", weights: REGULAR_BOLD },
  { family: "Young Serif", category: "serif", weights: SINGLE },
  { family: "Newsreader", category: "serif", weights: REGULAR_BOLD },
  { family: "Instrument Serif", category: "serif", weights: SINGLE },
  { family: "Gloock", category: "serif", weights: SINGLE },
  { family: "Libre Caslon Text", category: "serif", weights: REGULAR_BOLD },

  // Display
  { family: "Bebas Neue", category: "display", weights: SINGLE },
  { family: "Anton", category: "display", weights: SINGLE },
  { family: "Oswald", category: "display", weights: REGULAR_BOLD },
  { family: "Alfa Slab One", category: "display", weights: SINGLE },
  { family: "Righteous", category: "display", weights: SINGLE },
  { family: "Abril Fatface", category: "display", weights: SINGLE },
  { family: "Archivo Black", category: "display", weights: SINGLE },
  { family: "Bungee", category: "display", weights: SINGLE },
  { family: "Titan One", category: "display", weights: SINGLE },
  { family: "Lilita One", category: "display", weights: SINGLE },
  { family: "Staatliches", category: "display", weights: SINGLE },
  { family: "Chewy", category: "display", weights: SINGLE },
  { family: "Fredoka", category: "display", weights: REGULAR_BOLD },
  { family: "Bangers", category: "display", weights: SINGLE },
  { family: "Black Ops One", category: "display", weights: SINGLE },
  { family: "Bowlby One SC", category: "display", weights: SINGLE },
  { family: "Monoton", category: "display", weights: SINGLE },
  { family: "Press Start 2P", category: "display", weights: SINGLE },
  { family: "Luckiest Guy", category: "display", weights: SINGLE },
  { family: "Unbounded", category: "display", weights: REGULAR_BOLD },

  // Handwriting
  { family: "Caveat", category: "handwriting", weights: REGULAR_BOLD },
  { family: "Pacifico", category: "handwriting", weights: SINGLE },
  { family: "Dancing Script", category: "handwriting", weights: REGULAR_BOLD },
  { family: "Satisfy", category: "handwriting", weights: SINGLE },
  { family: "Great Vibes", category: "handwriting", weights: SINGLE },
  { family: "Shadows Into Light", category: "handwriting", weights: SINGLE },
  { family: "Permanent Marker", category: "handwriting", weights: SINGLE },
  { family: "Sacramento", category: "handwriting", weights: SINGLE },
  { family: "Kalam", category: "handwriting", weights: REGULAR_BOLD },
  { family: "Amatic SC", category: "handwriting", weights: REGULAR_BOLD },
  { family: "Indie Flower", category: "handwriting", weights: SINGLE },
  { family: "Patrick Hand", category: "handwriting", weights: SINGLE },
  { family: "Courgette", category: "handwriting", weights: SINGLE },
  { family: "Handlee", category: "handwriting", weights: SINGLE },
  { family: "Gloria Hallelujah", category: "handwriting", weights: SINGLE },
  { family: "Rock Salt", category: "handwriting", weights: SINGLE },
  { family: "Allura", category: "handwriting", weights: SINGLE },
  { family: "Architects Daughter", category: "handwriting", weights: SINGLE },

  // Mono
  { family: "JetBrains Mono", category: "mono", weights: REGULAR_BOLD },
  { family: "Space Mono", category: "mono", weights: REGULAR_BOLD },
  { family: "IBM Plex Mono", category: "mono", weights: REGULAR_BOLD },
  { family: "Roboto Mono", category: "mono", weights: REGULAR_BOLD },
  { family: "Fira Code", category: "mono", weights: REGULAR_BOLD },
  { family: "Source Code Pro", category: "mono", weights: REGULAR_BOLD },
  { family: "Inconsolata", category: "mono", weights: REGULAR_BOLD },
  { family: "Anonymous Pro", category: "mono", weights: REGULAR_BOLD },
  { family: "Azeret Mono", category: "mono", weights: REGULAR_BOLD },
  { family: "DM Mono", category: "mono", weights: SINGLE },
  { family: "Red Hat Mono", category: "mono", weights: REGULAR_BOLD },
  { family: "Martian Mono", category: "mono", weights: REGULAR_BOLD },
];

const CATALOGUE_BY_FAMILY = new Map(
  CREATIVE_FONT_CATALOGUE.map((font) => [font.family, font]),
);

export function findCatalogueFont(family: string) {
  return CATALOGUE_BY_FAMILY.get(family);
}

/** Stylesheet URL for a family, pinned to the weights it actually has. */
export function googleFontCssUrl(font: CatalogueFont) {
  const family = font.family.replace(/ /g, "+");
  const weights = [...new Set(font.weights)].sort((a, b) => a - b).join(";");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap`;
}

/** Filter + search, as the sidebar list uses it. */
export function filterCatalogue(
  query: string,
  category: CreativeFontCategory | "all",
) {
  const needle = query.trim().toLowerCase();
  return CREATIVE_FONT_CATALOGUE.filter((font) => {
    if (category !== "all" && font.category !== category) return false;
    return !needle || font.family.toLowerCase().includes(needle);
  });
}

const loadedFamilies = new Map<string, Promise<void>>();
/** Families whose faces were verified resident after loading. */
const residentFamilies = new Set<string>();
/** Families that were requested but never became resident (network, 404). */
const failedFamilies = new Set<string>();

const STYLESHEET_TIMEOUT_MS = 8_000;

/** Resolve once a stylesheet <link> has loaded (or failed / timed out). */
function awaitStylesheet(link: HTMLLinkElement): Promise<void> {
  if ((link as HTMLLinkElement & { sheet?: unknown }).sheet) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, STYLESHEET_TIMEOUT_MS);
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
  });
}

/**
 * Make a family usable — both for CSS previews and for canvas drawing, which
 * silently falls back unless the face is actually resident.
 */
export function ensureCatalogueFont(family: string): Promise<void> {
  const font = CATALOGUE_BY_FAMILY.get(family);
  if (!font || font.builtin || typeof window === "undefined") {
    return Promise.resolve();
  }

  const existing = loadedFamilies.get(family);
  if (existing) return existing;

  const pending = (async () => {
    const href = googleFontCssUrl(font);
    let link = globalThis.document.querySelector<HTMLLinkElement>(
      `link[href="${href}"]`,
    );
    if (!link) {
      link = globalThis.document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      globalThis.document.head.append(link);
    }
    // document.fonts.load() resolves with nothing when the @font-face rules
    // have not been parsed yet, so a canvas that draws straight away silently
    // falls back (the headless renderer hit exactly this). Wait for the
    // stylesheet first, then fetch the faces, then verify they are resident.
    await awaitStylesheet(link);
    await Promise.allSettled(
      font.weights.map((weight) =>
        globalThis.document.fonts.load(`${weight} 32px "${family}"`),
      ),
    );
    const resident = font.weights.some((weight) =>
      globalThis.document.fonts.check(`${weight} 32px "${family}"`),
    );
    if (resident) {
      residentFamilies.add(family);
      failedFamilies.delete(family);
    } else {
      failedFamilies.add(family);
      // Let a later call retry instead of caching the miss forever.
      loadedFamilies.delete(family);
    }
  })().catch(() => {
    // A failed font shouldn't wedge the editor; it just renders in fallback.
    failedFamilies.add(family);
    loadedFamilies.delete(family);
  });

  loadedFamilies.set(family, pending);
  return pending;
}

/** Preload every catalogue font a page's text actually uses. */
export function ensureFontsForFamilies(families: Iterable<string>) {
  return Promise.allSettled(
    [...new Set(families)].map((family) => ensureCatalogueFont(family)),
  );
}

/**
 * Same as ensureFontsForFamilies, but says which catalogue families did not
 * become resident so an export can report "rendered with fallback" instead
 * of shipping a serif nobody asked for.
 */
export async function ensureFontsForFamiliesWithStatus(
  families: Iterable<string>,
): Promise<{ loaded: string[]; missing: string[] }> {
  const wanted = [...new Set(families)].filter((family) => {
    const font = CATALOGUE_BY_FAMILY.get(family);
    return !!font && !font.builtin;
  });
  await ensureFontsForFamilies(wanted);
  return {
    loaded: wanted.filter((family) => residentFamilies.has(family)),
    missing: wanted.filter((family) => !residentFamilies.has(family)),
  };
}
