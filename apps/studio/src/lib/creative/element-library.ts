import { z } from "zod";

const ICONIFY_API = "https://api.iconify.design";
/**
 * Icon sets we search. Restricted to permissively licensed collections so a
 * design can ship without an attribution audit — the licence travels with each
 * inserted element and is shown in the inspector.
 */
const ICONIFY_PREFIXES = [
  "tabler",
  "lucide",
  "ph",
  "mdi",
  "material-symbols",
  "heroicons",
  "carbon",
  "iconoir",
  "bi",
  "ri",
  "akar-icons",
  "majesticons",
  "teenyicons",
  "pixelarticons",
  "simple-icons",
  "fluent-emoji-flat",
  "twemoji",
] as const;

const ICONIFY_COLLECTIONS = {
  tabler: {
    name: "Tabler Icons",
    license: "MIT",
    author: "Paweł Kuna",
    sourceUrl: "https://github.com/tabler/tabler-icons",
  },
  lucide: {
    name: "Lucide",
    license: "ISC",
    author: "Lucide Contributors",
    sourceUrl: "https://github.com/lucide-icons/lucide",
  },
  ph: {
    name: "Phosphor Icons",
    license: "MIT",
    author: "Phosphor Icons",
    sourceUrl: "https://github.com/phosphor-icons/core",
  },
  mdi: {
    name: "Material Design Icons",
    license: "Apache-2.0",
    author: "Pictogrammers",
    sourceUrl: "https://github.com/Templarian/MaterialDesign",
  },
  "material-symbols": {
    name: "Material Symbols",
    license: "Apache-2.0",
    author: "Google",
    sourceUrl: "https://github.com/google/material-design-icons",
  },
  heroicons: {
    name: "Heroicons",
    license: "MIT",
    author: "Tailwind Labs",
    sourceUrl: "https://github.com/tailwindlabs/heroicons",
  },
  carbon: {
    name: "Carbon",
    license: "Apache-2.0",
    author: "IBM",
    sourceUrl: "https://github.com/carbon-design-system/carbon",
  },
  iconoir: {
    name: "Iconoir",
    license: "MIT",
    author: "Luca Burgio",
    sourceUrl: "https://github.com/iconoir-icons/iconoir",
  },
  bi: {
    name: "Bootstrap Icons",
    license: "MIT",
    author: "The Bootstrap Authors",
    sourceUrl: "https://github.com/twbs/icons",
  },
  ri: {
    name: "Remix Icon",
    license: "Apache-2.0",
    author: "Remix Design",
    sourceUrl: "https://github.com/Remix-Design/RemixIcon",
  },
  "akar-icons": {
    name: "Akar Icons",
    license: "MIT",
    author: "Arturo Wibawa",
    sourceUrl: "https://github.com/artcoholic/akar-icons",
  },
  majesticons: {
    name: "Majesticons",
    license: "MIT",
    author: "Gerrit Halfmann",
    sourceUrl: "https://github.com/halfmage/majesticons",
  },
  teenyicons: {
    name: "Teenyicons",
    license: "MIT",
    author: "Anja van Staden",
    sourceUrl: "https://github.com/teenyicons/teenyicons",
  },
  pixelarticons: {
    name: "Pixelarticons",
    license: "MIT",
    author: "Gerrit Halfmann",
    sourceUrl: "https://github.com/halfmage/pixelarticons",
  },
  "simple-icons": {
    name: "Simple Icons",
    license: "CC0-1.0",
    author: "Simple Icons Collaborators",
    sourceUrl: "https://github.com/simple-icons/simple-icons",
  },
  "fluent-emoji-flat": {
    name: "Fluent Emoji Flat",
    license: "MIT",
    author: "Microsoft",
    sourceUrl: "https://github.com/microsoft/fluentui-emoji",
  },
  twemoji: {
    name: "Twemoji",
    license: "CC-BY-4.0",
    author: "Twitter",
    sourceUrl: "https://github.com/jdecked/twemoji",
  },
} as const;

const iconifySearchSchema = z.object({
  icons: z.array(z.string()).default([]),
});

const svgCache = new Map<string, string>();

export type CreativeLibraryAsset = {
  id: string;
  name: string;
  provider: "iconify" | "open-doodles" | "svgl";
  collection: string;
  license: string;
  author: string;
  sourceUrl: string;
  assetUrl: string;
  previewUrl: string;
  recolorable: boolean;
  /**
   * The asset carries its own colours, so previews must show it as an image
   * rather than as a mask filled with one colour — a brand mark flattened to a
   * silhouette is not recognisable, which defeats picking it by eye.
   */
  fullColor?: boolean;
  /** Drawn for dark backgrounds; a pale tile would render it near-invisible. */
  previewOnDark?: boolean;
};

