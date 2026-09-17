"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CREATIVE_FONT_CATEGORIES,
  ensureCatalogueFont,
  filterCatalogue,
  type CreativeFontCategory,
} from "@/lib/creative/font-catalogue";

/**
 * The font shelf, as a grid of specimens.
 *
 * Each tile sets the family's own name in that family, so the tile *is* the
 * preview — there is nothing to read except the thing you are choosing. A grid
 * rather than a list because a list of sixty faces is sixty scroll steps to see
 * the shelf, and picking a typeface is a visual comparison: you want several in
 * the eye at once.
 *
 * No category caption on the tiles. "sans" under a face you can already see is
 * a word about the font rather than the font itself; the filter above still
 * narrows by category for anyone who wants that.
 *
 * Faces load lazily as tiles scroll into view — sixty stylesheets fetched up
 * front would cost more than the rest of the editor put together.
 */
export function FontPicker({
  activeFamily,
  customFamilies = [],
  onSelect,
}: {
  activeFamily?: string;
  /** Fonts the user uploaded; already registered, so no fetch needed. */
  customFamilies?: string[];
  onSelect(family: string): void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CreativeFontCategory | "all">("all");

  const fonts = useMemo(
    () => filterCatalogue(query, category),
    [query, category],
  );
  const customMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (category !== "all") return [];
    return customFamilies.filter(
      (family) => !needle || family.toLowerCase().includes(needle),
    );
  }, [category, customFamilies, query]);

  return (
    <div className="space-y-2.5">
      <label className="relative block">
        <IconSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search fonts"
          aria-label="Search fonts"
          className="h-9 w-full rounded-xl bg-transparent pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground"
          style={{ border: "1px solid var(--hairline)" }}
        />
      </label>

      <div className="flex flex-wrap gap-1">
        {[
          { id: "all" as const, label: "All" },
          ...CREATIVE_FONT_CATEGORIES,
        ].map((option) => {
          const active = category === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(option.id)}
              className="rounded-lg px-2 py-1 text-[10px] font-medium transition-colors"
              style={{
                border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
                backgroundColor: active ? "var(--inset)" : undefined,
                color: active ? "var(--foreground)" : "var(--muted-foreground)",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {customMatches.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your fonts
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {customMatches.map((family) => (
              <FontTile
                key={family}
                family={family}
                active={family === activeFamily}
                // Uploaded faces are registered when the document loads.
                preload={false}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ) : null}

      {fonts.length === 0 && customMatches.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          No fonts match “{query}”.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {fonts.map((font) => (
            <FontTile
              key={font.family}
              family={font.family}
              active={font.family === activeFamily}
              preload={!font.builtin}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inspector control for choosing a font. Native select popups cannot
 * inherit the Studio theme and become unusably tall with the full catalogue,
 * so the trigger opens the same searchable visual shelf used by the Text tool.
 */
export function FontSelectControl({
  value,
  customFamilies = [],
  onChange,
}: {
  value: string;
  customFamilies?: string[];
  onChange(family: string): void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose font"
          aria-expanded={open}
          className="flex h-9 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-xs font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
          style={{
            border: "1px solid var(--hairline)",
            backgroundColor: "var(--inset)",
          }}
        >
          <span
            className="min-w-0 flex-1 truncate"
            style={{ fontFamily: `"${value}", sans-serif` }}
          >
            {value}
          </span>
          <IconChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-[min(340px,calc(100vw-24px))] rounded-2xl p-3"
        style={{
          backgroundColor: "var(--tray)",
          border: "1px solid var(--hairline)",
          boxShadow: "0 14px 40px rgba(0,0,0,.28)",
        }}
      >
        <div className="max-h-[min(420px,62vh)] overflow-y-auto overscroll-contain pr-1">
          <FontPicker
            activeFamily={value}
            customFamilies={customFamilies}
            onSelect={(family) => {
              void ensureCatalogueFont(family);
              onChange(family);
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FontTile({
  family,
  active,
  preload,
  onSelect,
}: {
  family: string;
  active: boolean;
  preload: boolean;
  onSelect(family: string): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(!preload);

  useEffect(() => {
    if (!preload || loaded) return;
    const element = ref.current;
    if (!element) return;

    // Fetch the face only once the tile is actually on screen.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void ensureCatalogueFont(family).then(() => setLoaded(true));
      },
      { rootMargin: "160px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [family, loaded, preload]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(family)}
      aria-pressed={active}
      // The name is set in its own face, which can make it hard to read at a
      // glance for display faces — the tooltip always says it plainly.
      title={family}
      className="flex h-[62px] items-center justify-center overflow-hidden rounded-xl px-2 text-center transition-colors hover:bg-foreground/[0.05]"
      style={{
        border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
        backgroundColor: active ? "var(--inset)" : undefined,
      }}
    >
      <span
        className="line-clamp-2 text-[17px] leading-tight text-foreground"
        // Falls back to the UI font until the face lands, so a tile never
        // renders blank while it's fetching.
        style={loaded ? { fontFamily: `"${family}", sans-serif` } : undefined}
      >
        {family}
      </span>
    </button>
  );
}
