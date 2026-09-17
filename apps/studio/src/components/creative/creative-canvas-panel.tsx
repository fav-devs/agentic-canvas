"use client";

import { useState, type ComponentProps, type RefObject } from "react";
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowLeft,
  IconArrowRight,
  IconBackground,
  IconBrush,
  IconChevronDown,
  IconChevronUp,
  IconClipboard,
  IconCopy,
  IconDots,
  IconEye,
  IconEyeOff,
  IconLayersDifference,
  IconLayersSubtract,
  IconLayoutColumns,
  IconLink,
  IconLock,
  IconLockOpen,
  IconPlus,
  IconScissors,
  IconTrash,
  IconUnlink,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type {
  CreativeDocument,
  CreativeFont,
  CreativePage,
} from "@/lib/creative/document";
import { isSmartElement } from "@/lib/creative/document";
import type { SpreadCount } from "@/lib/creative/seamless-spread";
import { STUDIO_DRAG_MIME } from "@/lib/creative/drag-payload";
import { FabricStage, type FabricStageHandle } from "./fabric-stage";
import { CreativePageThumbnail } from "./creative-page-thumbnail";

type FabricStageProps = ComponentProps<typeof FabricStage>;

export function CreativeCanvasPanel({
  stageRef,
  document,
  activePage,
  stagePage = activePage,
  activePageIndex,
  spreadPages,
  spreadCount = 1,
  onSpreadCountChange,
  selectedElementId,
  selectedElementIds = selectedElementId ? [selectedElementId] : [],
  selectionGrouped = false,
  filmstripExpanded,
  onDuplicatePage,
  onRemovePage,
  onTogglePageHidden,
  onMovePage,
  onSelectElement,
  onSelectionChange,
  onTransform,
  onTransforms,
  onTextChange,
  onToggleFilmstrip,
  onSelectPage,
  onAddPage,
  onDropFiles,
  onDropAsset,
  onImageFrameDrop,
  onDuplicateElement,
  onDuplicateSelection,
  onCutSelection,
  onCopySelection,
  onPaste,
  onCopyStyle,
  onPasteStyle,
  onDeleteSelection,
  onSelectAll,
  canPaste = false,
  canPasteStyle = false,
  onRemoveElement,
  onReorderElement,
  onSetElementLocked,
  onSetElementAcrossPages,
  onSetImageAsBackground,
  onGroupSelection,
  onUngroupSelection,
  drawing,
  onStrokeCommit,
  onErasePoint,
  variant = "desktop",
}: {
  stageRef: RefObject<FabricStageHandle | null>;
  document: CreativeDocument;
  activePage: CreativePage;
  /** Editor-only composition of consecutive slides when spread mode is on. */
  stagePage?: CreativePage;
  activePageIndex: number;
  spreadPages?: CreativePage[];
  spreadCount?: SpreadCount;
  onSpreadCountChange?(count: SpreadCount): void;
  selectedElementId?: string;
  selectedElementIds?: string[];
  selectionGrouped?: boolean;
  filmstripExpanded: boolean;
  onDuplicatePage(pageId: string): void;
  onRemovePage(pageId: string): void;
  onTogglePageHidden(pageId: string): void;
  onMovePage(index: number, pageId: string): void;
  onSelectElement: FabricStageProps["onSelect"];
  onSelectionChange?: FabricStageProps["onSelectionChange"];
  onTransform: FabricStageProps["onTransform"];
  onTransforms?: FabricStageProps["onTransforms"];
  onTextChange: FabricStageProps["onTextChange"];
  onToggleFilmstrip(): void;
  onSelectPage(pageId: string): void;
  onAddPage(): void;
  onDropFiles(files: File[], point: { x: number; y: number }): void;
  /** An element dragged from the library, dropped at `point` (document coords). */
  onDropAsset?(assetJson: string, point: { x: number; y: number }): void;
  onImageFrameDrop?(imageId: string, frameId: string): void;
  onDuplicateElement?(elementId: string): void;
  onDuplicateSelection?(): void;
  onCutSelection?(): void;
  onCopySelection?(): void;
  onPaste?(): void;
  onCopyStyle?(): void;
  onPasteStyle?(): void;
  onDeleteSelection?(): void;
  onSelectAll?(): void;
  canPaste?: boolean;
  canPasteStyle?: boolean;
  onRemoveElement?(elementId: string): void;
  onReorderElement?(
    elementId: string,
    action: "front" | "forward" | "backward" | "back",
  ): void;
  onSetElementLocked?(elementId: string, locked: boolean): void;
  onSetElementAcrossPages?(elementId: string, acrossPages: boolean): void;
  onSetImageAsBackground?(elementId: string): void;
  onGroupSelection?(): void;
  onUngroupSelection?(): void;
  drawing?: FabricStageProps["drawing"];
  onStrokeCommit?: FabricStageProps["onStrokeCommit"];
  onErasePoint?: FabricStageProps["onErasePoint"];
  /**
   * "mobile" drops the slide toolbar and filmstrip — the immersive shell owns
   * that chrome and the canvas needs the space.
   */
  variant?: "desktop" | "mobile";
}) {
  const [dropping, setDropping] = useState(false);
  const [contextElementId, setContextElementId] = useState<string>();
  const mobile = variant === "mobile";
  const contextElement = stagePage.elements.find(
    (element) => element.id === contextElementId,
  );
  const hasSelection = Boolean(contextElement);
  const shownOnEveryPage = contextElement
    ? isSmartElement(contextElement)
    : false;
  const builtInEveryPageElement =
    contextElement?.type === "widget" || contextElement?.type === "tag";
  const shortcut = (keys: string) => (
    <span className="ml-auto pl-6 text-[10px] text-muted-foreground">
      {keys}
    </span>
  );

  return (
    <div
      className={`flex h-full min-w-0 flex-col bg-[var(--canvas)] ${
        mobile ? "" : "min-h-[540px]"
      }`}
    >
      {/* Dropping an image onto a frame fills it; anywhere else places it. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`relative min-h-0 flex-1 ${mobile ? "p-3" : "p-4 sm:p-7"}`}
            onDragOver={(event) => {
              const types = event.dataTransfer.types;
              const isAsset = types.includes(STUDIO_DRAG_MIME);
              if (!types.includes("Files") && !isAsset) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              if (!dropping) setDropping(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) {
                return;
              }
              setDropping(false);
            }}
            onDrop={(event) => {
              const assetJson = event.dataTransfer.getData(STUDIO_DRAG_MIME);
              const files = event.dataTransfer.files
                ? Array.from(event.dataTransfer.files)
                : [];
              if (!assetJson && files.length === 0) return;
              event.preventDefault();
              setDropping(false);
              const point = stageRef.current?.toDocumentPoint(
                event.clientX,
                event.clientY,
              );
              if (!point) return;
              if (assetJson && onDropAsset) onDropAsset(assetJson, point);
              else if (files.length > 0) onDropFiles(files, point);
            }}
          >
            {!mobile && onSpreadCountChange ? (
              <div className="absolute left-7 top-7 z-20 flex h-9 items-center gap-0.5 rounded-xl border border-[var(--hairline)] bg-[var(--tray)] p-1 shadow-sm">
                <span className="flex items-center gap-1 px-2 text-[11px] font-medium text-muted-foreground">
                  <IconLayoutColumns className="size-3.5" />
                  Spread
                </span>
                {([1, 2, 3] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onSpreadCountChange(count)}
                    className={`grid size-7 place-items-center rounded-lg text-[11px] font-semibold tabular-nums transition-colors ${
                      spreadCount === count
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                    }`}
                    aria-label={
                      count === 1
                        ? "Edit one slide"
                        : `Edit ${count} slides as one seamless spread`
                    }
                    aria-pressed={spreadCount === count}
                  >
                    {count}
                  </button>
                ))}
              </div>
            ) : null}
            {selectedElementIds.length > 1 ? (
              <div className="absolute left-1/2 top-7 z-20 flex h-9 -translate-x-1/2 items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--tray)] px-2 shadow-sm">
                <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
                  {selectedElementIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={
                    selectionGrouped ? onUngroupSelection : onGroupSelection
                  }
                  className="flex h-7 items-center gap-1.5 rounded-lg bg-foreground px-2.5 text-[11px] font-semibold text-background transition-opacity hover:opacity-85"
                >
                  {selectionGrouped ? (
                    <IconUnlink className="size-3.5" />
                  ) : (
                    <IconLink className="size-3.5" />
                  )}
                  {selectionGrouped ? "Ungroup" : "Group"}
                </button>
              </div>
            ) : null}
            {dropping ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-3 z-10 rounded-2xl sm:inset-6"
                style={{
                  border: "2px dashed var(--studio-accent)",
                  backgroundColor:
                    "color-mix(in srgb, var(--studio-accent) 8%, transparent)",
                }}
              />
            ) : null}
            <FabricStage
              // Fabric wraps the supplied canvas with its own lower/upper
              // canvas pair. Reusing that DOM node while the logical artboard
              // changes size lets the outgoing wrapper survive long enough to
              // sit over the replacement (dispose is asynchronous in Fabric).
              // A fresh stage root keeps spread switches atomic, so the old
              // single-page surface can never cover the new spread background.
              key={`${document.canvas.width * spreadCount}x${document.canvas.height}`}
              ref={stageRef}
              page={stagePage}
              fonts={document.fonts}
              pageIndex={activePageIndex}
              pageCount={document.pages.length}
              width={document.canvas.width * spreadCount}
              height={document.canvas.height}
              spreadPages={spreadPages}
              spreadPageWidth={document.canvas.width}
              selectedElementId={selectedElementId}
              selectedElementIds={selectedElementIds}
              onSelect={onSelectElement}
              onSelectionChange={onSelectionChange}
              onTransform={onTransform}
              onTransforms={onTransforms}
              onTextChange={onTextChange}
              onImageFrameDrop={onImageFrameDrop}
              onContextTarget={setContextElementId}
              drawing={drawing}
              onStrokeCommit={onStrokeCommit}
              onErasePoint={onErasePoint}
              touch={mobile}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="min-w-60 rounded-xl border-[var(--hairline)] p-1.5"
          style={{ backgroundColor: "var(--tray)" }}
        >
          <ContextMenuLabel className="max-w-56 truncate px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {selectedElementIds.length > 1
              ? `${selectedElementIds.length} elements`
              : (contextElement?.name ?? "Canvas")}
          </ContextMenuLabel>
          <ContextMenuItem
            disabled={!hasSelection}
            className="rounded-lg text-xs"
            onSelect={onCutSelection}
          >
            <IconScissors />
            Cut
            {shortcut("⌘X")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelection}
            className="rounded-lg text-xs"
            onSelect={onCopySelection}
          >
            <IconCopy />
            Copy
            {shortcut("⌘C")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canPaste}
            className="rounded-lg text-xs"
            onSelect={onPaste}
          >
            <IconClipboard />
            Paste
            {shortcut("⌘V")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelection}
            className="rounded-lg text-xs"
            onSelect={() => {
              if (onDuplicateSelection) onDuplicateSelection();
              else if (contextElement) onDuplicateElement?.(contextElement.id);
            }}
          >
            <IconCopy />
            Duplicate
            {shortcut("⌘D")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!hasSelection}
            className="rounded-lg text-xs"
            onSelect={onCopyStyle}
          >
            <IconBrush />
            Copy style
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelection || !canPasteStyle}
            className="rounded-lg text-xs"
            onSelect={onPasteStyle}
          >
            <IconBrush />
            Paste style
          </ContextMenuItem>
          {selectedElementIds.length > 1 ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="rounded-lg text-xs"
                onSelect={
                  selectionGrouped ? onUngroupSelection : onGroupSelection
                }
              >
                {selectionGrouped ? <IconUnlink /> : <IconLink />}
                {selectionGrouped ? "Ungroup" : "Group"}
                {shortcut(selectionGrouped ? "⇧⌘G" : "⌘G")}
              </ContextMenuItem>
            </>
          ) : null}
          {contextElement ? (
            <>
              {contextElement.type === "image" && onSetImageAsBackground ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="rounded-lg text-xs"
                    onSelect={() => onSetImageAsBackground(contextElement.id)}
                  >
                    <IconBackground />
                    Set image as background
                  </ContextMenuItem>
                </>
              ) : null}
              {!contextElement.seamlessId && onSetElementAcrossPages ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    disabled={builtInEveryPageElement}
                    className="rounded-lg text-xs"
                    onSelect={() =>
                      onSetElementAcrossPages(
                        contextElement.id,
                        !shownOnEveryPage,
                      )
                    }
                  >
                    {shownOnEveryPage ? <IconUnlink /> : <IconLink />}
                    {builtInEveryPageElement
                      ? "Shown on every page"
                      : shownOnEveryPage
                        ? "Detach on this page"
                        : "Show on all pages"}
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem
                className="rounded-lg text-xs"
                onSelect={() => onReorderElement?.(contextElement.id, "front")}
              >
                <IconLayersDifference />
                Bring to front
              </ContextMenuItem>
              <ContextMenuItem
                className="rounded-lg text-xs"
                onSelect={() =>
                  onReorderElement?.(contextElement.id, "forward")
                }
              >
                <IconArrowBarToRight />
                Bring forward
              </ContextMenuItem>
              <ContextMenuItem
                className="rounded-lg text-xs"
                onSelect={() =>
                  onReorderElement?.(contextElement.id, "backward")
                }
              >
                <IconArrowBarToLeft />
                Send backward
              </ContextMenuItem>
              <ContextMenuItem
                className="rounded-lg text-xs"
                onSelect={() => onReorderElement?.(contextElement.id, "back")}
              >
                <IconLayersSubtract />
                Send to back
              </ContextMenuItem>
              <ContextMenuItem
                className="rounded-lg text-xs"
                onSelect={() =>
                  onSetElementLocked?.(
                    contextElement.id,
                    !contextElement.locked,
                  )
                }
              >
                {contextElement.locked ? <IconLockOpen /> : <IconLock />}
                {contextElement.locked ? "Unlock" : "Lock"}
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="rounded-lg text-xs"
            onSelect={onSelectAll}
          >
            <IconDots />
            Select all
            {shortcut("⌘A")}
          </ContextMenuItem>
          {hasSelection ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                className="rounded-lg text-xs"
                onSelect={() => {
                  if (onDeleteSelection) onDeleteSelection();
                  else if (contextElement) onRemoveElement?.(contextElement.id);
                }}
              >
                <IconTrash />
                Delete
                {shortcut("⌫")}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>

      {mobile ? null : (
        <PageFilmstrip
          pages={document.pages}
          fonts={document.fonts}
          canvasWidth={document.canvas.width}
          canvasHeight={document.canvas.height}
          activePageId={activePage.id}
          expanded={filmstripExpanded}
          canvasLabel={`${document.canvas.width} × ${document.canvas.height}`}
          onToggleExpanded={onToggleFilmstrip}
          onSelect={onSelectPage}
          onAdd={onAddPage}
          onDuplicate={onDuplicatePage}
          onRemove={onRemovePage}
          onToggleHidden={onTogglePageHidden}
          onMove={onMovePage}
        />
      )}
    </div>
  );
}

/** Mime type for the internal page drag, so the canvas's file drop ignores it. */
const PAGE_DRAG_TYPE = "application/x-agentic-canvas-page";

export function PageFilmstrip({
  pages,
  fonts,
  canvasWidth,
  canvasHeight,
  activePageId,
  expanded,
  compact = false,
  canvasLabel,
  onToggleExpanded,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onMove,
}: {
  pages: CreativePage[];
  fonts: CreativeFont[];
  canvasWidth: number;
  canvasHeight: number;
  activePageId: string;
  expanded: boolean;
  /** Slim, always-collapsed strip for the mobile dock. */
  compact?: boolean;
  canvasLabel?: string;
  onToggleExpanded(): void;
  onSelect(pageId: string): void;
  onAdd(): void;
  onDuplicate?(pageId: string): void;
  onRemove?(pageId: string): void;
  onToggleHidden?(pageId: string): void;
  onMove?(index: number, pageId: string): void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const interactive = !compact && Boolean(onDuplicate && onRemove && onMove);

  const endDrag = () => {
    setDraggingId(null);
    setDropIndex(null);
  };

  return (
    <section
      className="shrink-0 border-t border-[var(--hairline)] bg-[var(--tray)]"
      aria-label="Carousel pages"
    >
      {compact ? null : (
        <div className="flex h-10 items-center gap-2 px-3">
          <span className="text-xs font-medium text-foreground">Pages</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {pages.length}
          </span>
          {canvasLabel ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              · {canvasLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onToggleExpanded}
            className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-expanded={expanded}
          >
            {expanded ? "Collapse" : "Expand"}
            {expanded ? (
              <IconChevronDown className="size-3.5" />
            ) : (
              <IconChevronUp className="size-3.5" />
            )}
          </button>
        </div>
      )}
      <div
        className={`flex overflow-x-auto ${
          compact
            ? "h-[74px] items-center gap-2 px-2 py-1.5"
            : `gap-3 px-3 pb-3 transition-[height] duration-200 ${
                expanded ? "h-52" : "h-32"
              }`
        }`}
        onDragOver={
          interactive
            ? (event) => {
                if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            : undefined
        }
        onDrop={
          interactive
            ? (event) => {
                if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
                event.preventDefault();
                const id = event.dataTransfer.getData(PAGE_DRAG_TYPE);
                if (id && dropIndex !== null) onMove?.(dropIndex, id);
                endDrag();
              }
            : undefined
        }
        onDragLeave={
          interactive
            ? (event) => {
                // dragleave also fires when crossing between thumbnails, which
                // would flicker the marker off and straight back on.
                if (event.currentTarget.contains(event.relatedTarget as Node)) {
                  return;
                }
                setDropIndex(null);
              }
            : undefined
        }
      >
        {pages.map((page, index) => {
          const active = page.id === activePageId;
          const width = compact ? "w-11" : expanded ? "w-28" : "w-16";
          return (
            <div
              key={page.id}
              className={`group/slide relative flex shrink-0 flex-col gap-1.5 transition-[width] duration-200 ${width}`}
              draggable={interactive}
              onDragStart={
                interactive
                  ? (event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(PAGE_DRAG_TYPE, page.id);
                      setDraggingId(page.id);
                    }
                  : undefined
              }
              onDragEnd={interactive ? endDrag : undefined}
              onDragOver={
                interactive
                  ? (event) => {
                      if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) {
                        return;
                      }
                      event.preventDefault();
                      // Drop before or after this slide depending on which half
                      // of it the pointer is over.
                      const bounds =
                        event.currentTarget.getBoundingClientRect();
                      const after =
                        event.clientX > bounds.left + bounds.width / 2;
                      setDropIndex(after ? index + 1 : index);
                    }
                  : undefined
              }
              style={draggingId === page.id ? { opacity: 0.4 } : undefined}
            >
              {/* Insertion marker for the pending drop position. */}
              {interactive && dropIndex === index ? (
                <span
                  aria-hidden
                  className="absolute -left-1.5 top-0 z-10 h-[calc(100%-1.25rem)] w-0.5 rounded-full"
                  style={{ backgroundColor: "var(--studio-accent)" }}
                />
              ) : null}
              {interactive && dropIndex === index + 1 ? (
                <span
                  aria-hidden
                  className="absolute -right-1.5 top-0 z-10 h-[calc(100%-1.25rem)] w-0.5 rounded-full"
                  style={{ backgroundColor: "var(--studio-accent)" }}
                />
              ) : null}

              <button
                type="button"
                onClick={() => onSelect(page.id)}
                aria-pressed={active}
                aria-label={`Slide ${index + 1}`}
                className="block w-full text-left"
              >
                <span
                  className="relative flex w-full items-center justify-center overflow-hidden rounded-xl"
                  style={{
                    aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                    backgroundColor: page.background,
                    border: active
                      ? "2px solid var(--studio-accent)"
                      : "1px solid var(--hairline)",
                    boxShadow: active
                      ? "0 0 0 2px color-mix(in srgb, var(--studio-accent) 18%, transparent)"
                      : undefined,
                  }}
                >
                  <span
                    className={
                      page.hidden ? "block size-full opacity-30" : "contents"
                    }
                  >
                    <CreativePageThumbnail
                      page={page}
                      fonts={fonts}
                      pageIndex={index}
                      pageCount={pages.length}
                      width={canvasWidth}
                      height={canvasHeight}
                      debounceMs={90}
                    />
                  </span>
                  {page.hidden ? (
                    <span
                      className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-0.5 text-[9px] font-medium text-foreground"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--tray) 85%, transparent)",
                      }}
                    >
                      <IconEyeOff className="size-2.5" />
                      Hidden
                    </span>
                  ) : null}
                </span>
              </button>

              <span
                className={`px-1 text-[10px] ${
                  active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>

              {interactive ? (
                <SlideControls
                  index={index}
                  pageCount={pages.length}
                  canDelete={pages.length > 1}
                  hidden={Boolean(page.hidden)}
                  onDuplicate={() => onDuplicate?.(page.id)}
                  onRemove={() => onRemove?.(page.id)}
                  onToggleHidden={() => onToggleHidden?.(page.id)}
                  onMove={(target) => onMove?.(target, page.id)}
                />
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className={`flex aspect-[4/5] shrink-0 items-center justify-center self-start rounded-xl text-muted-foreground transition-[width] duration-200 hover:bg-foreground/[0.05] hover:text-foreground ${
            compact ? "w-11" : expanded ? "w-28" : "w-16"
          }`}
          style={{ border: "1px dashed var(--hairline)" }}
          aria-label="Add page"
        >
          <IconPlus className="size-5" />
        </button>
      </div>
    </section>
  );
}

/**
 * Per-slide actions, revealed on hover. Reordering is a drag, but the same
 * moves live in the menu so the strip stays usable from a keyboard.
 */
function SlideControls({
  index,
  pageCount,
  canDelete,
  hidden,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onMove,
}: {
  index: number;
  pageCount: number;
  canDelete: boolean;
  hidden: boolean;
  onDuplicate(): void;
  onRemove(): void;
  onToggleHidden(): void;
  onMove(index: number): void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-0.5 p-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/slide:opacity-100">
      <SlideControlButton
        label={hidden ? "Show slide in exports" : "Hide slide from exports"}
        onClick={onToggleHidden}
      >
        {hidden ? (
          <IconEye className="size-3.5" />
        ) : (
          <IconEyeOff className="size-3.5" />
        )}
      </SlideControlButton>
      <SlideControlButton label="Duplicate slide" onClick={onDuplicate}>
        <IconCopy className="size-3.5" />
      </SlideControlButton>
      {canDelete ? (
        <SlideControlButton label="Delete slide" onClick={onRemove}>
          <IconTrash className="size-3.5" />
        </SlideControlButton>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More slide options"
            className="pointer-events-auto flex size-6 items-center justify-center rounded-md text-foreground/80 backdrop-blur transition-colors hover:text-foreground"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--tray) 82%, transparent)",
              border: "1px solid var(--hairline)",
            }}
          >
            <IconDots className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            disabled={index === 0}
            onSelect={() => onMove(index - 1)}
          >
            <IconArrowLeft className="size-4" />
            Move earlier
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index >= pageCount - 1}
            onSelect={() => onMove(index + 1)}
          >
            <IconArrowRight className="size-4" />
            Move later
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(0)}>
            <IconArrowBarToLeft className="size-4" />
            Move to start
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index >= pageCount - 1}
            onSelect={() => onMove(pageCount - 1)}
          >
            <IconArrowBarToRight className="size-4" />
            Move to end
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <IconCopy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleHidden}>
            {hidden ? (
              <IconEye className="size-4" />
            ) : (
              <IconEyeOff className="size-4" />
            )}
            {hidden ? "Show in exports" : "Hide from exports"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canDelete}
            className="text-red-400 focus:text-red-400"
            onSelect={onRemove}
          >
            <IconTrash className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SlideControlButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pointer-events-auto flex size-6 items-center justify-center rounded-md text-foreground/80 backdrop-blur transition-colors hover:text-foreground"
      style={{
        backgroundColor: "color-mix(in srgb, var(--tray) 82%, transparent)",
        border: "1px solid var(--hairline)",
      }}
    >
      {children}
    </button>
  );
}