export const CURATED_ILLUSTRATIONS: CreativeLibraryAsset[] = [
  {
    id: "open-doodles:sprinting",
    name: "Sprinting",
    provider: "open-doodles",
    collection: "Open Doodles",
    license: "CC0-1.0",
    author: "Pablo Stanley",
    sourceUrl: "https://opendoodles.s3-us-west-1.amazonaws.com/sprinting.svg",
    assetUrl: "/api/creative/assets/open-doodles/sprinting",
    previewUrl: "/api/creative/assets/open-doodles/sprinting",
    recolorable: false,
  },
  {
    id: "open-doodles:swinging",
    name: "Swinging",
    provider: "open-doodles",
    collection: "Open Doodles",
    license: "CC0-1.0",
    author: "Pablo Stanley",
    sourceUrl: "https://opendoodles.s3-us-west-1.amazonaws.com/swinging.svg",
    assetUrl: "/api/creative/assets/open-doodles/swinging",
    previewUrl: "/api/creative/assets/open-doodles/swinging",
    recolorable: false,
  },
  {
    id: "open-doodles:coffee",
    name: "Coffee",
    provider: "open-doodles",
    collection: "Open Doodles",
    license: "CC0-1.0",
    author: "Pablo Stanley",
    sourceUrl: "https://opendoodles.s3-us-west-1.amazonaws.com/coffee.svg",
    assetUrl: "/api/creative/assets/open-doodles/coffee",
    previewUrl: "/api/creative/assets/open-doodles/coffee",
    recolorable: false,
  },
  {
    id: "open-doodles:loving",
    name: "Loving",
    provider: "open-doodles",
    collection: "Open Doodles",
    license: "CC0-1.0",
    author: "Pablo Stanley",
    sourceUrl: "https://opendoodles.s3-us-west-1.amazonaws.com/loving.svg",
    assetUrl: "/api/creative/assets/open-doodles/loving",
    previewUrl: "/api/creative/assets/open-doodles/loving",
    recolorable: false,
  },
];

