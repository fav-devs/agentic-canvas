"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconArrowLeft,
  IconBrush,
  IconChevronDown,
  IconDotsVertical,
  IconPalette,
  IconPhotoPlus,
  IconRectangle,
  IconSend,
  IconSettings,
  IconStack2,
  IconTypography,
} from "@tabler/icons-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { CreativeElement } from "@/lib/creative/document";

export type MobileStudioTool =
  "text" | "uploads" | "elements" | "draw" | "layers" | "background";

const DOCK_TOOLS: Array<{
  id: MobileStudioTool;
  label: string;
  icon: typeof IconTypography;
}> = [
  { id: "text", label: "Text", icon: IconTypography },
  { id: "uploads", label: "Photos", icon: IconPhotoPlus },
  { id: "elements", label: "Elements", icon: IconRectangle },
  { id: "draw", label: "Draw", icon: IconBrush },
  { id: "layers", label: "Layers", icon: IconStack2 },
  { id: "background", label: "Canvas", icon: IconPalette },
];

const SAVE_LABELS = {
  saved: "Saved",
  dirty: "Unsaved",
  saving: "Saving…",
  conflict: "Edited elsewhere",
  error: "Couldn’t save",
} as const;

/**
 * The editor on phones: a full-viewport surface with its own dock, portalled to
 * the body so it escapes the app's scroll container, header, and bottom nav.
 *
 * Panels live in drawers rather than beside the canvas — on a phone the canvas
 * needs every pixel, and a control you summon is better than one that's always
 * eating a third of the screen.
 */
export function MobileStudioShell({
  title,
  saveState,
  activeTool,
  selectedElement,
  canUndo,
  canRedo,
  busy,
  canvas,
  filmstrip,
  tools,
  inspector,
  menu,
  onBack,
  onToolChange,
  onUndo,
  onRedo,
  onSendToCompose,
}: {
  title: string;
  saveState: keyof typeof SAVE_LABELS;
  activeTool: MobileStudioTool;
  selectedElement?: CreativeElement;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  canvas: ReactNode;
  filmstrip: ReactNode;
  tools: ReactNode;
  inspector: ReactNode;
  /** Document-level actions (rename, export, slide management). */
  menu: ReactNode;
  onBack(): void;
  onToolChange(tool: MobileStudioTool): void;
  onUndo(): void;
  onRedo(): void;
  onSendToCompose?(): void;
}) {
  const [mounted, setMounted] = useState(false);
  const [sheet, setSheet] = useState<"tools" | "properties" | "menu" | null>(
    null,
  );

  useEffect(() => setMounted(true), []);

  // Losing the selection closes the properties sheet — it would otherwise sit
  // there describing nothing.
  useEffect(() => {
    if (!selectedElement) {
      setSheet((current) => (current === "properties" ? null : current));
    }
  }, [selectedElement]);

  if (!mounted) return null;

  const openTool = (tool: MobileStudioTool) => {
    onToolChange(tool);
    setSheet("tools");
  };

  return createPortal(
    <main
      className="fixed inset-0 flex flex-col overflow-hidden bg-[var(--tray)]"
      style={{
        zIndex: 80,
        paddingTop: "env(safe-area-inset-top)",
        fontFamily: "var(--font-outfit)",
      }}
    >
      <header className="flex shrink-0 items-center gap-1 px-2 py-2">
        <DockIconButton label="All designs" onClick={onBack}>
          <IconArrowLeft className="size-5" />
        </DockIconButton>

        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p
            className="text-[11px] text-muted-foreground"
            aria-live="polite"
            style={
              saveState === "conflict" || saveState === "error"
                ? { color: "#E5484D" }
                : undefined
            }
          >
            {SAVE_LABELS[saveState]}
          </p>
        </div>

        <DockIconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
          <UndoGlyph />
        </DockIconButton>
        <DockIconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
          <UndoGlyph flipped />
        </DockIconButton>
        <DockIconButton label="More" onClick={() => setSheet("menu")}>
          <IconDotsVertical className="size-5" />
        </DockIconButton>
        {onSendToCompose ? (
          <button
            type="button"
            onClick={onSendToCompose}
            disabled={busy}
            aria-label="Use in a post"
            className="ml-1 flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-foreground transition-opacity disabled:opacity-50"
            style={{
              border: "1.5px solid transparent",
              backgroundImage:
                "linear-gradient(var(--tray),var(--tray)),var(--grad-brand)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box,border-box",
            }}
          >
            <IconSend className="size-4" />
            Post
          </button>
        ) : null}
      </header>

      {/* The canvas takes every pixel left over from the chrome. */}
      <div className="min-h-0 flex-1 bg-[var(--canvas)]">{canvas}</div>

      {/* The filmstrip carries its own top hairline. */}
      <div className="shrink-0">{filmstrip}</div>

      <nav
        aria-label="Studio tools"
        className="flex shrink-0 items-stretch gap-0.5 border-t border-[var(--hairline)] px-1 pt-1"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      >
        {DOCK_TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => openTool(id)}
            aria-pressed={sheet === "tools" && activeTool === id}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors"
            style={
              sheet === "tools" && activeTool === id
                ? {
                    backgroundColor: "var(--inset)",
                    color: "var(--foreground)",
                  }
                : { color: "var(--muted-foreground)" }
            }
          >
            <Icon className="size-[19px]" stroke={1.8} />
            {label}
          </button>
        ))}

        {/* Contextual slot: edits whatever is selected, or the slide itself. */}
        <button
          type="button"
          onClick={() => setSheet("properties")}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition-colors"
          style={{
            backgroundColor: selectedElement ? "var(--inset)" : undefined,
            color: selectedElement
              ? "var(--foreground)"
              : "var(--muted-foreground)",
            border: selectedElement
              ? "1px solid var(--hairline)"
              : "1px solid transparent",
          }}
        >
          <IconSettings className="size-[19px]" stroke={1.8} />
          {selectedElement ? "Edit" : "Slide"}
        </button>
      </nav>

      <StudioSheet
        open={sheet !== null}
        title={
          sheet === "properties"
            ? selectedElement
              ? "Edit"
              : "Slide"
            : sheet === "menu"
              ? "Design"
              : "Add"
        }
        onClose={() => setSheet(null)}
      >
        {sheet === "properties" ? inspector : sheet === "menu" ? menu : tools}
      </StudioSheet>
    </main>,
    document.body,
  );
}

/**
 * Bottom sheet for the dock panels. Fixed height with the content scrolling
 * inside it: animating the height against the visual viewport is what makes
 * these janky when the iOS keyboard opens.
 */
function StudioSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* Inline height: the base DrawerContent sets max-h through a
          data-attribute variant, which would out-specify a utility class. */}
      <DrawerContent style={{ maxHeight: "68dvh" }}>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <div className="flex items-center justify-between px-4 pb-1 pt-1">
          <span className="text-xs font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <IconChevronDown className="size-4" />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DockIconButton({
  children,
  label,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Undo/redo arrow, mirrored for redo so the pair reads as one control. */
function UndoGlyph({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={flipped ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-4" />
    </svg>
  );
}