export async function searchIconifyAssets(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<CreativeLibraryAsset[]> {
  const query = rawQuery.trim().slice(0, 80) || "sparkle";
  const url = new URL("/search", ICONIFY_API);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "72");
  url.searchParams.set("prefixes", ICONIFY_PREFIXES.join(","));

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Element search failed (${response.status})`);
  }

  const result = iconifySearchSchema.parse(await response.json());
  return result.icons.flatMap((id) => {
    const [prefix, name] = id.split(":");
    if (!name || !isIconifyPrefix(prefix)) return [];
    const collection = ICONIFY_COLLECTIONS[prefix];
    return [
      {
        id,
        name: humanizeIconName(name),
        provider: "iconify" as const,
        collection: collection.name,
        license: collection.license,
        author: collection.author,
        sourceUrl: collection.sourceUrl,
        assetUrl: `${ICONIFY_API}/${prefix}/${name}.svg?color=currentColor`,
        previewUrl: `${ICONIFY_API}/${prefix}/${name}.svg?color=%23EF7B16`,
        recolorable: true,
      },
    ];
  });
}

const SVGL_API = "https://api.svgl.app";

/**
 * A mark's file, which svgl gives either as one URL or as a light/dark pair.
 *
 * The light variant is preferred: it is the one drawn for pale backgrounds, and
 * Studio slides are pale far more often than not. Falls back to whichever exists.
 */
const svglRouteSchema = z.union([
  z.string(),
  z.object({ light: z.string().optional(), dark: z.string().optional() }),
]);

const svglSearchSchema = z.array(
  z.object({
    id: z.number(),
    title: z.string(),
    category: z.union([z.string(), z.array(z.string())]),
    route: svglRouteSchema,
    wordmark: svglRouteSchema.optional(),
    url: z.string().optional(),
    brandUrl: z.string().optional(),
  }),
);

/** Only the file path travels to our proxy; it pins the host itself. */
function svglFilePath(direct?: string) {
  if (!direct) return null;
  const match = /\/library\/(.+\.svg)$/i.exec(direct);
  return match?.[1] ?? null;
}

/**
 * Brand logos from svgl.
 *
 * Marks are never recolourable. A brand mark in the wrong colour is no longer
 * that brand's mark, and the whole point of reaching for one is that it is the
 * real thing.
 */
/** One of the up-to-four files svgl publishes per brand. */
type SvglVariant = {
  file: string;
  suffix: string;
  label: string;
  onDark: boolean;
};

/**
 * Every variant a brand entry offers.
 *
 * svgl publishes a mark and sometimes a wordmark, each of which may come as a
 * light/dark pair — up to four files. They are listed as separate tiles rather
 * than collapsed to one: which lockup and which polarity you want is the whole
 * decision when placing a logo, and picking for you gets it wrong most times.
 *
 * A light/dark pair is labelled by its odd one out: the light file keeps the
 * plain name, since that is the one wanted on a pale slide.
 */
function svglVariants(entry: {
  title: string;
  route: z.infer<typeof svglRouteSchema>;
  wordmark?: z.infer<typeof svglRouteSchema>;
}): SvglVariant[] {
  const variants: SvglVariant[] = [];

  const add = (
    kind: "mark" | "wordmark",
    theme: "light" | "dark" | null,
    raw?: string,
  ) => {
    const file = svglFilePath(raw);
    if (!file) return;
    const lockup =
      kind === "wordmark" ? `${entry.title} wordmark` : entry.title;
    variants.push({
      file,
      suffix: `${kind}-${theme ?? "default"}`,
      label: theme === "dark" ? `${lockup} (dark)` : lockup,
      onDark: theme === "dark",
    });
  };

  const spread = (
    kind: "mark" | "wordmark",
    route?: z.infer<typeof svglRouteSchema>,
  ) => {
    if (!route) return;
    if (typeof route === "string") add(kind, null, route);
    else {
      add(kind, "light", route.light);
      add(kind, "dark", route.dark);
    }
  };

  spread("mark", entry.route);
  spread("wordmark", entry.wordmark);
  return variants;
}

/**
 * Brand logos from svgl.
 *
 * Marks are never recolourable. A brand mark in the wrong colour is no longer
 * that brand's mark, and the whole point of reaching for one is that it is the
 * real thing.
 */
export async function searchSvglAssets(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<CreativeLibraryAsset[]> {
  const query = rawQuery.trim().slice(0, 80);
  const url = new URL(SVGL_API);
  // No query means the newest marks rather than an error; svgl caps `limit`
  // itself, and a full dump would be hundreds of entries.
  if (query) url.searchParams.set("search", query);
  else url.searchParams.set("limit", "48");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Logo search failed (${response.status})`);
  }

  const result = svglSearchSchema.parse(await response.json());
  return result.flatMap((entry) => {
    // The public API occasionally returns metadata-only rows without an image
    // route. They cannot become canvas assets, so exclude them before passing
    // the narrowed entry to the variant normalizer.
    if (!entry.route) return [];
    const category = Array.isArray(entry.category)
      ? (entry.category[0] ?? "Brand")
      : entry.category;
    return svglVariants({ ...entry, route: entry.route }).map((variant) => ({
      id: `svgl:${entry.id}:${variant.suffix}`,
      name: variant.label,
      provider: "svgl" as const,
      collection: category,
      // Not a licence we grant: the mark belongs to its owner, and svgl links
      // the brand's own terms where it has them.
      license: "Brand mark — owner's terms",
      author: entry.title,
      sourceUrl: entry.brandUrl || entry.url || "https://svgl.app",
      assetUrl: `/api/creative/assets/svgl/${variant.file}`,
      previewUrl: `/api/creative/assets/svgl/${variant.file}`,
      recolorable: false,
      fullColor: true,
      previewOnDark: variant.onDark,
    }));
  });
}

export async function fetchLibraryAssetSvg(
  asset: CreativeLibraryAsset,
  signal?: AbortSignal,
) {
  const cached = svgCache.get(asset.assetUrl);
  if (cached) return cached;

  const response = await fetch(asset.assetUrl, { signal });
  if (!response.ok) {
    throw new Error(`Could not load ${asset.name} (${response.status})`);
  }
  const svg = await response.text();
  assertSafeSvg(svg);
  svgCache.set(asset.assetUrl, svg);
  return svg;
}

function isIconifyPrefix(
  value: string,
): value is keyof typeof ICONIFY_COLLECTIONS {
  return Object.hasOwn(ICONIFY_COLLECTIONS, value);
}

function humanizeIconName(value: string) {
  return value
    .replace(/-(bold|duotone|fill|light|thin)$/i, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function assertSafeSvg(svg: string) {
  const normalized = svg.trim();
  if (!/<svg\b/i.test(normalized) || normalized.length > 250_000) {
    throw new Error("The element provider returned an invalid SVG.");
  }
  if (
    /<(?:script|foreignObject|iframe|image)\b/i.test(normalized) ||
    /\b(?:href|xlink:href)\s*=/i.test(normalized)
  ) {
    throw new Error("The element contains unsupported external content.");
  }
}
