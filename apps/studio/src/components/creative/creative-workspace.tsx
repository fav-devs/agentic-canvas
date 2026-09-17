"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  IconAlignBoxBottomCenter,
  IconArrowLeft,
  IconArrowRight,
  IconDownload,
  IconAlignBoxCenterMiddle,
  IconAlignBoxLeftMiddle,
  IconAlignBoxRightMiddle,
  IconAlignBoxTopCenter,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconChevronDown,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconFileUpload,
  IconHistory,
  IconFlipHorizontal,
  IconFlipVertical,
  IconLock,
  IconLockOpen,
  IconMovie,
  IconMusic,
  IconPalette,
  IconPhotoPlus,
  IconRectangle,
  IconRefresh,
  IconBrush,
  IconEraser,
  IconSparkles,
  IconStack2,
  IconTrash,
  IconVolume,
  IconVolumeOff,
  IconTypography,
  IconWand,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  ApiError,
  appStore,
  post,
  uploadMediaDirect,
  useCreativeDocumentRecord,
  useMediaUpload,
  useOptionalProfileContext,
  usePatchCreativeDocument,
  useRestoreCreativeVersion,
  useSaveCreativeDocument,
  useSnapshotCreativeVersion,
} from "@/lib/studio-host-bridge";
import { useQueryClient } from "@tanstack/react-query";
import { useCreativeShortcuts } from "@/hooks/use-creative-shortcuts";
import { alignBoxToFrame, type AlignEdge } from "@/lib/creative/align";
import { estimateAutoTextBox } from "@/lib/creative/text-box-sizing";
import { summarizeCreativeDocumentForAgent } from "@/lib/creative/agent-context";
import { exportCreativeVideo } from "@/lib/creative/video-export";
import {
  applyCreativeCommands,
  creativeCommandSchema,
  type CreativeCommand,
  type CreativeCommandInput,
} from "@/lib/creative/commands";
import {
  createCreativeId,
  createDrawingElement,
  isSmartElement,
  creativeDocumentSchema,
  drawingStrokeBounds,
  matchCreativePreset,
  CREATIVE_DRAWING_STROKE_LIMIT,
  CREATIVE_PRESET_LABELS,
  CREATIVE_PRESETS,
  type CreativeBackgroundEffect,
  type CreativeBrush,
  type CreativeDrawingElement,
  type CreativeDrawingStroke,
  type CreativeDocument,
  type CreativeElement,
  type CreativeFont,
  type CreativeFrameElement,
  type CreativeMediaAsset,
  type CreativeTagElement,
  type CreativeTagVariant,
  type CreativeImageEdgeEffect,
  type CreativeAsciiEffect,
  type CreativeDitherEffect,
  type CreativePixelateEffect,
  type CreativePagerProps,
  type CreativePage,
  type CreativePreset,
  type CreativeTextElement,
} from "@/lib/creative/document";
import type { CreativeLibraryAsset } from "@/lib/creative/element-library";
import type { HiclipartGraphic } from "@/lib/creative/hiclipart";
import type { UnsplashPhoto } from "@/lib/creative/unsplash";
import {
  decodeStudioDragItem,
  encodeStudioDragItem,
  STUDIO_DRAG_MIME,
  type StudioDragItem,
} from "@/lib/creative/drag-payload";

import {
  assertSafeSvg,
  fetchLibraryAssetSvg,
} from "@/lib/creative/element-library";
import {
  isConnectionCostly,
  SNAP_DOWNLOAD_LABEL,
} from "@/lib/creative/snap-models";
import { ensureCatalogueFont } from "@/lib/creative/font-catalogue";
import {
  cssFilterString,
  IMAGE_FILTER_PRESETS,
  isNeutralAdjustments,
  matchImageFilterPreset,
  NEUTRAL_ADJUSTMENTS,
} from "@/lib/creative/image-filters";
import {
  CUTTING_MAT_PRESETS,
  DEFAULT_CUTTING_MAT,
  drawCuttingMat,
  type CuttingMatUnit,
} from "@/lib/creative/cutting-mat";
import {
  frameContentBox,
  frameSvgPath,
  FRAME_SHAPE_LABELS,
  FRAME_SHAPES,
  type CreativeFrameShape,
} from "@/lib/creative/frames";
import {
  CREATIVE_SHAPES,
  CREATIVE_SHAPE_LABELS,
  shapeSvgPath,
  type CreativeShapeKind,
} from "@/lib/creative/shapes";
import {
  prepareCreativeFontFile,
  registerCreativeFont,
  validateCreativeFontFile,
} from "@/lib/creative/font-library";
import {
  clearCreativeBackup,
  readCreativeBackup,
  writeCreativeBackup,
} from "@/lib/creative/persistence";
import {
  createSlideZip,
  slideFilename,
  type SlideFile,
} from "@/lib/creative/slide-export";
import {
  composeCreativeSpread,
  coveredSpreadPageIndices,
  type SpreadCount,
} from "@/lib/creative/seamless-spread";
import { toDisplayMediaUrl } from "@/lib/media-url";
import { BackgroundImageTexture } from "@/components/ui/bg-image-texture";
import { DitherImageFrame } from "@/components/ui/dither-image";
import { CreativeCanvasPanel, PageFilmstrip } from "./creative-canvas-panel";
import { StudioAssistantPanel } from "./local-assistant-panel";
import { estimateTagBox } from "@/lib/creative/tag";
import { readStudioRecents, rememberStudioItem } from "@/lib/creative/recents";
import {
  copyCreativeElementStyle,
  type CreativeStyleClipboard,
} from "@/lib/creative/style-clipboard";
import type { KlipySticker } from "@/lib/creative/klipy";
import {
  BRUSH_ORDER,
  BRUSH_PRESETS,
  strokeGeometry,
  strokesHit,
} from "@/lib/creative/strokes";
import { ElementBrowser } from "./element-browser";
import {
  renderCreativePageToBlob,
  type FabricStageHandle,
} from "./fabric-stage";
import { FontPicker, FontSelectControl } from "./font-picker";
import { LayersPanel } from "./layers-panel";
import { MobileStudioShell } from "./mobile-studio-shell";
import {
  MediaLibraryPicker,
  type CreativeMediaItem,
} from "./media-library-picker";
import { CreativeWorkspaceHeader } from "./creative-workspace-header";
import { TrendingAudioPicker } from "./local-audio-picker";
import { CreativeHistoryPanel } from "./creative-history-panel";
import { CreativeWorkspaceShell } from "./creative-workspace-shell";
import { DotBackground } from "../dot-background-demo";

// Provider middleware caps an inline Studio image at 200k characters. The UI
// can display a larger data URL just fine, which previously made render_design
// look successful in chat while the model received an "image omitted" marker.
// Encode below that boundary and progressively shrink only when necessary.
const STUDIO_VISION_IMAGE_CHAR_LIMIT = 150_000;

function encodeStudioVisionJpeg(
  source: HTMLCanvasElement,
  initialQuality: number,
): string {
  let canvas = source;
  let last = canvas.toDataURL("image/jpeg", initialQuality);
  const qualities = [initialQuality, 0.56, 0.42, 0.3];

  for (let resize = 0; resize < 6; resize += 1) {
    for (const quality of qualities) {
      last = canvas.toDataURL("image/jpeg", quality);
      if (last.length <= STUDIO_VISION_IMAGE_CHAR_LIMIT) return last;
    }

    if (Math.max(canvas.width, canvas.height) <= 240) return last;
    const ratio = Math.max(
      240 / Math.max(canvas.width, canvas.height),
      Math.min(
        0.8,
        Math.sqrt(STUDIO_VISION_IMAGE_CHAR_LIMIT / last.length) * 0.9,
      ),
    );
    const next = window.document.createElement("canvas");
    next.width = Math.max(1, Math.round(canvas.width * ratio));
    next.height = Math.max(1, Math.round(canvas.height * ratio));
    const context = next.getContext("2d");
    if (!context) break;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, next.width, next.height);
    context.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }

  return canvas.toDataURL("image/jpeg", 0.25);
}

type HistoryState = {
  past: CreativeDocument[];
  current: CreativeDocument;
  future: CreativeDocument[];
  /** Identifies the run of edits the newest entry belongs to (see `dispatch`). */
  coalesceKey?: string;
  coalescedAt?: number;
};

type CreativeTool =
  "text" | "uploads" | "elements" | "draw" | "background" | "layers";
type BackgroundRemovalState = {
  elementId: string;
  stage: "downloading" | "loading" | "processing" | "uploading";
  progress: number;
};
export type CreativeSaveState =
  "saved" | "dirty" | "saving" | "conflict" | "error";

export type GuestStudioGateReason =
  "assistant" | "cloud-media" | "compose" | "exports" | "pages";

export type GuestCreativeWorkspace = {
  /** Local editions persist in the browser but do not expose hosted actions. */
  edition?: "guest" | "local";
  initialDocument: CreativeDocument;
  exportCount: number;
  exportLimit: number;
  maxPages: number;
  onDocumentChange(document: CreativeDocument): void;
  onStoreAsset(file: File): Promise<CreativeMediaAsset>;
  onExportComplete(): Promise<void>;
  onRequireAccount(reason: GuestStudioGateReason): void;
};

/**
 * Below this the editor switches to the immersive shell. It matches the
 * three-pane shell's own threshold, so a tablet gets the dock rather than a
 * squeezed desktop layout with nowhere to put the panels.
 */
const IMMERSIVE_BREAKPOINT = 1024;

/** `undefined` until the viewport has been measured on the client. */
function useImmersiveStudio() {
  const [immersive, setImmersive] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia(
      `(max-width: ${IMMERSIVE_BREAKPOINT - 1}px)`,
    );
    const update = () => setImmersive(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return immersive;
}

/** Eraser reach in document px — generous enough to be usable with a finger. */
const ERASER_RADIUS = 22;

/**
 * Map a document point into a sketch's local space, along with the eraser
 * radius in those same units.
 *
 * Rotation is not undone, so erasing on a rotated sketch is approximate; the
 * editor only rotates a sketch after it is finished, and the hit test carries
 * enough slack that it still feels right.
 */
function toDrawingLocalPoint(
  element: CreativeDrawingElement,
  point: { x: number; y: number },
) {
  const natural = drawingStrokeBounds(element.strokes);
  const scaleX = element.width / natural.width;
  const scaleY = element.height / natural.height;
  if (!scaleX || !scaleY) return null;
  return {
    point: {
      x: (point.x - element.x) / scaleX + natural.minX,
      y: (point.y - element.y) / scaleY + natural.minY,
    },
    radius: ERASER_RADIUS / ((scaleX + scaleY) / 2 || 1),
  };
}

const HISTORY_LIMIT = 50;
/** Rapid edits to the same control collapse into one undo step for this long. */
const COALESCE_WINDOW_MS = 700;
const AUTOSAVE_DELAY_MS = 1_200;
const DEFAULT_DITHER_EFFECT: CreativeDitherEffect = {
  type: "dither",
  enabled: true,
  mode: "monochrome",
  cellSize: 6,
  strength: 1,
  contrast: 1.2,
  brightness: 1,
};
const DEFAULT_PIXELATE_EFFECT: CreativePixelateEffect = {
  type: "pixelate",
  enabled: true,
  cellSize: 16,
  sampling: "average",
  levels: 0,
};
const DEFAULT_ASCII_EFFECT: CreativeAsciiEffect = {
  type: "ascii",
  enabled: true,
  cellSize: 14,
  charset: "classic",
  color: "ink",
  ink: "#7CFFB2",
  background: "#04070D",
  invert: false,
};
const DEFAULT_IMAGE_EDGE_EFFECT: CreativeImageEdgeEffect = {
  enabled: false,
  style: "outline",
  color: "#F6F1E8",
  width: 22,
  roughness: 0.62,
  seed: 1,
};

/**
 * Repair a document whose elements share ids (a corruption — e.g. an element
 * duplicated onto pages without fresh ids). The canvas reconcile is keyed by
 * element id, so clashing ids leave every-but-one copy untracked, which is what
 * bleeds elements across slides. Re-id any element whose id was already seen.
 */
function dedupeElementIds(document: CreativeDocument): CreativeDocument {
  const seen = new Set<string>();
  let changed = false;
  const pages = document.pages.map((page) => ({
    ...page,
    elements: page.elements.map((element) => {
      if (!seen.has(element.id)) {
        seen.add(element.id);
        return element;
      }
      changed = true;
      return { ...element, id: createCreativeId(element.type) };
    }),
  }));
  return changed ? { ...document, pages } : document;
}

/** A file currently uploading to the media library, shown in the Uploads tab. */
type StudioUploadProgress = {
  id: string;
  name: string;
  previewUrl: string;
  kind: "image" | "video";
  progress: number;
  status: "uploading" | "done" | "error";
};

export function CreativeWorkspace({
  documentId,
  guest,
}: {
  documentId: string;
  guest?: GuestCreativeWorkspace;
}) {
  const router = useRouter();
  // `undefined` until measured — the editor waits rather than mounting the
  // desktop canvas and immediately tearing it down on a small screen.
  const isMobile = useImmersiveStudio();
  const currentProfile = useOptionalProfileContext()?.currentProfile ?? null;
  const mediaUpload = useMediaUpload();
  const queryClient = useQueryClient();
  const libraryInputRef = useRef<HTMLInputElement>(null);
  // Live upload progress for the Uploads tab — a thumbnail + bar per file so a
  // user can watch it go in (especially a video, to confirm it actually works).
  const [uploads, setUploads] = useState<StudioUploadProgress[]>([]);
  const [sharing, setSharing] = useState(false);
  const record = useCreativeDocumentRecord(documentId, {
    enabled: !guest,
  });
  const saveDocument = useSaveCreativeDocument();
  const patchDocument = usePatchCreativeDocument();
  const snapshotVersion = useSnapshotCreativeVersion();
  const restoreVersionMut = useRestoreCreativeVersion();
  const [historyOpen, setHistoryOpen] = useState(false);
  // Throttle auto/AI snapshots so a burst of edits captures one restore point.
  const lastAutoSnapshotRef = useRef(0);
  const lastAiSnapshotRef = useRef(0);
  const stageRef = useRef<FabricStageHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // When set (an id), the next file chosen via imageInputRef REPLACES that image
  // element's picture in place — keeping its box, crop, adjustments and effects —
  // instead of adding a new image. Cleared as soon as the file handler reads it.
  const replaceImageTargetRef = useRef<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<CreativeElement[]>([]);
  const styleClipboardRef = useRef<CreativeStyleClipboard | null>(null);
  /** Design currently loaded into `history`, so a route change reloads. */
  const loadedIdRef = useRef<string | null>(null);
  /** Revision the server currently holds; the base for the next save. */
  const savedRevisionRef = useRef<number | null>(null);
  const conflictRef = useRef(false);
  const savingRef = useRef(false);
  // React Query's mutation object is re-created as its state changes; holding
  // it in a ref keeps the autosave debounce keyed purely on the document.
  const saveDocumentRef = useRef(saveDocument);
  saveDocumentRef.current = saveDocument;
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [activePageId, setActivePageId] = useState<string>();
  const [selectedElementId, setSelectedElementId] = useState<string>();
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [clipboardCount, setClipboardCount] = useState(0);
  const [hasStyleClipboard, setHasStyleClipboard] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [activeTool, setActiveTool] = useState<CreativeTool>("text");
  // A picked design template (element browser → Templates) is consumed by the
  // Studio assistant's ChatBot — it just needs the assistant to be mounted, so
  // opening the panel is the workspace's whole job here.
  const studioTemplateSeed = appStore((s) => s.studioTemplateSeed);
  useEffect(() => {
    if (studioTemplateSeed) setShowAssistant(true);
  }, [studioTemplateSeed]);
  const [filmstripExpanded, setFilmstripExpanded] = useState(false);
  const [spreadCount, setSpreadCount] = useState<SpreadCount>(1);
  const [fontImporting, setFontImporting] = useState(false);
  const [exporting, setExporting] = useState<
    "download" | "media" | "compose" | null
  >(null);
  // null = not exporting a video; otherwise 0..1 encode progress.
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [soundtrackPickerOpen, setSoundtrackPickerOpen] = useState(false);
  const [saveState, setSaveState] = useState<CreativeSaveState>("saved");
  const [backgroundRemoval, setBackgroundRemoval] =
    useState<BackgroundRemovalState | null>(null);
  /** null = not yet probed. Drives the first-run download warning. */
  const [modelsCached, setModelsCached] = useState<boolean | null>(null);
  /** Element whose cutout is waiting on the download confirmation. */
  const [cutoutPrompt, setCutoutPrompt] = useState<string | null>(null);
  const [cutoutConfirmed, setCutoutConfirmed] = useState(false);
  const backgroundRemovalAbortRef = useRef<AbortController | null>(null);

  /**
   * Upload files straight to the media library WITH visible per-file progress
   * (images and video). Unlike addImages this doesn't place anything on the
   * canvas — it fills "Your media", so a video (which can't sit on the canvas)
   * still uploads and the user can watch the bar move to confirm it worked.
   */
  const uploadFilesToLibrary = async (files: File[]) => {
    const accepted = files.filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    if (accepted.length === 0) return;
    // Guests have no cloud library — fall back to placing the images.
    if (guest) {
      await addImages(
        accepted.filter((file) => file.type.startsWith("image/")),
      );
      return;
    }
    await Promise.all(
      accepted.map(async (file) => {
        const id = createCreativeId("upload");
        const previewUrl = URL.createObjectURL(file);
        const kind: "image" | "video" = file.type.startsWith("video/")
          ? "video"
          : "image";
        setUploads((prev) => [
          {
            id,
            name: file.name,
            previewUrl,
            kind,
            progress: 0,
            status: "uploading",
          },
          ...prev,
        ]);
        try {
          await uploadMediaDirect(file, {
            category: "UPLOAD",
            onProgress: (value) =>
              setUploads((prev) =>
                prev.map((item) =>
                  item.id === id
                    ? { ...item, progress: Math.round(value) }
                    : item,
                ),
              ),
          });
          setUploads((prev) =>
            prev.map((item) =>
              item.id === id
                ? { ...item, progress: 100, status: "done" }
                : item,
            ),
          );
          void queryClient.invalidateQueries({ queryKey: ["media"] });
          // Clear the finished row (and its preview URL) after a beat.
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((item) => item.id !== id));
            URL.revokeObjectURL(previewUrl);
          }, 2500);
        } catch {
          setUploads((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: "error" } : item,
            ),
          );
        }
      }),
    );
  };

  const uploadWorkspaceFiles = async (files: File[]) => {
    if (!guest) return mediaUpload.mutateAsync(files);
    const assets = await Promise.all(files.map(guest.onStoreAsset));
    return {
      files: assets.map((asset) => ({
        id: asset.mediaId,
        key: asset.mediaId,
        url: asset.url,
        backendUrl: asset.backendUrl,
      })),
      urls: assets.map((asset) => asset.url),
      backendUrls: assets.map((asset) => asset.backendUrl),
    };
  };

  // --- Drawing -------------------------------------------------------------
  const [brush, setBrush] = useState<CreativeBrush>("pen");
  const [brushColor, setBrushColor] = useState("#1F1235");
  const [brushWidth, setBrushWidth] = useState(BRUSH_PRESETS.pen.defaultWidth);
  const [brushOpacity, setBrushOpacity] = useState(
    BRUSH_PRESETS.pen.defaultOpacity,
  );
  const [brushSmoothing, setBrushSmoothing] = useState(0.55);
  const [eraserActive, setEraserActive] = useState(false);
  /**
   * The sketch new strokes are being added to. A ref rather than state because
   * it must be current the instant a stroke lands, and changing it should never
   * re-render.
   */
  const activeDrawingIdRef = useRef<string | undefined>(undefined);

  /** Recently used elements for this profile, newest first. */
  const [recents, setRecents] = useState<StudioDragItem[]>([]);
  useEffect(() => {
    setRecents(currentProfile?.id ? readStudioRecents(currentProfile.id) : []);
  }, [currentProfile?.id]);

  useEffect(() => {
    if (!guest || loadedIdRef.current === documentId) return;
    const document = dedupeElementIds(structuredClone(guest.initialDocument));
    loadedIdRef.current = documentId;
    savedRevisionRef.current = document.revision;
    conflictRef.current = false;
    setSaveState("saved");
    setHistory({ past: [], current: document, future: [] });
    setActivePageId(document.pages[0]?.id);
    setSelectedElementId(undefined);
  }, [documentId, guest]);

  // Load the server copy once per design, preferring a crash backup that is
  // ahead of it. Keyed on the loaded id so navigating between two designs
  // without unmounting still swaps the document.
  useEffect(() => {
    if (!record.data || loadedIdRef.current === documentId) return;
    const parsed = creativeDocumentSchema.safeParse(record.data.document);
    if (!parsed.success) {
      toast.error(
        "This design could not be opened — its format is unreadable.",
      );
      return;
    }
    const backup = readCreativeBackup(documentId);
    const recovered =
      backup &&
      backup.id === parsed.data.id &&
      backup.revision > parsed.data.revision
        ? backup
        : null;
    const loaded = recovered ?? parsed.data;
    const deduped = dedupeElementIds(loaded);
    const repaired = deduped !== loaded;
    // Bump the revision when we re-id'd duplicates so autosave actually writes
    // the repair back (autosave only fires on a revision change).
    const document = repaired
      ? { ...deduped, revision: (deduped.revision ?? 0) + 1 }
      : deduped;

    loadedIdRef.current = documentId;
    savedRevisionRef.current = record.data.revision;
    conflictRef.current = false;
    setSaveState(repaired ? "dirty" : "saved");
    setHistory({ past: [], current: document, future: [] });
    setActivePageId(document.pages[0].id);
    setSelectedElementId(undefined);
    if (recovered) {
      setSaveState("dirty");
      toast.info("Restored unsaved changes from your last session.");
    }
  }, [documentId, record.data]);

  const document = history?.current;
  const requireGuestAccount = (reason: GuestStudioGateReason) => {
    if (!guest) return;
    if (document) guest.onDocumentChange(document);
    guest.onRequireAccount(reason);
  };

  // Autosave. Every change is mirrored to local storage immediately (cheap,
  // synchronous) and pushed to the server on a short debounce.
  useEffect(() => {
    if (guest && document) {
      setSaveState("dirty");
      const timer = window.setTimeout(() => {
        guest.onDocumentChange(document);
        savedRevisionRef.current = document.revision;
        setSaveState("saved");
      }, 450);
      return () => window.clearTimeout(timer);
    }
    if (!document || savedRevisionRef.current === null) return;
    // While a different design is still loading, `document` is the previous
    // one — saving it under the new id would overwrite the wrong design.
    if (loadedIdRef.current !== documentId) return;
    if (document.revision === savedRevisionRef.current) return;
    // Once the server copy has moved on, further writes would clobber it; the
    // editor stays local-only until the page is reloaded.
    if (conflictRef.current) return;

    writeCreativeBackup(documentId, document);
    setSaveState("dirty");

    let timer = 0;
    const attempt = () => {
      // Overlapping saves would send the same `expectedRevision` twice and the
      // second would come back as a spurious conflict, so wait one out.
      if (savingRef.current) {
        timer = window.setTimeout(attempt, 300);
        return;
      }
      const base = savedRevisionRef.current;
      if (base === null) return;

      savingRef.current = true;
      setSaveState("saving");
      saveDocumentRef.current
        .mutateAsync({
          id: documentId,
          expectedRevision: base,
          document,
          title: document.title,
        })
        .then((saved) => {
          savedRevisionRef.current = saved.revision;
          // Only safe to drop the backup once the server holds this exact
          // revision; a later edit will have re-armed it already.
          if (saved.revision === document.revision) {
            clearCreativeBackup(documentId);
          }
          setSaveState((state) => (state === "saving" ? "saved" : state));
          // Auto restore point, throttled so a long editing run leaves a few
          // recoverable points rather than one per save.
          if (!guest && Date.now() - lastAutoSnapshotRef.current > 150_000) {
            lastAutoSnapshotRef.current = Date.now();
            snapshotVersion.mutate({ id: documentId, source: "auto" });
          }
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 409) {
            conflictRef.current = true;
            setSaveState("conflict");
            toast.error(
              "This design changed in another tab. Reload to continue editing.",
            );
            return;
          }
          setSaveState("error");
          toast.error(
            error instanceof Error
              ? error.message
              : "The design could not be saved.",
          );
        })
        .finally(() => {
          savingRef.current = false;
        });
    };

    timer = window.setTimeout(attempt, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Deliberately not keyed on save state: reacting to our own
    // dirty/saving transitions would restart the debounce forever.
  }, [document, documentId, guest]);

  // Is a cutout free, or does it mean a ~134 MB download? Probed lazily so the
  // Cutout button can say which before anyone taps it.
  useEffect(() => {
    let active = true;
    void import("@/lib/creative/snap-models").then(({ areSnapModelsCached }) =>
      areSnapModelsCached().then((cached) => {
        if (active) setModelsCached(cached);
      }),
    );
    return () => {
      active = false;
    };
  }, []);

  // Leaving the editor shouldn't leave the models resident in memory.
  useEffect(
    () => () => {
      backgroundRemovalAbortRef.current?.abort();
      void import("@/lib/creative/snap-background-removal").then(
        ({ releaseSnapWorker }) => releaseSnapWorker(),
      );
    },
    [],
  );

  // Warn before losing edits that haven't reached the server yet.
  useEffect(() => {
    if (saveState === "saved") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  const activePage = useMemo(
    () =>
      document?.pages.find((page) => page.id === activePageId) ??
      document?.pages[0],
    [activePageId, document],
  );
  const activePageIndex = useMemo(
    () =>
      Math.max(
        0,
        document?.pages.findIndex((page) => page.id === activePage?.id) ?? 0,
      ),
    [activePage?.id, document?.pages],
  );
  const spread = useMemo(
    () =>
      document
        ? composeCreativeSpread(
            document,
            activePageIndex,
            spreadCount,
            selectedElementId,
          )
        : undefined,
    [activePageIndex, document, selectedElementId, spreadCount],
  );
  const selectedElement = useMemo(
    () =>
      spread?.page.elements.find(
        (element) => element.id === selectedElementId,
      ) ??
      document?.pages
        .flatMap((page) => page.elements)
        .find((element) => element.id === selectedElementId),
    [document?.pages, selectedElementId, spread?.page.elements],
  );
  const stageSelectionIds = useMemo(() => {
    if (selectedElementId) return [selectedElementId];
    const visibleIds = new Set(
      spread?.page.elements.map((element) => element.id),
    );
    return selectedElementIds.filter((id) => visibleIds.has(id));
  }, [selectedElementId, selectedElementIds, spread?.page.elements]);
  // The elements behind a multi-selection, in selection order.
  const selectedElements = useMemo(() => {
    const source = spread?.page ?? activePage;
    if (!source) return [] as CreativeElement[];
    const byId = new Map(
      source.elements.map((element) => [element.id, element]),
    );
    return selectedElementIds
      .map((id) => byId.get(id))
      .filter((element): element is CreativeElement => Boolean(element));
  }, [spread?.page, activePage, selectedElementIds]);
  // When 2+ elements of the SAME type are selected, the inspector becomes a
  // shared panel: edits fan out to all of them. Null for a mixed selection.
  const multiSelectType = useMemo(() => {
    if (selectedElements.length < 2) return null;
    const first = selectedElements[0].type;
    return selectedElements.every((element) => element.type === first)
      ? first
      : null;
  }, [selectedElements]);
  const selectionGrouped = useMemo(() => {
    if (stageSelectionIds.length < 2 || !spread) return false;
    const groupIds = stageSelectionIds.map(
      (id) =>
        spread.page.elements.find((element) => element.id === id)?.groupId,
    );
    return Boolean(groupIds[0] && groupIds.every((id) => id === groupIds[0]));
  }, [spread, stageSelectionIds]);
  // Keep this derived value with the rest of the unconditional editor hooks.
  // Saved designs render a loading state before `document` is available; a
  // hook below that early return would only appear on the next render and
  // violate React's hook ordering.
  // read_canvas is an execute-less agent tool VoltAgent forwards to the browser;
  // we answer it here with a live outline of the open design — on demand, not
  // injected into every message. A ref keeps the resolver stable while always
  // reading the current document (which is undefined during the loading state).
  const documentRef = useRef(document);
  documentRef.current = document;
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;
  const resolveStudioClientTool = useCallback(
    async (toolName: string, input?: unknown): Promise<unknown> => {
      if (toolName === "read_canvas") {
        const doc = documentRef.current;
        return doc
          ? summarizeCreativeDocumentForAgent(doc)
          : "No design is open on the canvas.";
      }
      if (toolName === "render_design") {
        const doc = documentRef.current;
        if (!doc || doc.pages.length === 0) {
          return { error: "No design is open, so there is nothing to render." };
        }
        const requestedId = (input as { pageId?: string } | undefined)?.pageId;
        const wantedId = requestedId ?? activePageIdRef.current;
        // The agent almost always renders the slide it just edited — the one on
        // screen. Screenshot the LIVE canvas (fast, no reload) instead of
        // rebuilding it offscreen, which re-loads every font/image and can hang
        // the whole run. Only fall back to an offscreen render for a slide that
        // isn't the one displayed. Either way, race a timeout so a stalled render
        // answers the tool with an error rather than leaving it "working" forever.
        const onActivePage =
          !requestedId || wantedId === activePageIdRef.current;
        const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error("render timed out")), ms),
            ),
          ]);
        try {
          let blob: Blob;
          if (onActivePage && stageRef.current) {
            blob = await withTimeout(stageRef.current.exportPng(), 8000);
          } else {
            let pageIndex = doc.pages.findIndex((p) => p.id === wantedId);
            if (pageIndex < 0) pageIndex = 0;
            const longEdge = Math.max(doc.canvas.width, doc.canvas.height);
            const multiplier = Math.min(1, 1024 / longEdge);
            blob = await withTimeout(
              renderCreativePageToBlob({
                page: doc.pages[pageIndex],
                fonts: doc.fonts,
                pageIndex,
                pageCount: doc.pages.length,
                width: doc.canvas.width,
                height: doc.canvas.height,
                multiplier,
              }),
              12000,
            );
          }
          // The render is for the MODEL'S EYES, not an export: cap it at
          // 768px and re-encode as JPEG. A full-res PNG of a 1080x1350 page
          // is >1MB as a data URL — it 413'd the chat request (the backend
          // body limit) and bloated every subsequent step's context.
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);
            img.onload = () => {
              URL.revokeObjectURL(objectUrl);
              const scale = Math.min(1, 768 / Math.max(img.width, img.height));
              const canvas = window.document.createElement("canvas");
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext("2d");
              if (!ctx) return reject(new Error("no 2d context"));
              ctx.fillStyle = "#ffffff"; // JPEG has no alpha; match the page
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(encodeStudioVisionJpeg(canvas, 0.7));
            };
            img.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error("render decode failed"));
            };
            img.src = objectUrl;
          });
          // ChatBot turns this into a user-message image part (see chat-bot.tsx):
          // an image in a tool RESULT is dropped by OpenAI-family models, so the
          // render has to ride in as user vision instead.
          return { __studioRenderImage: dataUrl, pageId: wantedId };
        } catch {
          return {
            error:
              "The render didn't complete in time. Skip the visual check and finish from the layout numbers you already have.",
          };
        }
      }
      if (toolName === "preview_assets") {
        // Composite up to 6 asset previews into ONE numbered contact sheet so
        // the (multimodal) agent can pick by eye instead of by title. Rides
        // back through the same channel as render_design's picture.
        const { urls = [], labels = [] } =
          (input as { urls?: string[]; labels?: string[] } | undefined) ?? {};
        const list = urls.slice(0, 6).filter((u) => typeof u === "string" && u);
        if (list.length === 0) {
          return {
            error:
              "No preview urls given. Pass the `preview` field from search_assets results.",
          };
        }
        const CELL = 340;
        const cols = Math.min(3, list.length);
        const rows = Math.ceil(list.length / cols);
        // `document` is shadowed by the creative document prop in this scope.
        const canvas = window.document.createElement("canvas");
        canvas.width = cols * CELL;
        canvas.height = rows * CELL;
        const ctx = canvas.getContext("2d");
        if (!ctx) return { error: "Preview canvas unavailable." };
        ctx.fillStyle = "#f5f5f2";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const loadOne = (src: string) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            const img = new Image();
            // Without CORS approval the draw would taint the canvas and the
            // whole sheet would fail — treat a non-CORS image as a miss.
            img.crossOrigin = "anonymous";
            const timer = setTimeout(() => resolve(null), 7000);
            img.onload = () => {
              clearTimeout(timer);
              resolve(img);
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve(null);
            };
            img.src = src;
          });
        const images = await Promise.all(list.map(loadOne));
        images.forEach((img, i) => {
          const cx = (i % cols) * CELL;
          const cy = Math.floor(i / cols) * CELL;
          ctx.save();
          if (img) {
            // contain-fit inside the cell with a small inset
            const inset = 14;
            const box = CELL - inset * 2;
            const scale = Math.min(box / img.width, box / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(
              img,
              cx + inset + (box - w) / 2,
              cy + inset + (box - h) / 2,
              w,
              h,
            );
          } else {
            ctx.fillStyle = "#e2e0da";
            ctx.fillRect(cx + 14, cy + 14, CELL - 28, CELL - 28);
            ctx.fillStyle = "#8a8880";
            ctx.font = "16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("preview unavailable", cx + CELL / 2, cy + CELL / 2);
          }
          // Number badge — how the model refers to its pick.
          ctx.fillStyle = "#111111";
          ctx.beginPath();
          ctx.arc(cx + 34, cy + 34, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 20px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), cx + 34, cy + 35);
          const label = labels[i];
          if (label) {
            ctx.fillStyle = "rgba(17,17,17,0.72)";
            ctx.fillRect(cx, cy + CELL - 30, CELL, 30);
            ctx.fillStyle = "#ffffff";
            ctx.font = "13px sans-serif";
            ctx.textBaseline = "middle";
            ctx.fillText(
              String(label).slice(0, 40),
              cx + CELL / 2,
              cy + CELL - 15,
            );
          }
          ctx.restore();
        });
        try {
          return {
            __studioRenderImage: encodeStudioVisionJpeg(canvas, 0.68),
            __assetPreview: true,
            count: list.length,
          };
        } catch {
          return {
            error:
              "The previews could not be composited (a source blocked cross-origin reads). Pick by title instead.",
          };
        }
      }
      return undefined;
    },
    [],
  );

  /**
   * Undefined unless a brush is in hand, which is what puts the canvas into
   * drawing mode. Memoised because the stage keys an effect on its identity.
   */
  const drawingSettings = useMemo(
    () =>
      activeTool === "draw"
        ? {
            tool: eraserActive ? ("erase" as const) : ("draw" as const),
            brush,
            color: brushColor,
            width: brushWidth,
            opacity: brushOpacity,
            smoothing: brushSmoothing,
            eraserRadius: ERASER_RADIUS,
          }
        : undefined,
    [
      activeTool,
      brush,
      brushColor,
      brushOpacity,
      brushSmoothing,
      brushWidth,
      eraserActive,
    ],
  );

  /**
   * Picking up a different tool ends the current sketch, so the next stroke
   * starts a new layer rather than joining one the user considers finished.
   */
  const changeTool = (tool: CreativeTool) => {
    setActiveTool(tool);
    activeDrawingIdRef.current = undefined;
    if (tool !== "draw") setEraserActive(false);
  };

  /** Switching to a brush should reset size and opacity to suit it. */
  const changeBrush = (next: CreativeBrush) => {
    const preset = BRUSH_PRESETS[next];
    setBrush(next);
    setBrushWidth(preset.defaultWidth);
    setBrushOpacity(preset.defaultOpacity);
    setEraserActive(false);
    activeDrawingIdRef.current = undefined;
  };

  const drawingControls: DrawingControls = {
    brush,
    color: brushColor,
    width: brushWidth,
    opacity: brushOpacity,
    smoothing: brushSmoothing,
    eraser: eraserActive,
  };

  const applyDrawingChange = (
    changes: Partial<Omit<DrawingControls, "brush">>,
  ) => {
    if (changes.color !== undefined) setBrushColor(changes.color);
    if (changes.width !== undefined) setBrushWidth(changes.width);
    if (changes.opacity !== undefined) setBrushOpacity(changes.opacity);
    if (changes.smoothing !== undefined) setBrushSmoothing(changes.smoothing);
    if (changes.eraser !== undefined) setEraserActive(changes.eraser);
  };

  /**
   * Apply commands built from the *live* document and push one history entry.
   *
   * `coalesceKey` groups a run of edits from the same control (dragging a
   * slider, typing in a field) into a single undo step: consecutive dispatches
   * with the same key inside `COALESCE_WINDOW_MS` replace the newest entry
   * instead of stacking, so undo doesn't have to be pressed forty times to walk
   * back one gesture.
   *
   * Commands come from a builder rather than a list because the eraser needs
   * them to: it fires on every pointer move, and a command built from
   * render-time state would carry stroke indices from before the previous erase
   * landed — removing the wrong strokes. Building inside the updater means
   * `build` always sees the freshest document. Returning no commands is how
   * "the eraser passed over empty space" is expressed, and costs neither a
   * history entry nor a dirty flag.
   */
  const dispatchWith = useCallback(
    (
      build: (document: CreativeDocument) => CreativeCommand[],
      coalesceKey?: string,
    ) => {
      setHistory((previous) => {
        if (!previous) return previous;
        const commands = build(previous.current);
        if (!commands.length) return previous;
        try {
          const next = applyCreativeCommands(previous.current, {
            expectedRevision: previous.current.revision,
            commands,
          });
          const now = Date.now();
          const continues =
            coalesceKey !== undefined &&
            previous.coalesceKey === coalesceKey &&
            now - (previous.coalescedAt ?? 0) < COALESCE_WINDOW_MS;

          return {
            past: continues
              ? previous.past
              : [...previous.past, previous.current].slice(-HISTORY_LIMIT),
            current: next,
            future: [],
            coalesceKey,
            coalescedAt: now,
          };
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "The edit could not be applied.",
          );
          return previous;
        }
      });
    },
    [],
  );

  const dispatch = useCallback(
    (commands: CreativeCommand[], coalesceKey?: string) =>
      dispatchWith(() => commands, coalesceKey),
    [dispatchWith],
  );

  const makeCommand = useCallback(
    <T extends CreativeCommandInput>(
      command: T,
      actor: CreativeCommand["actor"] = "user",
    ) =>
      ({
        id: createCreativeId("command"),
        actor,
        ...command,
      }) as CreativeCommand,
    [],
  );

  const undo = () => {
    setHistory((previous) => {
      if (!previous?.past.length) return previous;
      const current = previous.past.at(-1);
      if (!current) return previous;
      return {
        past: previous.past.slice(0, -1),
        current,
        future: [previous.current, ...previous.future],
        coalesceKey: undefined,
      };
    });
  };

  const redo = () => {
    setHistory((previous) => {
      if (!previous?.future.length) return previous;
      const [current, ...future] = previous.future;
      return {
        past: [...previous.past, previous.current],
        current,
        future,
        coalesceKey: undefined,
      };
    });
  };

  const addText = (
    variant: "heading" | "body" = "heading",
    at?: { x: number; y: number },
    fontFamily = "Outfit",
  ) => {
    if (!activePage) return;
    const heading = variant === "heading";
    const text = heading ? "Add a heading" : "Add a little bit of body text";
    const fontSize = heading ? 72 : 40;
    const lineHeight = 1.16;
    const canvasWidth = document?.canvas.width ?? 1080;
    const { width, height } = estimateAutoTextBox({
      text,
      fontSize,
      lineHeight,
      maxWidth: Math.round(canvasWidth * 0.78),
    });
    const element = {
      id: createCreativeId("text"),
      name: heading ? "Heading" : "Body text",
      type: "text" as const,
      x: at
        ? Math.round(at.x - width / 2)
        : Math.round((canvasWidth - width) / 2),
      y: at ? Math.round(at.y - height / 2) : heading ? 180 : 420,
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text,
      autoWidth: true,
      fontFamily,
      fontSize,
      fontWeight: heading ? ("700" as const) : ("400" as const),
      fill: "#1D1B20",
      textAlign: "left" as const,
      lineHeight,
      letterSpacing: 0,
      textTransform: "none" as const,
    };
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element,
      }),
    ]);
    setSelectedElementId(element.id);
  };

  /**
   * Font shelf click: retarget the selected text, or start a heading in that
   * font when nothing is selected.
   */
  const applyFont = (fontFamily: string) => {
    void ensureCatalogueFont(fontFamily);
    if (selectedElement?.type === "text") {
      updateTypedElement(selectedElement, { fontFamily });
      return;
    }
    addText("heading", undefined, fontFamily);
  };

  const addShape = (
    shape: CreativeShapeKind = "rectangle",
    at?: { x: number; y: number },
  ) => {
    if (!activePage) return;
    const ellipse = shape === "ellipse";
    const wide = shape === "arrow-right" || shape === "speech-bubble";
    const width = wide ? 600 : ellipse ? 400 : 460;
    const height = wide ? 320 : ellipse ? 400 : 460;
    const element = {
      id: createCreativeId("shape"),
      name: CREATIVE_SHAPE_LABELS[shape],
      type: "shape" as const,
      shape,
      x: at ? Math.round(at.x - width / 2) : 280,
      y: at ? Math.round(at.y - height / 2) : 300,
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: "#EF7B16",
      stroke: "transparent",
      strokeWidth: 0,
      radius: shape === "rectangle" ? 48 : 0,
    };
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element,
      }),
    ]);
    setSelectedElementId(element.id);
  };

  const addVector = ({
    asset,
    svg,
    at,
  }: {
    asset: CreativeLibraryAsset;
    svg?: string;
    /** Drop point in document coords; centres the element there. Omit to centre on the canvas. */
    at?: { x: number; y: number };
  }) => {
    if (!activePage || !document) return;
    const ratio = svg ? readSvgAspectRatio(svg) : 4 / 3;
    const maxWidth = asset.provider === "open-doodles" ? 680 : 320;
    const maxHeight = asset.provider === "open-doodles" ? 560 : 320;
    const { width, height } = fitWithinBounds(ratio, maxWidth, maxHeight);
    const element = {
      id: createCreativeId("vector"),
      name: asset.name,
      type: "vector" as const,
      x: Math.round((at ? at.x : document.canvas.width / 2) - width / 2),
      y: Math.round((at ? at.y : document.canvas.height / 2) - height / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      svg,
      assetUrl: asset.assetUrl,
      fill: contrastColor(activePage.background),
      recolorable: asset.recolorable,
      source: {
        provider: asset.provider,
        assetId: asset.id,
        license: asset.license,
        author: asset.author,
        sourceUrl: asset.sourceUrl,
      },
    };
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element,
      }),
    ]);
    setSelectedElementId(element.id);
  };

  /**
   * Frames store media assets, while the Elements library stores editable SVG
   * vectors. Rasterise a safe fetched SVG to PNG before upload so icons, logos,
   * and illustrations can use the same durable frame path as every other image.
   * The backend deliberately rejects stored SVG to prevent stored XSS.
   */
  const fillFrameWithVector = async (
    frame: Extract<CreativeElement, { type: "frame" }>,
    asset: CreativeLibraryAsset,
    providedSvg?: string,
  ) => {
    try {
      const sourceSvg = providedSvg ?? (await fetchLibraryAssetSvg(asset));
      const svg = asset.recolorable
        ? sourceSvg.replaceAll(
            "currentColor",
            contrastColor(activePage?.background ?? "#F2EDE4"),
          )
        : sourceSvg;
      const file = await rasterizeSvgToPng(svg, `${slugify(asset.name)}.png`);
      const uploaded = await uploadWorkspaceFiles([file]);
      const stored = uploaded.files?.[0];
      if (!stored?.url) {
        throw new Error("The vector upload did not return a URL.");
      }
      fillFrame(frame, {
        mediaId: stored.id || stored.key,
        url: stored.url,
        backendUrl: stored.backendUrl,
        filename: file.name,
      });
      toast.success(`${asset.name} added to ${frame.name}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The element could not be added to the frame.",
      );
    }
  };

  // An element dragged from the library, dropped onto the canvas: fetch its SVG
  // (like the click path) and place it where it landed.
  /** A tile dragged out of the tool shelf, dropped at `point`. */
  const rememberUse = (item: StudioDragItem) => {
    if (!currentProfile?.id) return;
    setRecents(rememberStudioItem(currentProfile.id, item));
  };

  /**
   * Replay a remembered item, centred.
   *
   * Re-encoded through the drag payload so it takes the identical path a drop
   * takes — there is one insert switch, not two that can drift.
   */
  const useRecent = (item: StudioDragItem) => {
    if (!document) return;
    void dropStudioItem(encodeStudioDragItem(item), {
      x: document.canvas.width / 2,
      y: document.canvas.height / 2,
    });
  };

  const dropStudioItem = async (
    payload: string,
    point: { x: number; y: number },
  ) => {
    const item = decodeStudioDragItem(payload);
    if (!item) return;
    // Every insert path funnels through here — drags, and the recents row's
    // replay — so recording once covers all of them, and a new element kind is
    // remembered without extra wiring.
    rememberUse(item);

    switch (item.kind) {
      case "text":
        addText(item.variant, point);
        return;
      case "shape":
        addShape(item.shape, point);
        return;
      case "frame":
        addFrame(item.shape, point);
        return;
      case "pager":
        // A pager spans every slide, so it ignores the drop point by design.
        addPager(item.variant);
        return;
      case "media": {
        // Same rule as a dropped file: a frame under the pointer swallows it.
        const frame = frameAtPoint(point);
        if (frame) {
          fillFrame(frame, {
            mediaId: item.item.id || item.item.key,
            url: toDisplayMediaUrl(item.item.url),
            backendUrl: item.item.url,
            filename: item.item.filename,
          });
          toast.success(`Image added to ${frame.name}`);
          return;
        }
        await addLibraryImage(item.item, point);
        return;
      }
      case "photo":
        await insertStockPhoto(item.photo, point);
        return;
      case "hiclipart":
        await insertHiclipartGraphic(item.graphic, point);
        return;
      case "sticker":
        await insertSticker(item.sticker, point);
        return;
      case "library":
        try {
          const svg = await fetchLibraryAssetSvg(item.asset);
          const frame = frameAtPoint(point);
          if (frame) {
            await fillFrameWithVector(frame, item.asset, svg);
            return;
          }
          addVector({
            asset: item.asset,
            svg: item.asset.provider === "iconify" ? svg : undefined,
            at: point,
          });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "The element could not load.",
          );
        }
    }
  };

  /**
   * Drop a name tag on every slide at once.
   *
   * Fanned out like the pager: one copy per page sharing a syncId, so editing or
   * moving it anywhere moves it everywhere. Placed bottom-left, which is where a
   * handle usually sits and out of the pager's way.
   */
  const addTag = (variant: CreativeTagVariant = "handle") => {
    if (!activePage || !document) return;
    const syncId = createCreativeId("tag");
    const handle = currentProfile?.handle
      ? `@${currentProfile.handle.replace(/^@/, "")}`
      : currentProfile?.name || "@yourhandle";
    const text =
      variant === "location"
        ? "Lagos, Nigeria"
        : variant === "plate"
          ? handle.replace(/^@/, "")
          : handle;
    const fontSize = variant === "plate" ? 30 : 34;
    // A nameplate is a hard-edged slab, the other two are pills.
    const style =
      variant === "plate"
        ? { paddingX: 20, paddingY: 12, radius: 4 }
        : { paddingX: 26, paddingY: 14, radius: 999 };
    const box = estimateTagBox({ text, fontSize, style });
    let activeElementId = "";

    const commands = document.pages.map((page) => {
      const elementId = createCreativeId("tag");
      if (page.id === activePage.id) activeElementId = elementId;
      return makeCommand({
        type: "element.add",
        pageId: page.id,
        element: {
          id: elementId,
          name: TAG_VARIANTS[variant].label,
          type: "tag" as const,
          syncId,
          variant,
          badge: false,
          x: 80,
          y: document.canvas.height - box.height - 80,
          width: box.width,
          height: box.height,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          text,
          fontFamily: "Outfit",
          fontSize,
          fontWeight: "600" as const,
          fill: contrastColor(activePage.background),
          letterSpacing: 0,
          textTransform: "none" as const,
          style,
        },
      });
    });
    dispatch(commands);
    setSelectedElementId(activeElementId);
  };

  const addPager = (variant: CreativePagerProps["variant"]) => {
    if (!activePage || !document) return;
    const syncId = createCreativeId("pager");
    const width = variant === "numbers" ? 380 : 320;
    const height = variant === "numbers" ? 56 : 40;
    const props: CreativePagerProps = {
      variant,
      countMode: "auto",
      count: Math.max(2, Math.min(20, document.pages.length)),
      activeMode: "auto",
      activeIndex: 0,
      activeColor: contrastColor(activePage.background),
      inactiveColor: "#A9A3AE",
      size: variant === "numbers" ? 20 : 14,
      gap: 12,
    };
    let activeElementId = "";
    const commands = document.pages.map((page) => {
      const elementId = createCreativeId("widget");
      if (page.id === activePage.id) activeElementId = elementId;
      return makeCommand({
        type: "element.add",
        pageId: page.id,
        element: {
          id: elementId,
          name: "Pager",
          type: "widget" as const,
          widget: "pager" as const,
          syncId,
          x: Math.round((document.canvas.width - width) / 2),
          y: document.canvas.height - 116,
          width,
          height,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          props,
        },
      });
    });
    dispatch(commands);
    setSelectedElementId(activeElementId);
  };

  const addPage = () => {
    if (!document || !activePage) return;
    if (guest && document.pages.length >= guest.maxPages) {
      requireGuestAccount("pages");
      return;
    }
    const page: CreativePage = {
      id: createCreativeId("page"),
      name: `Slide ${document.pages.length + 1}`,
      background: activePage.background,
      backgroundEffect: activePage.backgroundEffect
        ? structuredClone(activePage.backgroundEffect)
        : undefined,
      // Smart elements are on every page by definition, so a new slide gets its
      // own copy of each — same syncId, fresh element id.
      elements: activePage.elements.filter(isSmartElement).map((element) => ({
        ...structuredClone(element),
        id: createCreativeId(element.type),
      })),
    };
    dispatch([
      makeCommand({
        type: "page.add",
        page,
        afterPageId: activePage.id,
      }),
    ]);
    setActivePageId(page.id);
    setSelectedElementId(undefined);
  };

  const changeSpreadCount = (count: SpreadCount) => {
    if (!document || !activePage) return;
    if (guest && count > guest.maxPages) {
      requireGuestAccount("pages");
      return;
    }
    const missing = Math.max(0, count - document.pages.length);
    if (missing > 0) {
      const commands: CreativeCommand[] = [];
      let afterPageId = document.pages.at(-1)?.id ?? activePage.id;
      for (let index = 0; index < missing; index += 1) {
        const page: CreativePage = {
          id: createCreativeId("page"),
          name: `Slide ${document.pages.length + index + 1}`,
          background: activePage.background,
          backgroundEffect: activePage.backgroundEffect
            ? structuredClone(activePage.backgroundEffect)
            : undefined,
          elements: activePage.elements
            .filter(isSmartElement)
            .map((element) => ({
              ...structuredClone(element),
              id: createCreativeId(element.type),
            })),
        };
        commands.push(makeCommand({ type: "page.add", page, afterPageId }));
        afterPageId = page.id;
      }
      dispatch(commands);
    }
    setSpreadCount(count);
    setSelectedElementId(undefined);
  };

  /** Page actions take an id so the filmstrip can act on any slide, not just
   *  the one on the canvas. Defaults to the active slide for the dock menu. */
  const duplicatePage = (pageId = activePageId) => {
    if (!document) return;
    if (guest && document.pages.length >= guest.maxPages) {
      requireGuestAccount("pages");
      return;
    }
    const source = document.pages.find((page) => page.id === pageId);
    if (!source) return;
    const page: CreativePage = {
      ...structuredClone(source),
      id: createCreativeId("page"),
      name: `Slide ${document.pages.length + 1}`,
      elements: source.elements.map((element) => ({
        ...structuredClone(element),
        id: createCreativeId(element.type),
      })),
    };
    dispatch([
      makeCommand({
        type: "page.add",
        page,
        afterPageId: source.id,
      }),
    ]);
    setActivePageId(page.id);
    setSelectedElementId(undefined);
  };

  const removePage = (pageId = activePageId) => {
    if (!document || document.pages.length === 1) return;
    const index = document.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const nextPage = document.pages[index - 1] ?? document.pages[index + 1];
    dispatch([
      makeCommand({ type: "page.remove", pageId: document.pages[index].id }),
    ]);
    // Only follow the deletion if the slide being removed is the one on screen.
    if (pageId === activePageId) {
      setActivePageId(nextPage.id);
      setSelectedElementId(undefined);
    }
  };

  /** Hide/show a slide. Hidden slides stay editable in the strip but drop out
   *  of exports, downloads, the compose handoff and the public share view. */
  const togglePageHidden = (pageId = activePageId) => {
    if (!document) return;
    const page = document.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    dispatch([
      makeCommand({
        type: "page.update",
        pageId: page.id,
        changes: { hidden: !page.hidden },
      }),
    ]);
  };

  /** Manual "Save version" from the history panel. */
  const saveNamedVersion = async (label?: string) => {
    if (guest) return;
    try {
      await snapshotVersion.mutateAsync({
        id: documentId,
        source: "manual",
        label: label?.trim() || undefined,
      });
      toast.success("Version saved");
    } catch {
      toast.error("Couldn’t save this version.");
    }
  };

  /**
   * Roll the whole design back to a snapshot. The server captures the current
   * state first (so this is undoable) and returns the restored document as a
   * fresh revision; we swap it into the editor, replacing the in-memory copy.
   */
  const restoreVersion = async (versionId: string) => {
    if (guest) return;
    try {
      const restored = await restoreVersionMut.mutateAsync({
        id: documentId,
        versionId,
      });
      const parsed = creativeDocumentSchema.safeParse(restored.document);
      if (!parsed.success) throw new Error("unreadable");
      const doc = dedupeElementIds(parsed.data);
      clearCreativeBackup(documentId);
      conflictRef.current = false;
      savedRevisionRef.current = restored.revision;
      loadedIdRef.current = documentId;
      setHistory({ past: [], current: doc, future: [] });
      setActivePageId(doc.pages[0]?.id);
      setSelectedElementId(undefined);
      setSelectedElementIds([]);
      setSaveState("saved");
      setHistoryOpen(false);
      toast.success("Design restored");
    } catch {
      toast.error("Couldn’t restore that version.");
    }
  };

  const removeElement = (target: CreativeElement) => {
    if (!document) return;
    const sourcePage = document.pages.find((page) =>
      page.elements.some((element) => element.id === target.id),
    );
    if (!sourcePage) return;
    const commands = target.seamlessId
      ? document.pages.flatMap((page) =>
          page.elements
            .filter((element) => element.seamlessId === target.seamlessId)
            .map((element) =>
              makeCommand({
                type: "element.remove",
                pageId: page.id,
                elementId: element.id,
              }),
            ),
        )
      : isSmartElement(target)
        ? document.pages.flatMap((page) =>
            page.elements
              .filter(
                (element) =>
                  isSmartElement(element) && element.syncId === target.syncId,
              )
              .map((element) =>
                makeCommand({
                  type: "element.remove",
                  pageId: page.id,
                  elementId: element.id,
                }),
              ),
          )
        : [
            makeCommand({
              type: "element.remove",
              pageId: sourcePage.id,
              elementId: target.id,
            }),
          ];
    dispatch(commands);
    setSelectedElementId(undefined);
  };

  const removeSelectedElement = () => {
    if (stageSelectionIds.length > 1 && spread) {
      const selected = spread.page.elements.filter((element) =>
        stageSelectionIds.includes(element.id),
      );
      const ids = new Set(selected.map((element) => element.id));
      const seamlessIds = new Set(
        selected.map((element) => element.seamlessId).filter(Boolean),
      );
      dispatchWith((current) =>
        current.pages.flatMap((page) =>
          page.elements
            .filter(
              (element) =>
                ids.has(element.id) ||
                (element.seamlessId && seamlessIds.has(element.seamlessId)),
            )
            .map((element) =>
              makeCommand({
                type: "element.remove",
                pageId: page.id,
                elementId: element.id,
              }),
            ),
        ),
      );
      setSelectedElementIds([]);
      setSelectedElementId(undefined);
      return;
    }
    if (selectedElement) removeElement(selectedElement);
  };

  const addFrame = (
    shape: CreativeFrameShape,
    at?: { x: number; y: number },
  ) => {
    if (!activePage || !document) return;
    const size = Math.round(
      Math.min(document.canvas.width, document.canvas.height) * 0.52,
    );
    const portrait = shape === "polaroid";
    const landscape = shape === "polaroid-landscape" || shape === "filmstrip";
    const width = portrait ? Math.round(size * 0.82) : size;
    const height = landscape
      ? Math.round(size * (shape === "filmstrip" ? 0.58 : 0.78))
      : size;
    const element = {
      id: createCreativeId("frame"),
      name: `${FRAME_SHAPE_LABELS[shape]} frame`,
      type: "frame" as const,
      shape,
      x: Math.round((at?.x ?? document.canvas.width / 2) - width / 2),
      y: Math.round((at?.y ?? document.canvas.height / 2) - height / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      radius: Math.round(size * 0.12),
      fit: "cover" as const,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      fill:
        shape.startsWith("polaroid") || shape === "photo-border"
          ? "#F7F3EB"
          : "#DED7CC",
      stroke: "transparent",
      strokeWidth: 0,
    };
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element,
      }),
    ]);
    setSelectedElementId(element.id);
  };

  /**
   * Put an Unsplash photo on the slide.
   *
   * The file is copied into the workspace's own media rather than hot-linked:
   * a design that points at a remote URL breaks if that URL moves, and the
   * export canvas would be at the mercy of another origin's CORS headers.
   */
  /**
   * Place a remote raster on the slide.
   *
   * Uploaded to our own media store first, never referenced in place: a
   * cross-origin image without CORS headers taints the canvas, and a tainted
   * canvas cannot be exported at all — the failure would surface as a broken
   * download long after the image was added. Storing it also means the design
   * survives the source taking the file down.
   */
  const insertRemoteImage = async (input: {
    url: string;
    filename: string;
    title: string;
    width: number;
    height: number;
    at?: { x: number; y: number };
    /** Named in the toast, so "Sticker added to Frame" reads correctly. */
    noun?: string;
    /** Library provenance so it lands in the right tab (sticker/photo). */
    source?: string;
  }) => {
    if (guest) {
      requireGuestAccount("cloud-media");
      return;
    }
    const stored = await post<{
      id?: string;
      key: string;
      url: string;
      backendUrl?: string;
    }>("media/upload-from-url", {
      url: input.url,
      filename: input.filename,
      source: input.source ?? "import",
    });
    if (!stored?.url) throw new Error("The image could not be saved.");

    const asset = {
      mediaId: stored.id || stored.key,
      url: toDisplayMediaUrl(stored.url),
      backendUrl: stored.backendUrl ?? stored.url,
      filename: input.title,
    };

    const frame = input.at ? frameAtPoint(input.at) : undefined;
    const target =
      frame ??
      (selectedElement?.type === "frame" ? selectedElement : undefined);
    if (target) {
      fillFrame(target, asset);
      toast.success(`${input.noun ?? "Image"} added to ${target.name}`);
      return;
    }

    placeImage({
      ...asset,
      naturalWidth: input.width,
      naturalHeight: input.height,
      at: input.at,
    });
  };

  const insertSticker = async (
    sticker: KlipySticker,
    at?: { x: number; y: number },
  ) => {
    try {
      await insertRemoteImage({
        url: sticker.url,
        filename: `${slugify(sticker.title).slice(0, 60) || "sticker"}-${sticker.id}.png`,
        title: sticker.title,
        width: sticker.width,
        height: sticker.height,
        at,
        noun: "Sticker",
        source: "sticker",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The sticker could not be added.",
      );
    }
  };

  const insertHiclipartGraphic = async (
    graphic: HiclipartGraphic,
    at?: { x: number; y: number },
  ) => {
    try {
      await insertRemoteImage({
        url: graphic.previewUrl,
        filename: `${slugify(graphic.title).slice(0, 60) || "hiclipart"}-${graphic.id}.jpg`,
        title: graphic.title,
        width: graphic.width,
        height: graphic.height,
        at,
        noun: "Graphic",
        source: "sticker",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The Hiclipart graphic could not be added.",
      );
    }
  };

  const insertStockPhoto = async (
    photo: UnsplashPhoto,
    at?: { x: number; y: number },
  ) => {
    try {
      if (guest) {
        requireGuestAccount("cloud-media");
        return;
      }
      const stored = await post<{
        id?: string;
        key: string;
        url: string;
        backendUrl?: string;
      }>("media/upload-from-url", {
        url: photo.imageUrl,
        filename: `${slugify(photo.title).slice(0, 60) || "unsplash"}-${photo.id}.jpg`,
        source: "photo",
      });
      if (!stored?.url) throw new Error("The photo could not be saved.");

      // Unsplash asks for this on actual use, not on search. Best effort — a
      // failed ping must not cost the user their image.
      void fetch("/api/creative/resources/unsplash/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
      }).catch(() => undefined);

      const asset = {
        mediaId: stored.id || stored.key,
        url: toDisplayMediaUrl(stored.url),
        backendUrl: stored.backendUrl ?? stored.url,
        filename: photo.title,
      };

      const frame = at ? frameAtPoint(at) : undefined;
      const target =
        frame ??
        (selectedElement?.type === "frame" ? selectedElement : undefined);
      if (target) {
        fillFrame(target, asset);
        toast.success(`Photo added to ${target.name}`);
        return;
      }

      placeImage({
        ...asset,
        naturalWidth: photo.width,
        naturalHeight: photo.height,
        at,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The photo could not be added.",
      );
    }
  };

  /** Drop an image into a frame, replacing whatever it held. */
  const fillFrame = (
    frame: Extract<CreativeElement, { type: "frame" }>,
    asset: CreativeMediaAsset | null,
  ) => {
    if (!activePage) return;
    dispatch([
      makeCommand({
        type: "frame.update",
        pageId: activePage.id,
        elementId: frame.id,
        changes: { asset },
      }),
    ]);
    setSelectedElementId(frame.id);
  };

  /**
   * Convert a free image layer into a frame fill. Both commands share one
   * dispatch so undo restores the image exactly where the drag began.
   */
  const dropCanvasImageIntoFrame = (imageId: string, frameId: string) => {
    if (!activePage) return;
    const pageId = activePage.id;
    dispatchWith((current) => {
      const page = current.pages.find((candidate) => candidate.id === pageId);
      const image = page?.elements.find(
        (element): element is Extract<CreativeElement, { type: "image" }> =>
          element.id === imageId && element.type === "image",
      );
      const frame = page?.elements.find(
        (element): element is Extract<CreativeElement, { type: "frame" }> =>
          element.id === frameId && element.type === "frame",
      );
      if (!image || !frame || frame.locked) return [];
      return [
        makeCommand({
          type: "frame.update",
          pageId,
          elementId: frame.id,
          changes: {
            asset: image.asset,
            adjustments: image.adjustments,
            effect: image.effect,
            edgeEffect: image.edgeEffect,
          },
        }),
        makeCommand({
          type: "element.remove",
          pageId,
          elementId: image.id,
        }),
      ];
    });
    setSelectedElementId(frameId);
    toast.success("Image added to frame");
  };

  /** Topmost unlocked frame under a point, in document coordinates. */
  const frameAtPoint = (point: { x: number; y: number }) => {
    if (!activePage) return undefined;
    return [...activePage.elements]
      .reverse()
      .find(
        (element): element is Extract<CreativeElement, { type: "frame" }> =>
          element.type === "frame" &&
          element.visible &&
          !element.locked &&
          point.x >= element.x &&
          point.x <= element.x + element.width &&
          point.y >= element.y &&
          point.y <= element.y + element.height,
      );
  };

  /**
   * Place an already-stored image on the active slide, fitted to the canvas.
   * Centred unless `at` says where it was dropped.
   */
  const placeImage = (input: {
    mediaId: string;
    url: string;
    backendUrl?: string;
    filename: string;
    naturalWidth: number;
    naturalHeight: number;
    at?: { x: number; y: number };
  }) => {
    if (!activePage || !document) return;
    const maxWidth = Math.round(document.canvas.width * 0.72);
    const maxHeight = Math.round(document.canvas.height * 0.58);
    const scale = Math.min(
      maxWidth / Math.max(1, input.naturalWidth),
      maxHeight / Math.max(1, input.naturalHeight),
      1,
    );
    const width = Math.max(80, Math.round(input.naturalWidth * scale));
    const height = Math.max(80, Math.round(input.naturalHeight * scale));
    const element = {
      id: createCreativeId("image"),
      name: input.filename,
      type: "image" as const,
      x: Math.round((input.at?.x ?? document.canvas.width / 2) - width / 2),
      y: Math.round((input.at?.y ?? document.canvas.height / 2) - height / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      asset: {
        mediaId: input.mediaId,
        url: input.url,
        backendUrl: input.backendUrl,
        filename: input.filename,
      },
      fit: "cover" as const,
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
      adjustments: { ...NEUTRAL_ADJUSTMENTS },
      radius: 0,
      flipX: false,
      flipY: false,
    };
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element,
      }),
    ]);
    setSelectedElementId(element.id);
  };

  /**
   * Upload a file and put it wherever it belongs: into `frame` when one is
   * targeted (selected, or under the drop point), otherwise as a free image.
   */
  const addImage = async (
    file?: File,
    target?: {
      /**
       * The frame to fill. `null` means "explicitly none" (a drop that landed
       * on empty canvas); leaving it out falls back to the selected frame.
       */
      frame?: Extract<CreativeElement, { type: "frame" }> | null;
      at?: { x: number; y: number };
    },
  ) => {
    if (!file || !activePage) return;
    // Read + clear the replace intent up front so a failed upload can't leave it
    // armed for the next unrelated pick.
    const replaceId = replaceImageTargetRef.current;
    replaceImageTargetRef.current = null;
    try {
      let uploadFile = file;
      if (isSvgFile(file)) {
        const svg = await file.text();
        assertSafeSvg(svg);
        uploadFile = await rasterizeSvgToPng(
          svg,
          `${slugify(file.name.replace(/\.svg$/i, ""))}.png`,
        );
      }
      const dimensions = await readImageDimensions(uploadFile);
      const uploaded = await uploadWorkspaceFiles([uploadFile]);
      const stored = uploaded.files?.[0];
      if (!stored?.url)
        throw new Error("The image upload did not return a URL.");
      const asset = {
        mediaId: stored.id || stored.key,
        url: stored.url,
        backendUrl: stored.backendUrl,
        filename: uploadFile.name,
      };

      // Replace-in-place: swap only the picture on the targeted image element,
      // leaving its box, crop/fit, adjustments and effects untouched.
      if (replaceId) {
        const targetEl = activePage.elements.find((el) => el.id === replaceId);
        if (targetEl?.type === "image") {
          updateTypedElement(targetEl, { asset });
          toast.success("Image replaced");
          return;
        }
      }

      const frame =
        target && "frame" in target
          ? target.frame
          : selectedElement?.type === "frame"
            ? selectedElement
            : undefined;
      if (frame) {
        fillFrame(frame, asset);
        toast.success(`Image added to ${frame.name}`);
        return;
      }

      placeImage({
        ...asset,
        filename: uploadFile.name,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        at: target?.at,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The image could not be added.",
      );
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  /** Place an image the workspace already owns (media library tab). */
  const addLibraryImage = async (
    item: CreativeMediaItem,
    at?: { x: number; y: number },
  ) => {
    const displayUrl = toDisplayMediaUrl(item.url);
    const asset = {
      mediaId: item.id || item.key,
      url: displayUrl,
      backendUrl: item.url,
      filename: item.filename,
    };

    // A selected frame is the obvious target — picking a photo fills it rather
    // than dropping a second image on top of it.
    if (selectedElement?.type === "frame") {
      fillFrame(selectedElement, asset);
      toast.success(`Image added to ${selectedElement.name}`);
      return;
    }

    try {
      const dimensions =
        item.width && item.height
          ? { width: item.width, height: item.height }
          : await readImageDimensionsFromUrl(displayUrl);
      placeImage({
        ...asset,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        at,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "That image could not be placed.",
      );
    }
  };

  /**
   * Several images selected/dropped at once — upload and place ALL of them, not
   * just the first. One file keeps the full single-file behaviour (frame fill,
   * replace intent); many are placed as free images, cascaded so they don't land
   * exactly on top of each other.
   */
  const addImages = async (
    files: File[],
    target?: {
      frame?: Extract<CreativeElement, { type: "frame" }> | null;
      at?: { x: number; y: number };
    },
  ) => {
    const images = files.filter(
      (file) => file.type.startsWith("image/") || isSvgFile(file),
    );
    if (images.length === 0) return;
    if (images.length === 1) {
      await addImage(images[0], target);
      return;
    }
    const base = target?.at ?? {
      x: (document?.canvas.width ?? 1080) / 2,
      y: (document?.canvas.height ?? 1350) / 2,
    };
    for (let index = 0; index < images.length; index += 1) {
      // Never frame-fill a multi-drop; cascade each so the stack is visible.
      await addImage(images[index], {
        frame: null,
        at: { x: base.x + index * 36, y: base.y + index * 36 },
      });
    }
  };

  /** Add a video element (green screen meme clip) to the canvas. */
  const addVideoElement = (opts: {
    src: string;
    chromaKeyed?: boolean;
    width?: number;
    height?: number;
    caption?: string;
  }) => {
    if (!activePage || !document) return;
    const cw = document.canvas.width;
    const ch = document.canvas.height;
    const w = opts.width ?? Math.round(cw * 0.6);
    const h = opts.height ?? Math.round(ch * 0.4);
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element: {
          type: "video" as const,
          id: createCreativeId("video"),
          name: opts.caption?.slice(0, 40) || "Video",
          x: (cw - w) / 2,
          y: (ch - h) / 2,
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          src: opts.src,
          chromaKeyed: opts.chromaKeyed ?? false,
          loop: true,
          fit: "contain" as const,
          radius: 0,
          memeCaption: opts.caption,
        },
      }),
    ]);
  };

  /** One or more image files dragged onto the canvas from the desktop. */
  const dropImageFiles = async (
    files: File[],
    point: { x: number; y: number },
  ) => {
    const images = files.filter(
      (file) => file.type.startsWith("image/") || isSvgFile(file),
    );
    if (images.length === 0) {
      toast.error("Only image files can be dropped onto the canvas.");
      return;
    }
    if (images.length === 1) {
      // A single drop is explicit about where it landed: on a frame it fills it.
      await addImage(images[0], {
        frame: frameAtPoint(point) ?? null,
        at: point,
      });
      return;
    }
    await addImages(images, { at: point });
  };

  const importFont = async (file?: File) => {
    if (!file || !activePage || !document || fontImporting) return;
    setFontImporting(true);
    try {
      const prepared = prepareCreativeFontFile(file);
      await validateCreativeFontFile(prepared.file, prepared.family);
      const uploaded = await uploadWorkspaceFiles([prepared.file]);
      const stored = uploaded.files?.[0];
      if (!stored?.url)
        throw new Error("The font upload did not return a URL.");

      const font: CreativeFont = {
        id: stored.id || stored.key || createCreativeId("font"),
        family: prepared.family,
        url: stored.url,
        backendUrl: stored.backendUrl,
        filename: prepared.file.name,
        mimeType: prepared.mimeType,
      };
      await registerCreativeFont(font);

      const commands: CreativeCommand[] = [
        makeCommand({ type: "font.add", font }),
      ];
      if (selectedElement?.type === "text") {
        commands.push(
          makeCommand({
            type: "text.update",
            pageId: activePage.id,
            elementId: selectedElement.id,
            changes: { fontFamily: font.family },
          }),
        );
      }
      dispatch(commands);
      toast.success(
        selectedElement?.type === "text"
          ? `${font.family} imported and applied`
          : `${font.family} imported`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The font could not import.",
      );
    } finally {
      setFontImporting(false);
      if (fontInputRef.current) fontInputRef.current.value = "";
    }
  };

  const updateElement = (
    elementId: string,
    changes: Record<string, string | number | boolean>,
    coalesceKey?: string,
    options?: { preserveAutoWidth?: boolean },
  ) => {
    if (!document) return;
    if (spread && spread.count > 1) {
      const display = spread.page.elements.find(
        (element) => element.id === elementId,
      );
      if (display) {
        updateSpreadElement(elementId, changes, coalesceKey);
        if (
          !options?.preserveAutoWidth &&
          display.type === "text" &&
          display.autoWidth &&
          typeof changes.width === "number" &&
          Math.abs(changes.width - display.width) > 1
        ) {
          updateTypedElement(display, { autoWidth: false });
        }
        return;
      }
    }
    dispatchWith((current) => {
      const sourcePage = current.pages.find((page) =>
        page.elements.some((element) => element.id === elementId),
      );
      const target = sourcePage?.elements.find(
        (element) => element.id === elementId,
      );
      if (!sourcePage || !target) return [];
      let commands: CreativeCommand[];
      if (target.seamlessId) {
        const deltaX =
          typeof changes.x === "number" ? changes.x - target.x : undefined;
        commands = current.pages.flatMap((page) =>
          page.elements
            .filter((element) => element.seamlessId === target.seamlessId)
            .map((element) =>
              makeCommand({
                type: "element.update",
                pageId: page.id,
                elementId: element.id,
                changes: {
                  ...changes,
                  ...(deltaX === undefined ? {} : { x: element.x + deltaX }),
                },
              } as CreativeCommandInput),
            ),
        );
      } else if (isSmartElement(target)) {
        commands = current.pages.flatMap((page) =>
          page.elements
            .filter(
              (element) =>
                isSmartElement(element) && element.syncId === target.syncId,
            )
            .map((element) =>
              makeCommand({
                type: "element.update",
                pageId: page.id,
                elementId: element.id,
                changes,
              } as CreativeCommandInput),
            ),
        );
      } else {
        commands = [
          makeCommand({
            type: "element.update",
            pageId: sourcePage.id,
            elementId,
            changes,
          } as CreativeCommandInput),
        ];
      }

      const manuallyResizedAutoText =
        !options?.preserveAutoWidth &&
        target.type === "text" &&
        target.autoWidth &&
        typeof changes.width === "number" &&
        Math.abs(changes.width - target.width) > 1;
      if (manuallyResizedAutoText) {
        commands.push(
          makeCommand({
            type: "text.update",
            pageId: sourcePage.id,
            elementId,
            changes: { autoWidth: false },
          }),
        );
      }
      return commands;
    }, coalesceKey);
  };

  const updateTypedElement = (
    element: CreativeElement,
    changes: Record<string, unknown>,
    coalesceKey?: string,
  ) => {
    if (!document) return;
    dispatchWith((current) => {
      const targets = element.seamlessId
        ? current.pages.flatMap((page) =>
            page.elements
              .filter(
                (candidate) =>
                  candidate.seamlessId === element.seamlessId &&
                  candidate.type === element.type,
              )
              .map((candidate) => ({ page, element: candidate })),
          )
        : current.pages.flatMap((page) => {
            const candidate = page.elements.find(
              (item) => item.id === element.id,
            );
            return candidate ? [{ page, element: candidate }] : [];
          });
      return targets.map(({ page, element: target }) =>
        makeCommand({
          type: `${target.type}.update` as const,
          pageId: page.id,
          elementId: target.id,
          changes,
        } as CreativeCommandInput),
      );
    }, coalesceKey);
  };

  /**
   * Fan a base change out to every selected element in one undo step — the
   * shared multi-select inspector. Position/size are excluded from that panel,
   * so this only carries style/base props (opacity, radius, locked…) that are
   * safe to set identically across a selection.
   */
  const updateSelectedElementsBase = (
    changes: Record<string, string | number | boolean>,
  ) => {
    if (!document) return;
    const ids = new Set(selectedElementIds);
    dispatchWith((current) =>
      current.pages.flatMap((page) =>
        page.elements
          .filter((element) => ids.has(element.id))
          .map((element) =>
            makeCommand({
              type: "element.update",
              pageId: page.id,
              elementId: element.id,
              changes,
            } as CreativeCommandInput),
          ),
      ),
    );
  };

  /** Fan a typed change (radius, shadow, colour, typography…) to all selected. */
  const updateSelectedElementsTyped = (changes: Record<string, unknown>) => {
    if (!document) return;
    const ids = new Set(selectedElementIds);
    dispatchWith((current) =>
      current.pages.flatMap((page) =>
        page.elements
          .filter((element) => ids.has(element.id))
          .map((element) =>
            makeCommand({
              type: `${element.type}.update` as const,
              pageId: page.id,
              elementId: element.id,
              changes,
            } as CreativeCommandInput),
          ),
      ),
    );
  };

  const updateMultipleElements = (
    transforms: Array<{
      elementId: string;
      changes: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        fontSize?: number;
      };
    }>,
  ) => {
    if (!document || transforms.length === 0) return;
    dispatchWith((current) => {
      const liveSpread = composeCreativeSpread(
        current,
        activePageIndex,
        spread?.count ?? 1,
      );
      return transforms.flatMap(({ elementId, changes }) => {
        const { fontSize, ...geometry } = changes;
        const sourcePage = liveSpread.sourcePageByElementId.get(elementId);
        const sourceIndex = sourcePage
          ? liveSpread.pages.findIndex((page) => page.id === sourcePage.id)
          : -1;
        const page =
          sourcePage ??
          current.pages.find((candidate) =>
            candidate.elements.some((element) => element.id === elementId),
          );
        const target = page?.elements.find(
          (element) => element.id === elementId,
        );
        if (!page || !target) return [];
        const localChanges = {
          ...geometry,
          x:
            sourceIndex >= 0
              ? geometry.x - sourceIndex * current.canvas.width
              : geometry.x,
        };
        const targets = target.seamlessId
          ? current.pages.flatMap((candidate) =>
              candidate.elements
                .filter((element) => element.seamlessId === target.seamlessId)
                .map((element) => ({ page: candidate, element })),
            )
          : [{ page, element: target }];
        const deltaX = localChanges.x - target.x;
        return targets.flatMap(({ page: candidate, element }) => [
          makeCommand({
            type: "element.update",
            pageId: candidate.id,
            elementId: element.id,
            changes: {
              ...localChanges,
              x: element.x + deltaX,
            },
          }),
          ...(fontSize !== undefined && element.type === "text"
            ? [
                makeCommand({
                  type: "text.update",
                  pageId: candidate.id,
                  elementId: element.id,
                  changes: { fontSize },
                }),
              ]
            : []),
        ]);
      });
    });
  };

  const setSelectionGroup = (grouped: boolean) => {
    if (!document || stageSelectionIds.length < 2 || !spread) return;
    const selected = stageSelectionIds.flatMap((id) => {
      const element = spread.page.elements.find(
        (candidate) => candidate.id === id,
      );
      return element ? [element] : [];
    });
    const selectedGroups = new Set(
      selected.map((element) => element.groupId).filter(Boolean),
    );
    const groupId = grouped ? createCreativeId("group") : null;
    const groupName = grouped
      ? (() => {
          const names = new Set(
            document.pages.flatMap((page) =>
              page.elements.flatMap((element) =>
                element.groupName ? [element.groupName] : [],
              ),
            ),
          );
          let index = 1;
          while (names.has(`Group ${index}`)) index += 1;
          return `Group ${index}`;
        })()
      : null;
    dispatchWith((current) => {
      const seen = new Set<string>();
      return current.pages.flatMap((page) => {
        const pageCommands = page.elements.flatMap((element) => {
          const selectedDirectly = selected.some(
            (candidate) =>
              candidate.id === element.id ||
              (candidate.seamlessId &&
                candidate.seamlessId === element.seamlessId),
          );
          const inUngroupedSelection =
            !grouped && element.groupId && selectedGroups.has(element.groupId);
          if (
            (!selectedDirectly && !inUngroupedSelection) ||
            seen.has(element.id)
          ) {
            return [];
          }
          seen.add(element.id);
          return [
            makeCommand({
              type: "element.update",
              pageId: page.id,
              elementId: element.id,
              changes: { groupId, groupName },
            }),
          ];
        });
        if (!grouped) return pageCommands;

        const selectedIds = page.elements
          .filter((element) =>
            selected.some(
              (candidate) =>
                candidate.id === element.id ||
                (candidate.seamlessId &&
                  candidate.seamlessId === element.seamlessId),
            ),
          )
          .map((element) => element.id);
        if (selectedIds.length < 2) return pageCommands;

        const selectedIdSet = new Set(selectedIds);
        const highestSelectedIndex = Math.max(
          ...page.elements.map((element, index) =>
            selectedIdSet.has(element.id) ? index : -1,
          ),
        );
        const insertionIndex = page.elements.filter(
          (element, index) =>
            index <= highestSelectedIndex && !selectedIdSet.has(element.id),
        ).length;
        return [
          ...pageCommands,
          makeCommand({
            type: "element.reorderMany",
            pageId: page.id,
            elementIds: selectedIds,
            index: insertionIndex,
          }),
        ];
      });
    });
    toast.success(grouped ? "Elements grouped" : "Group separated");
  };

  const setLayerSelection = (elementIds: string[]) => {
    setSelectedElementIds(elementIds);
    setSelectedElementId(elementIds.length === 1 ? elementIds[0] : undefined);
  };

  const ungroupLayerGroup = (groupId: string) => {
    dispatchWith((current) =>
      current.pages.flatMap((page) =>
        page.elements
          .filter((element) => element.groupId === groupId)
          .map((element) =>
            makeCommand({
              type: "element.update",
              pageId: page.id,
              elementId: element.id,
              changes: { groupId: null, groupName: null },
            }),
          ),
      ),
    );
    setSelectedElementIds([]);
    setSelectedElementId(undefined);
    toast.success("Group separated");
  };

  const renameLayerGroup = (groupId: string, name: string) => {
    dispatchWith((current) =>
      current.pages.flatMap((page) =>
        page.elements
          .filter((element) => element.groupId === groupId)
          .map((element) =>
            makeCommand({
              type: "element.update",
              pageId: page.id,
              elementId: element.id,
              changes: { groupName: name },
            }),
          ),
      ),
    );
  };

  const setLayerGroupFlag = (
    groupId: string,
    changes: { visible?: boolean; locked?: boolean },
  ) => {
    dispatchWith((current) =>
      current.pages.flatMap((page) =>
        page.elements
          .filter((element) => element.groupId === groupId)
          .map((element) =>
            makeCommand({
              type: "element.update",
              pageId: page.id,
              elementId: element.id,
              changes,
            }),
          ),
      ),
    );
  };

  const removeLayers = (elementIds: string[]) => {
    if (!document || elementIds.length === 0) return;
    const selected = document.pages.flatMap((page) =>
      page.elements.filter((element) => elementIds.includes(element.id)),
    );
    const ids = new Set(selected.map((element) => element.id));
    const seamlessIds = new Set(
      selected.map((element) => element.seamlessId).filter(Boolean),
    );
    dispatchWith((current) =>
      current.pages.flatMap((page) =>
        page.elements
          .filter(
            (element) =>
              ids.has(element.id) ||
              (element.seamlessId && seamlessIds.has(element.seamlessId)),
          )
          .map((element) =>
            makeCommand({
              type: "element.remove",
              pageId: page.id,
              elementId: element.id,
            }),
          ),
      ),
    );
    setSelectedElementIds([]);
    setSelectedElementId(undefined);
  };

  const moveLayers = ({
    elementIds,
    targetElementId,
    targetGroupId,
  }: {
    elementIds: string[];
    targetElementId: string;
    targetGroupId: string | null;
  }) => {
    if (elementIds.length === 0) return;
    dispatchWith((current) => {
      const page = current.pages.find((candidate) =>
        candidate.elements.some((element) => elementIds.includes(element.id)),
      );
      if (!page) return [];
      const targetPage = current.pages.find((candidate) =>
        candidate.elements.some((element) => element.id === targetElementId),
      );
      if (!targetPage || targetPage.id !== page.id) return [];
      const movingIdSet = new Set(elementIds);
      const moving = page.elements.filter((element) =>
        movingIdSet.has(element.id),
      );
      const target = page.elements.find(
        (element) => element.id === targetElementId,
      );
      if (
        moving.length !== elementIds.length ||
        !target ||
        movingIdSet.has(target.id)
      ) {
        return [];
      }

      const commands: CreativeCommand[] = [];
      if (moving.length === 1) {
        const element = moving[0]!;
        const targetGroupName = targetGroupId
          ? (page.elements.find(
              (candidate) => candidate.groupId === targetGroupId,
            )?.groupName ?? "Group")
          : null;
        if (element.groupId !== targetGroupId) {
          const previousGroupId = element.groupId;
          commands.push(
            makeCommand({
              type: "element.update",
              pageId: page.id,
              elementId: element.id,
              changes: {
                groupId: targetGroupId,
                groupName: targetGroupName,
              },
            }),
          );
          if (previousGroupId) {
            const previousMembers = page.elements.filter(
              (candidate) =>
                candidate.groupId === previousGroupId &&
                candidate.id !== element.id,
            );
            if (previousMembers.length === 1) {
              commands.push(
                makeCommand({
                  type: "element.update",
                  pageId: page.id,
                  elementId: previousMembers[0]!.id,
                  changes: { groupId: null, groupName: null },
                }),
              );
            }
          }
        }
      }

      const remaining = page.elements.filter(
        (element) => !movingIdSet.has(element.id),
      );
      const targetIndex = remaining.findIndex(
        (element) => element.id === targetElementId,
      );
      if (targetIndex < 0) return commands;
      commands.push(
        makeCommand({
          type: "element.reorderMany",
          pageId: page.id,
          elementIds,
          index: targetIndex + 1,
        }),
      );
      return commands;
    });
  };

  /**
   * Project one layer onto every slide it overlaps. The copies retain the
   * original editable element (including image effects and vector data); only
   * x becomes page-local. Per-slide clipping during export makes the seam exact.
   */
  const updateSpreadElement = (
    elementId: string,
    changes: Record<string, string | number | boolean>,
    coalesceKey?: string,
  ) => {
    if (!spread || spread.count === 1 || !document) return;
    dispatchWith((current) => {
      const liveSpread = composeCreativeSpread(
        current,
        activePageIndex,
        spread.count,
        elementId,
      );
      const display = liveSpread.page.elements.find(
        (element) => element.id === elementId,
      );
      if (!display) return [];
      const transformed = {
        ...structuredClone(display),
        ...changes,
      } as CreativeElement;
      const touched = coveredSpreadPageIndices(
        transformed.x,
        transformed.width,
        current.canvas.width,
        liveSpread.count,
        transformed.height,
        transformed.rotation,
      );
      const seamlessId = transformed.seamlessId ?? createCreativeId("seamless");
      const existing = current.pages.flatMap((page) =>
        page.elements
          .filter(
            (element) =>
              element.id === elementId ||
              (transformed.seamlessId &&
                element.seamlessId === transformed.seamlessId),
          )
          .map((element) => ({ page, element })),
      );
      const stackIndex = Math.max(
        0,
        existing[0]?.page.elements.findIndex(
          (element) => element.id === existing[0]?.element.id,
        ) ?? 0,
      );
      const reusableIds = existing.map(({ element }) => element.id);
      const commands: CreativeCommand[] = existing.map(({ page, element }) =>
        makeCommand({
          type: "element.remove",
          pageId: page.id,
          elementId: element.id,
        }),
      );

      touched.forEach((localPageIndex, copyIndex) => {
        const page = liveSpread.pages[localPageIndex];
        if (!page) return;
        const copy = {
          ...structuredClone(transformed),
          id:
            copyIndex === 0
              ? elementId
              : (reusableIds[copyIndex] ?? createCreativeId(transformed.type)),
          seamlessId,
          x: transformed.x - localPageIndex * current.canvas.width,
        } as CreativeElement;
        commands.push(
          makeCommand({ type: "element.add", pageId: page.id, element: copy }),
          makeCommand({
            type: "element.reorder",
            pageId: page.id,
            elementId: copy.id,
            index: Math.min(stackIndex, page.elements.length),
          }),
        );
      });
      return commands;
    }, coalesceKey);
  };

  /* ---------------------------------------------------------------- *
   * Element-level actions shared by the canvas, layers panel, and
   * keyboard shortcuts.
   * ---------------------------------------------------------------- */

  const duplicateElement = (element: CreativeElement) => {
    if (!activePage || !document) return;
    const offset = Math.round(document.canvas.width * 0.03);
    const copy = {
      ...structuredClone(element),
      id: createCreativeId(element.type),
      name: `${element.name} copy`,
      groupId: null,
      groupName: null,
      x: element.x + offset,
      y: element.y + offset,
    } as CreativeElement;
    // A duplicated ordinary element starts page-specific. Built-in pager/tag
    // elements require a sync id by schema, so their duplicate starts a fresh
    // logical instance instead of joining the original one.
    if (isSmartElement(copy)) {
      if (copy.type === "widget" || copy.type === "tag") {
        copy.syncId = createCreativeId(copy.type);
      } else {
        delete (copy as CreativeElement & { syncId?: string }).syncId;
      }
    }
    dispatch([
      makeCommand({
        type: "element.add",
        pageId: activePage.id,
        element: copy,
      }),
    ]);
    setSelectedElementId(copy.id);
  };

  const selectedCanvasElements = () => {
    if (!spread) return selectedElement ? [selectedElement] : [];
    if (stageSelectionIds.length > 1) {
      return spread.page.elements.filter((element) =>
        stageSelectionIds.includes(element.id),
      );
    }
    return selectedElement ? [selectedElement] : [];
  };

  const copySelection = () => {
    const selected = selectedCanvasElements();
    if (!selected.length) return false;
    clipboardRef.current = structuredClone(selected);
    setClipboardCount(selected.length);
    toast.success(
      selected.length === 1
        ? `${selected[0]!.name} copied`
        : `${selected.length} elements copied`,
    );
    return true;
  };

  const pasteElements = (source: CreativeElement[]) => {
    if (!activePage || !document || source.length === 0) return;
    const offset = Math.round(document.canvas.width * 0.03);
    const groupIds = new Map<string, string>();
    const copies = source.map((element) => {
      const previousGroup = element.groupId;
      const groupId = previousGroup
        ? (groupIds.get(previousGroup) ??
          (() => {
            const id = createCreativeId("group");
            groupIds.set(previousGroup, id);
            return id;
          })())
        : null;
      const copy = {
        ...structuredClone(element),
        id: createCreativeId(element.type),
        name: `${element.name} copy`,
        groupId,
        seamlessId: undefined,
        x: element.x + offset,
        y: element.y + offset,
      } as CreativeElement;
      if (isSmartElement(copy)) {
        if (copy.type === "widget" || copy.type === "tag") {
          copy.syncId = createCreativeId(copy.type);
        } else {
          delete (copy as CreativeElement & { syncId?: string }).syncId;
        }
      }
      return copy;
    });
    dispatch(
      copies.map((element) =>
        makeCommand({
          type: "element.add",
          pageId: activePage.id,
          element,
        }),
      ),
    );
    setSelectedElementIds(copies.map((element) => element.id));
    setSelectedElementId(copies.length === 1 ? copies[0]!.id : undefined);
  };

  const pasteClipboard = () => {
    if (clipboardRef.current.length === 0) return false;
    pasteElements(clipboardRef.current);
    return true;
  };

  const duplicateSelection = () => {
    const selected = selectedCanvasElements();
    if (selected.length > 1) pasteElements(selected);
    else if (selected[0]) duplicateElement(selected[0]);
  };

  const cutSelection = () => {
    if (!selectedCanvasElements().length) return;
    copySelection();
    removeSelectedElement();
  };

  const copySelectionStyle = () => {
    const source = selectedCanvasElements()[0];
    if (!source) return;
    styleClipboardRef.current = copyCreativeElementStyle(source);
    setHasStyleClipboard(true);
    toast.success("Style copied");
  };

  const pasteSelectionStyle = () => {
    const style = styleClipboardRef.current;
    const selected = selectedCanvasElements();
    if (!style || selected.length === 0) return;
    dispatchWith((current) =>
      selected.flatMap((displayElement) => {
        const page = current.pages.find((candidate) =>
          candidate.elements.some(
            (element) => element.id === displayElement.id,
          ),
        );
        const element = page?.elements.find(
          (candidate) => candidate.id === displayElement.id,
        );
        if (!page || !element) return [];
        const commands: CreativeCommand[] = [
          makeCommand({
            type: "element.update",
            pageId: page.id,
            elementId: element.id,
            changes: { opacity: style.opacity },
          }),
        ];
        if (
          element.type === style.type &&
          Object.keys(style.changes).length > 0
        ) {
          commands.push(
            makeCommand({
              type: `${element.type}.update`,
              pageId: page.id,
              elementId: element.id,
              changes: structuredClone(style.changes),
            } as CreativeCommandInput),
          );
        }
        return commands;
      }),
    );
    toast.success(
      selected.length === 1
        ? "Style applied"
        : `Style applied to ${selected.length} elements`,
    );
  };

  const selectAllElements = () => {
    if (!spread) return;
    const ids = spread.page.elements
      .filter((element) => element.visible && !element.locked)
      .map((element) => element.id);
    setSelectedElementIds(ids);
    setSelectedElementId(ids.length === 1 ? ids[0] : undefined);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (stageSelectionIds.length > 1 && spread) {
      updateMultipleElements(
        spread.page.elements
          .filter(
            (element) =>
              stageSelectionIds.includes(element.id) && !element.locked,
          )
          .map((element) => ({
            elementId: element.id,
            changes: {
              x: element.x + dx,
              y: element.y + dy,
              width: element.width,
              height: element.height,
              rotation: element.rotation,
            },
          })),
      );
      return;
    }
    if (!selectedElement || selectedElement.locked) return;
    updateElement(
      selectedElement.id,
      { x: selectedElement.x + dx, y: selectedElement.y + dy },
      `nudge:${selectedElement.id}`,
    );
  };

  const alignSelected = (edge: AlignEdge) => {
    if (!selectedElement || !document || selectedElement.locked) return;
    const changes = alignBoxToFrame(selectedElement, document.canvas, edge);
    updateElement(selectedElement.id, changes);
  };

  const setElementFlag = (
    element: CreativeElement,
    changes: { visible?: boolean; locked?: boolean },
  ) => {
    dispatchWith((current) => {
      const sourcePage = current.pages.find((page) =>
        page.elements.some((candidate) => candidate.id === element.id),
      );
      const target = sourcePage?.elements.find(
        (candidate) => candidate.id === element.id,
      );
      if (!sourcePage || !target) return [];
      const targets = target.seamlessId
        ? current.pages.flatMap((page) =>
            page.elements
              .filter((candidate) => candidate.seamlessId === target.seamlessId)
              .map((candidate) => ({ page, element: candidate })),
          )
        : [{ page: sourcePage, element: target }];
      return targets.map(({ page, element: candidate }) =>
        makeCommand({
          type: "element.update",
          pageId: page.id,
          elementId: candidate.id,
          changes,
        }),
      );
    });
  };

  const setElementAcrossPages = (elementId: string, acrossPages: boolean) => {
    if (!document) return;
    const sourcePage = document.pages.find((page) =>
      page.elements.some((element) => element.id === elementId),
    );
    if (!sourcePage) return;

    dispatch([
      makeCommand(
        acrossPages
          ? {
              type: "element.syncAcrossPages",
              pageId: sourcePage.id,
              elementId,
            }
          : {
              type: "element.makePageSpecific",
              pageId: sourcePage.id,
              elementId,
            },
      ),
    ]);
    toast.success(
      acrossPages ? "Shown on every page" : "Detached on this page",
    );
  };

  const reorderElement = (element: CreativeElement, index: number) => {
    if (!document) return;
    const sourcePage = document.pages.find((page) =>
      page.elements.some((candidate) => candidate.id === element.id),
    );
    if (!sourcePage) return;
    dispatch([
      makeCommand({
        type: "element.reorder",
        pageId: sourcePage.id,
        elementId: element.id,
        index,
      }),
    ]);
  };

  /**
   * A background is a locked, full-bleed bottom image rather than an ordinary
   * stretched layer. Keeping it in the element stack preserves the existing
   * image effects/export path while making its background semantics explicit.
   */
  const setImageAsBackground = (elementId: string) => {
    if (!activePage || !document) return;
    const image = activePage.elements.find(
      (element) => element.id === elementId && element.type === "image",
    );
    if (!image) return;
    const previousBackgrounds = activePage.elements.filter(
      (element) =>
        element.id !== image.id &&
        element.type === "image" &&
        element.name === "Background image",
    );
    dispatch([
      ...previousBackgrounds.map((element) =>
        makeCommand({
          type: "element.remove" as const,
          pageId: activePage.id,
          elementId: element.id,
        }),
      ),
      makeCommand({
        type: "element.update",
        pageId: activePage.id,
        elementId: image.id,
        changes: {
          name: "Background image",
          x: 0,
          y: 0,
          width: document.canvas.width,
          height: document.canvas.height,
          rotation: 0,
          locked: true,
        },
      }),
      makeCommand({
        type: "image.update",
        pageId: activePage.id,
        elementId: image.id,
        changes: {
          fit: "cover",
          crop: { zoom: 1, offsetX: 0, offsetY: 0 },
          radius: 0,
        },
      }),
      makeCommand({
        type: "element.reorder",
        pageId: activePage.id,
        elementId: image.id,
        index: 0,
      }),
    ]);
    setSelectedElementId(undefined);
    toast.success("Image set as background");
  };

  const resizeCanvas = (preset: CreativePreset) => {
    if (!document) return;
    dispatch([
      makeCommand({
        type: "document.resize",
        canvas: { ...CREATIVE_PRESETS[preset] },
        scaleContent: true,
      }),
    ]);
  };

  /**
   * Cut the background out of an image or a frame's photo. The work happens in
   * a worker whose models are a large one-time download, so the caller is
   * expected to have confirmed that first (see `startBackgroundRemoval`).
   */
  const removeElementBackground = async (
    element: Extract<CreativeElement, { type: "image" | "frame" }>,
  ) => {
    if (!activePage || backgroundRemoval) return;
    // Frames may be empty; images always carry one.
    const asset = element.asset;
    if (!asset) return;
    const pageId = activePage.id;
    const controller = new AbortController();
    backgroundRemovalAbortRef.current = controller;
    setBackgroundRemoval({
      elementId: element.id,
      stage: "downloading",
      progress: 0,
    });
    try {
      const { removeBackgroundWithSnap } =
        await import("@/lib/creative/snap-background-removal");
      const blob = await removeBackgroundWithSnap(asset.url, {
        signal: controller.signal,
        // Phones can't afford the two ~67 MB RGBA buffers a 4096² output needs.
        maxOutputEdge: isMobile ? 2048 : undefined,
        onProgress: ({ stage, progress }) =>
          setBackgroundRemoval({ elementId: element.id, stage, progress }),
      });
      setBackgroundRemoval({
        elementId: element.id,
        stage: "uploading",
        progress: 1,
      });
      const basename = (asset.filename || element.name)
        .replace(/\.[^.]+$/, "")
        .slice(0, 180);
      const filename = `${basename || "cutout"}-no-bg.png`;
      const uploaded = await uploadWorkspaceFiles([
        new File([blob], filename, { type: "image/png" }),
      ]);
      const stored = uploaded.files?.[0];
      if (!stored?.url) {
        throw new Error("The processed image upload did not return a URL.");
      }
      const nextAsset = {
        mediaId: stored.id || stored.key,
        url: stored.url,
        backendUrl: stored.backendUrl,
        filename,
      };
      dispatch([
        makeCommand(
          element.type === "frame"
            ? {
                type: "frame.update",
                pageId,
                elementId: element.id,
                // Same picture, minus its background — the framing the user
                // already chose still applies.
                changes: { asset: nextAsset, keepCrop: true },
              }
            : {
                type: "image.update",
                pageId,
                elementId: element.id,
                changes: { asset: nextAsset },
              },
        ),
      ]);
      setModelsCached(true);
      toast.success("Background removed");
    } catch (error) {
      // Cancelling is a choice, not a failure.
      if (!controller.signal.aborted) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The background could not be removed.",
        );
      }
    } finally {
      backgroundRemovalAbortRef.current = null;
      setBackgroundRemoval(null);
    }
  };

  /**
   * Gate the first run behind an explicit confirmation: the models are a
   * ~134 MB download, which is not something to start silently on a phone.
   */
  const startBackgroundRemoval = (
    element: Extract<CreativeElement, { type: "image" | "frame" }>,
  ) => {
    // `null` means the cache probe hasn't answered yet. Ask in that case too:
    // a needless prompt is cheaper than an unannounced 140 MB download.
    if (modelsCached !== true && !cutoutConfirmed) {
      setCutoutPrompt(element.id);
      return;
    }
    void removeElementBackground(element);
  };

  const cancelBackgroundRemoval = () => {
    backgroundRemovalAbortRef.current?.abort();
  };

  const shareDesign = async () => {
    if (guest || !document) return;
    toast.error("Connect a publishing provider to share public links.");
  };

  /**
   * Encode the design to an MP4 — one scene per visible page — via mediabunny,
   * then download it. Video-mode designs use this instead of the still export.
   */
  const exportVideo = async () => {
    if (!document || videoProgress !== null) return;
    if (guest && guest.edition !== "local") {
      requireGuestAccount("exports");
      return;
    }
    setVideoProgress(0);
    try {
      const blob = await exportCreativeVideo({
        document,
        onProgress: (fraction) => setVideoProgress(fraction),
      });
      downloadBlob(blob, `${slugify(document.title)}.mp4`);
      toast.success("Video exported");
    } catch (error) {
      toast.error(
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : "The video could not be exported.",
      );
    } finally {
      setVideoProgress(null);
    }
  };

  const exportSlide = async (destination: "download" | "media") => {
    if (!stageRef.current || !document || !activePage || exporting) return;
    if (guest && destination === "media") {
      requireGuestAccount("cloud-media");
      return;
    }
    if (
      guest &&
      destination === "download" &&
      guest.exportCount >= guest.exportLimit
    ) {
      requireGuestAccount("exports");
      return;
    }
    setExporting(destination);
    try {
      const blob =
        spread && spread.count > 1
          ? await renderCreativePageToBlob({
              page: activePage,
              fonts: document.fonts,
              pageIndex: activePageIndex,
              pageCount: document.pages.length,
              width: document.canvas.width,
              height: document.canvas.height,
            })
          : await stageRef.current.exportPng();
      const filename = `${slugify(document.title)}-${slugify(activePage.name)}.png`;
      if (destination === "download") {
        downloadBlob(blob, filename);
        await guest?.onExportComplete();
        toast.success("Slide exported");
      } else {
        await mediaUpload.mutateAsync([
          new File([blob], filename, { type: "image/png" }),
        ]);
        toast.success("Slide saved to Media");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The slide could not be exported.",
      );
    } finally {
      setExporting(null);
    }
  };

  /**
   * Render every slide off-screen, in order. The editor never has to step
   * through the carousel, and hidden pages stay in sync with what's on canvas
   * because the same object factories are used.
   */
  const renderAllSlides = async (): Promise<SlideFile[]> => {
    if (!document) return [];
    const slug = slugify(document.title);
    const slides: SlideFile[] = [];
    // Hidden slides stay in the document but never leave the editor.
    const visible = document.pages.filter((page) => !page.hidden);
    for (const [index, page] of visible.entries()) {
      const blob = await renderCreativePageToBlob({
        page,
        fonts: document.fonts,
        pageIndex: index,
        pageCount: visible.length,
        width: document.canvas.width,
        height: document.canvas.height,
      });
      slides.push({
        name: slideFilename(slug, index, visible.length),
        blob,
      });
    }
    return slides;
  };

  const exportAllSlides = async (
    destination: "download" | "media" | "compose",
  ) => {
    if (!document || exporting) return;
    if (guest && destination !== "download") {
      requireGuestAccount(
        destination === "compose" ? "compose" : "cloud-media",
      );
      return;
    }
    if (
      guest &&
      destination === "download" &&
      guest.exportCount >= guest.exportLimit
    ) {
      requireGuestAccount("exports");
      return;
    }
    setExporting(destination);
    try {
      const slides = await renderAllSlides();
      if (slides.length === 0) throw new Error("There is nothing to export.");

      if (destination === "download") {
        const zip = await createSlideZip(slides);
        downloadBlob(zip, `${slugify(document.title)}.zip`);
        await guest?.onExportComplete();
        toast.success(
          `${slides.length} slide${slides.length === 1 ? "" : "s"} exported`,
        );
        return;
      }

      const uploaded = await mediaUpload.mutateAsync(
        slides.map(
          (slide) => new File([slide.blob], slide.name, { type: "image/png" }),
        ),
      );
      const files = uploaded.files ?? [];
      if (files.length === 0) {
        throw new Error("The slides did not upload.");
      }

      if (destination === "media") {
        // The first slide doubles as the design's cover in the project grid.
        const cover = files[0]?.url;
        if (cover) {
          patchDocument
            .mutateAsync({ id: documentId, thumbnailUrl: cover })
            .catch(() => {
              // A missing cover is cosmetic; the slides are already saved.
            });
        }
        toast.success(
          `${files.length} slide${files.length === 1 ? "" : "s"} saved to Media`,
        );
        return;
      }

      // Hand the rendered carousel to the composer in slide order.
      appStore.getState().mutate({
        composeSeed: {
          mediaUrls: files.map(
            (file: { backendUrl?: string; url: string }) =>
              file.backendUrl || file.url,
          ),
          mediaDisplayUrls: files.map((file: { url: string }) => file.url),
        },
      });
      router.push("/compose");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The slides could not be exported.",
      );
    } finally {
      setExporting(null);
    }
  };

  /**
   * Pick up what the Studio agent just did to this design.
   *
   * The agent writes through the server, so its edits are only a newer revision
   * until we fetch them. The editor normally *owns* the document once loaded
   * (see the record hook) and refetching mid-edit would fight the history stack
   * — so this is deliberate and only runs when a run has just finished.
   *
   * Unsaved local edits are never overwritten. If the canvas is dirty the change
   * is offered rather than applied, because silently replacing work someone is
   * in the middle of is the worse failure by a distance.
   */
  /**
   * Apply a batch the agent asked for.
   *
   * Deliberately the same path as a human edit: validated by the command schema,
   * pushed through `dispatch`, so it lands in history and is undoable, and is
   * persisted by the editor's own autosave. That is what removes the sync problem
   * — the agent no longer writes to the document behind the editor's back, so
   * there are no longer two copies to reconcile.
   *
   * Commands arrive as unknown: they crossed a network boundary, and the reducer
   * is strict, so anything malformed is rejected here with a message rather than
   * throwing mid-batch.
   */
  const applyAgentCommands = (incoming: unknown[]) => {
    if (!activePage || incoming.length === 0) return;

    const commands: CreativeCommand[] = [];
    for (const [index, raw] of incoming.entries()) {
      const parsed = creativeCommandSchema.safeParse(raw);
      if (!parsed.success) {
        toast.error(
          `The assistant's change ${index + 1} could not be applied: ${
            parsed.error.issues[0]?.message ?? "unrecognised command"
          }`,
        );
        return;
      }
      commands.push(parsed.data);
    }

    // Capture a restore point before the assistant's first edit in a run, so a
    // bad AI change is always one click away from being undone.
    if (!guest && Date.now() - lastAiSnapshotRef.current > 20_000) {
      lastAiSnapshotRef.current = Date.now();
      snapshotVersion.mutate({
        id: documentId,
        source: "ai",
        label: "Before AI edit",
      });
    }

    dispatch(commands);
    toast.success(
      `The assistant made ${commands.length} change${commands.length === 1 ? "" : "s"}`,
    );
  };

  const adoptAgentEdits = async () => {
    if (loadedIdRef.current !== documentId) return;
    const refreshed = await record.refetch();
    const data = refreshed.data;
    if (!data) return;
    if (data.revision <= (savedRevisionRef.current ?? 0)) return;

    const parsed = creativeDocumentSchema.safeParse(data.document);
    if (!parsed.success) {
      toast.error("The assistant's version of this design could not be read.");
      return;
    }

    const adopt = () => {
      savedRevisionRef.current = data.revision;
      conflictRef.current = false;
      setSaveState("saved");
      // Pushed as a history entry, so the agent's edit can be undone like any
      // other. Local edits made after this point save normally on top of it.
      setHistory((previous) =>
        previous
          ? {
              past: [...previous.past, previous.current].slice(-HISTORY_LIMIT),
              current: parsed.data,
              future: [],
            }
          : { past: [], current: parsed.data, future: [] },
      );
      setSelectedElementId(undefined);
    };

    const localEdits =
      document !== undefined && document.revision !== savedRevisionRef.current;
    if (localEdits) {
      toast.info("The assistant changed this design.", {
        description:
          "You have unsaved edits, so it wasn't loaded automatically.",
        action: { label: "Load it", onClick: adopt },
        duration: 30_000,
      });
      return;
    }

    adopt();
    toast.success("The assistant updated this design.");
  };

  const stepPage = (delta: number) => {
    if (!document) return;
    const current = document.pages.findIndex(
      (page) => page.id === activePageId,
    );
    const target =
      document.pages[
        Math.min(
          document.pages.length - 1,
          Math.max(0, (current < 0 ? 0 : current) + delta),
        )
      ];
    if (target && target.id !== activePageId) {
      setActivePageId(target.id);
      setSelectedElementId(undefined);
    }
  };

  // Native clipboard paste of a BITMAP (a screenshot, a copied web image) onto
  // the canvas. The keydown-based shortcut only pastes internally-copied
  // elements; OS-clipboard image bytes are only reachable from the real `paste`
  // event. A ref keeps the listener registered once while calling the latest
  // addImage.
  const addImageRef = useRef(addImage);
  addImageRef.current = addImage;
  useEffect(() => {
    const onPasteImage = (event: ClipboardEvent) => {
      // Let inputs and an active text edit (incl. Fabric's hidden edit textarea)
      // handle their own paste — only grab an image dropped on the canvas.
      // `document` is shadowed here by the CreativeDocument — use window.document.
      const active = window.document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) {
        return;
      }
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void addImageRef.current(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPasteImage);
    return () => window.removeEventListener("paste", onPasteImage);
  }, []);

  useCreativeShortcuts(
    {
      onUndo: undo,
      onRedo: redo,
      onDelete: removeSelectedElement,
      onDuplicate: duplicateSelection,
      onCut: cutSelection,
      onCopy: copySelection,
      onPaste: pasteClipboard,
      onSelectAll: selectAllElements,
      onGroup: () => setSelectionGroup(true),
      onUngroup: () => setSelectionGroup(false),
      onDeselect: () => {
        setSelectedElementIds([]);
        setSelectedElementId(undefined);
      },
      onNudge: nudgeSelected,
      onPreviousPage: () => stepPage(-1),
      onNextPage: () => stepPage(1),
      onPickTool: (tool) => {
        if (tool === "select") {
          changeTool("elements");
          return;
        }
        changeTool("draw");
        setEraserActive(tool === "erase");
      },
    },
    Boolean(document),
  );

  if (
    isMobile === undefined ||
    (!guest && record.isLoading) ||
    (!document && !guest && !record.isError)
  ) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground">
        Opening design…
      </div>
    );
  }

  if (!document || !activePage) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>This design could not be opened.</p>
        <button
          type="button"
          onClick={() => router.push("/studio")}
          className="rounded-xl px-3 py-2 text-xs font-medium text-foreground"
          style={{ border: "1px solid var(--hairline)" }}
        >
          Back to Studio
        </button>
      </div>
    );
  }

  const hiddenInputs = (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files
            ? Array.from(event.target.files)
            : [];
          if (files.length === 0) return;
          // Replace-image is a single-target intent — only ever take the first.
          if (replaceImageTargetRef.current) void addImage(files[0]);
          else void addImages(files);
        }}
      />
      <input
        ref={fontInputRef}
        type="file"
        accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
        className="sr-only"
        onChange={(event) => void importFont(event.target.files?.[0])}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files
            ? Array.from(event.target.files)
            : [];
          event.target.value = "";
          void uploadFilesToLibrary(files);
        }}
      />
    </>
  );

  // The panels are identical on both surfaces; only the chrome around them
  // differs, so they are built once and handed to whichever shell is in use.
  const toolsPanel = (
    <CreativeToolShelf
      activeTool={activeTool}
      layerPages={spread?.pages ?? [activePage]}
      background={activePage.background}
      backgroundEffect={activePage.backgroundEffect}
      uploadPending={mediaUpload.isPending}
      showMediaLibrary={!guest}
      selectedElementIds={stageSelectionIds}
      selectedTextFamily={
        selectedElement?.type === "text"
          ? selectedElement.fontFamily
          : undefined
      }
      customFontFamilies={document.fonts.map((font) => font.family)}
      onSelectFont={applyFont}
      frameSelected={selectedElement?.type === "frame"}
      hideRail={isMobile}
      onToolChange={changeTool}
      onAddText={addText}
      onAddShape={addShape}
      onAddFrame={addFrame}
      onAddPager={addPager}
      onAddTag={addTag}
      onAddVector={(input) => {
        if (selectedElement?.type === "frame") {
          void fillFrameWithVector(selectedElement, input.asset, input.svg);
          return;
        }
        addVector(input);
      }}
      onInsertPhoto={(photo) => insertStockPhoto(photo)}
      onInsertHiclipart={(graphic) => insertHiclipartGraphic(graphic)}
      onInsertSticker={(sticker) => insertSticker(sticker)}
      onAddVideo={addVideoElement}
      onUpload={() => libraryInputRef.current?.click()}
      uploads={uploads}
      onPickLibraryImage={(item) => void addLibraryImage(item)}
      onSelectionChange={setLayerSelection}
      onGroupElements={() => setSelectionGroup(true)}
      onUngroupElements={ungroupLayerGroup}
      onRenameGroup={renameLayerGroup}
      onSetGroupVisible={(groupId, visible) =>
        setLayerGroupFlag(groupId, { visible })
      }
      onSetGroupLocked={(groupId, locked) =>
        setLayerGroupFlag(groupId, { locked })
      }
      onRemoveElements={removeLayers}
      onMoveLayers={moveLayers}
      onToggleElementVisible={(element) =>
        setElementFlag(element, { visible: !element.visible })
      }
      onToggleElementLocked={(element) =>
        setElementFlag(element, { locked: !element.locked })
      }
      onReorderElement={reorderElement}
      onBackgroundChange={(background) =>
        dispatch([
          makeCommand({
            type: "page.update",
            pageId: activePage.id,
            changes: { background },
          }),
        ])
      }
      onBackgroundEffectChange={(backgroundEffect) =>
        dispatch([
          makeCommand({
            type: "page.update",
            pageId: activePage.id,
            changes: { backgroundEffect },
          }),
        ])
      }
      recents={recents}
      onUseRecent={useRecent}
      drawing={drawingControls}
      onBrushChange={changeBrush}
      onDrawingChange={applyDrawingChange}
    />
  );

  const movePage = (index: number, pageId = activePage.id) =>
    dispatch([makeCommand({ type: "page.reorder", pageId, index })]);

  /**
   * Strokes join the sketch that is already being drawn rather than each
   * becoming its own layer, so a drawing reads as one object in the layers
   * panel. A fresh sketch starts when the tool is picked up, the page changes,
   * or the current one is full.
   */
  const commitStroke = (stroke: CreativeDrawingStroke) => {
    dispatchWith((current) => {
      const page = current.pages.find(
        (candidate) => candidate.id === activePage.id,
      );
      if (!page) return [];
      const open = activeDrawingIdRef.current
        ? page.elements.find(
            (element) => element.id === activeDrawingIdRef.current,
          )
        : undefined;

      // Appending to a rotated sketch would accumulate skewed points, since the
      // reducer maps document coordinates without undoing rotation.
      if (
        open?.type === "drawing" &&
        open.rotation === 0 &&
        !open.locked &&
        open.strokes.length < CREATIVE_DRAWING_STROKE_LIMIT
      ) {
        return [
          makeCommand({
            type: "drawing.stroke.add",
            pageId: page.id,
            elementId: open.id,
            stroke,
          }),
        ];
      }

      const element = createDrawingElement({ stroke });
      activeDrawingIdRef.current = element.id;
      return [makeCommand({ type: "element.add", pageId: page.id, element })];
    });
  };

  /**
   * Erase whatever ink is under the pointer. Hit-testing happens against the
   * live document inside the dispatch, so dragging across a sketch cannot act
   * on stale stroke indices.
   */
  const erasePoint = (point: { x: number; y: number }) => {
    dispatchWith((current) => {
      const page = current.pages.find(
        (candidate) => candidate.id === activePage.id,
      );
      if (!page) return [];

      // Topmost first: erasing should bite the sketch you can see.
      for (let index = page.elements.length - 1; index >= 0; index -= 1) {
        const element = page.elements[index];
        if (
          !element ||
          element.type !== "drawing" ||
          !element.visible ||
          element.locked
        ) {
          continue;
        }
        const local = toDrawingLocalPoint(element, point);
        if (!local) continue;
        const indices = strokesHit(element.strokes, local.point, local.radius);
        if (!indices.length) continue;
        return [
          makeCommand({
            type: "drawing.stroke.remove",
            pageId: page.id,
            elementId: element.id,
            indices,
          }),
        ];
      }
      return [];
    }, "drawing:erase");
  };

  const canvasPanel = (
    <CreativeCanvasPanel
      stageRef={stageRef}
      document={document}
      activePage={activePage}
      stagePage={spread?.page ?? activePage}
      activePageIndex={activePageIndex}
      spreadPages={spread?.count === 1 ? undefined : spread?.pages}
      spreadCount={spread?.count ?? 1}
      onSpreadCountChange={changeSpreadCount}
      selectedElementId={selectedElementId}
      selectedElementIds={stageSelectionIds}
      selectionGrouped={selectionGrouped}
      filmstripExpanded={filmstripExpanded}
      variant={isMobile ? "mobile" : "desktop"}
      onDuplicatePage={duplicatePage}
      onRemovePage={removePage}
      onTogglePageHidden={togglePageHidden}
      onMovePage={movePage}
      onSelectElement={setSelectedElementId}
      onSelectionChange={setSelectedElementIds}
      onTransform={(elementId, changes) => {
        if (changes.fontSize !== undefined) {
          updateMultipleElements([{ elementId, changes }]);
          return;
        }
        updateElement(elementId, changes);
      }}
      onTransforms={updateMultipleElements}
      onTextChange={(elementId, text, dimensions) => {
        dispatchWith((current) => {
          const page = current.pages.find((candidate) =>
            candidate.elements.some((element) => element.id === elementId),
          );
          const element = page?.elements.find(
            (candidate) => candidate.id === elementId,
          );
          if (!page || element?.type !== "text") return [];
          return [
            makeCommand({
              type: "text.update",
              pageId: page.id,
              elementId,
              changes: { text },
            }),
            ...(dimensions && element.autoWidth
              ? [
                  makeCommand({
                    type: "element.update",
                    pageId: page.id,
                    elementId,
                    changes: dimensions,
                  }),
                ]
              : []),
          ];
        });
      }}
      onToggleFilmstrip={() => setFilmstripExpanded((expanded) => !expanded)}
      onSelectPage={(pageId) => {
        setActivePageId(pageId);
        setSelectedElementId(undefined);
        // A sketch belongs to one slide; the next stroke starts a new one.
        activeDrawingIdRef.current = undefined;
      }}
      onAddPage={addPage}
      onDropFiles={(files, point) => void dropImageFiles(files, point)}
      onDropAsset={(json, point) => void dropStudioItem(json, point)}
      onImageFrameDrop={dropCanvasImageIntoFrame}
      canPaste={clipboardCount > 0}
      canPasteStyle={hasStyleClipboard}
      onCutSelection={cutSelection}
      onCopySelection={copySelection}
      onPaste={pasteClipboard}
      onCopyStyle={copySelectionStyle}
      onPasteStyle={pasteSelectionStyle}
      onDuplicateSelection={duplicateSelection}
      onDeleteSelection={removeSelectedElement}
      onSelectAll={selectAllElements}
      onDuplicateElement={(elementId) => {
        const element = document.pages
          .flatMap((page) => page.elements)
          .find((candidate) => candidate.id === elementId);
        if (element) duplicateElement(element);
      }}
      onRemoveElement={(elementId) => {
        const element =
          (spread?.page ?? activePage).elements.find(
            (candidate) => candidate.id === elementId,
          ) ??
          document.pages
            .flatMap((page) => page.elements)
            .find((candidate) => candidate.id === elementId);
        if (element) removeElement(element);
      }}
      onReorderElement={(elementId, action) => {
        const page = document.pages.find((candidate) =>
          candidate.elements.some((element) => element.id === elementId),
        );
        const element = page?.elements.find(
          (candidate) => candidate.id === elementId,
        );
        if (!page || !element) return;
        const currentIndex = page.elements.findIndex(
          (candidate) => candidate.id === elementId,
        );
        const index =
          action === "front"
            ? page.elements.length - 1
            : action === "back"
              ? 0
              : action === "forward"
                ? currentIndex + 1
                : currentIndex - 1;
        reorderElement(element, index);
      }}
      onSetElementLocked={(elementId, locked) => {
        const element = activePage.elements.find(
          (candidate) => candidate.id === elementId,
        );
        if (element) setElementFlag(element, { locked });
      }}
      onSetElementAcrossPages={setElementAcrossPages}
      onSetImageAsBackground={setImageAsBackground}
      onGroupSelection={() => setSelectionGroup(true)}
      onUngroupSelection={() => setSelectionGroup(false)}
      drawing={drawingSettings}
      onStrokeCommit={commitStroke}
      onErasePoint={erasePoint}
    />
  );

  const assistantPanel = (
    <StudioAssistantPanel
      documentId={document.id}
      documentTitle={document.title}
      canvas={document.canvas}
      pageCount={document.pages.length}
      activePageId={activePageId}
      resolveClientTool={resolveStudioClientTool}
      onRunFinish={adoptAgentEdits}
      onApplyCommands={applyAgentCommands}
    />
  );
  const toggleAssistant = () => {
    if (guest) {
      requireGuestAccount("assistant");
      return;
    }
    setShowAssistant((value) => !value);
  };

  const noopCutout: CutoutControls = {
    state: null,
    busyElsewhere: false,
    needsDownload: false,
    confirming: false,
    onStart: () => {},
    onConfirm: () => {},
    onDismiss: () => {},
    onCancel: () => {},
  };
  const inspectorPanel = multiSelectType ? (
    // Shared panel over a homogeneous multi-selection: reuse the same inspector
    // with the first element as the representative; every edit fans out to all.
    <ElementInspector
      element={selectedElements[0]}
      multiCount={selectedElements.length}
      fonts={document.fonts}
      fontImporting={fontImporting}
      uploadPending={mediaUpload.isPending}
      cutout={noopCutout}
      onImportFont={() => fontInputRef.current?.click()}
      onReplaceFrameImage={() => imageInputRef.current?.click()}
      onReplaceImage={() => {}}
      onBaseChange={updateSelectedElementsBase}
      onTypedChange={updateSelectedElementsTyped}
      onAlign={alignSelected}
      onDuplicate={duplicateSelection}
      onRemove={removeSelectedElement}
    />
  ) : selectedElement ? (
    <ElementInspector
      element={selectedElement}
      fonts={document.fonts}
      fontImporting={fontImporting}
      uploadPending={mediaUpload.isPending}
      cutout={{
        state:
          backgroundRemoval?.elementId === selectedElement.id
            ? backgroundRemoval
            : null,
        busyElsewhere:
          backgroundRemoval !== null &&
          backgroundRemoval.elementId !== selectedElement.id,
        needsDownload: modelsCached === false && !cutoutConfirmed,
        confirming: cutoutPrompt === selectedElement.id,
        onStart: () => {
          if (
            selectedElement.type === "image" ||
            selectedElement.type === "frame"
          ) {
            startBackgroundRemoval(selectedElement);
          }
        },
        onConfirm: () => {
          setCutoutPrompt(null);
          setCutoutConfirmed(true);
          if (
            selectedElement.type === "image" ||
            selectedElement.type === "frame"
          ) {
            void removeElementBackground(selectedElement);
          }
        },
        onDismiss: () => setCutoutPrompt(null),
        onCancel: cancelBackgroundRemoval,
      }}
      onImportFont={() => fontInputRef.current?.click()}
      onReplaceFrameImage={() => imageInputRef.current?.click()}
      onReplaceImage={() => {
        if (selectedElement.type !== "image") return;
        replaceImageTargetRef.current = selectedElement.id;
        imageInputRef.current?.click();
      }}
      onBaseChange={(changes) =>
        updateElement(
          selectedElement.id,
          changes,
          `inspector:${selectedElement.id}:${Object.keys(changes).join(",")}`,
        )
      }
      onTypedChange={(changes) =>
        updateTypedElement(
          selectedElement,
          changes,
          `inspector:${selectedElement.id}:${Object.keys(changes).join(",")}`,
        )
      }
      onAlign={alignSelected}
      onDuplicate={() => duplicateElement(selectedElement)}
      onRemove={removeSelectedElement}
    />
  ) : selectedElements.length > 1 ? (
    <MixedSelectionInspector
      count={selectedElements.length}
      opacity={selectedElements[0]?.opacity ?? 1}
      onOpacity={(opacity) => updateSelectedElementsBase({ opacity })}
      onAlign={alignSelected}
      onDuplicate={duplicateSelection}
      onRemove={removeSelectedElement}
    />
  ) : (
    <PageInspector
      page={activePage}
      canvas={document.canvas}
      onChange={(changes) =>
        dispatch([
          makeCommand({
            type: "page.update",
            pageId: activePage.id,
            changes,
          }),
        ])
      }
      onResizeCanvas={resizeCanvas}
    />
  );

  const localEdition = guest?.edition === "local";

  if (isMobile) {
    return (
      <>
        {hiddenInputs}
        <MobileStudioShell
          title={document.title}
          saveState={saveState}
          activeTool={activeTool}
          selectedElement={selectedElement}
          canUndo={Boolean(history?.past.length)}
          canRedo={Boolean(history?.future.length)}
          busy={exporting !== null}
          canvas={canvasPanel}
          filmstrip={
            <PageFilmstrip
              pages={document.pages}
              fonts={document.fonts}
              canvasWidth={document.canvas.width}
              canvasHeight={document.canvas.height}
              activePageId={activePage.id}
              expanded={false}
              compact
              onToggleExpanded={() => undefined}
              onSelect={(pageId) => {
                setActivePageId(pageId);
                setSelectedElementId(undefined);
              }}
              onAdd={addPage}
            />
          }
          tools={toolsPanel}
          inspector={showAssistant ? assistantPanel : inspectorPanel}
          menu={
            <MobileDesignMenu
              title={document.title}
              pageCount={document.pages.length}
              activePageIndex={activePageIndex}
              exporting={exporting}
              onRename={(title) =>
                dispatch([makeCommand({ type: "document.rename", title })])
              }
              onDuplicatePage={duplicatePage}
              onRemovePage={removePage}
              onMovePage={movePage}
              onTogglePageHidden={() => togglePageHidden(activePageId)}
              pageHidden={Boolean(activePage?.hidden)}
              onSaveToMedia={
                localEdition ? undefined : () => void exportAllSlides("media")
              }
              onDownloadAll={() => void exportAllSlides("download")}
              onOpenHistory={guest ? undefined : () => setHistoryOpen(true)}
              assistantOpen={showAssistant}
              onToggleAssistant={localEdition ? undefined : toggleAssistant}
              onChooseSoundtrack={
                document.kind === "video" && !localEdition
                  ? () => setSoundtrackPickerOpen(true)
                  : undefined
              }
              soundtrackSelected={Boolean(document.soundtrack)}
              onExportVideo={
                document.kind === "video" ? () => void exportVideo() : undefined
              }
              videoProgress={videoProgress}
            />
          }
          onBack={() =>
            router.push(guest && !localEdition ? "/tools" : "/studio")
          }
          onToolChange={changeTool}
          onUndo={undo}
          onRedo={redo}
          onSendToCompose={
            localEdition ? undefined : () => void exportAllSlides("compose")
          }
        />
        {document.kind === "video" && !localEdition ? (
          <TrendingAudioPicker
            accessibleToAll
            libraryOnly
            hideTrigger
            open={soundtrackPickerOpen}
            onOpenChange={setSoundtrackPickerOpen}
            selectedAudioId={document.soundtrack?.audioId ?? null}
            onSelect={(audioId, track) =>
              dispatch([
                makeCommand({
                  type: "document.soundtrack.set",
                  soundtrack: audioId
                    ? {
                        audioId,
                        title: track?.song,
                        artist: track?.artist,
                        volume: document.soundtrack?.volume ?? 0.6,
                      }
                    : null,
                }),
              ])
            }
          />
        ) : null}
        {guest ? null : (
          <CreativeHistoryPanel
            documentId={documentId}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            onRestore={(versionId) => void restoreVersion(versionId)}
            onSaveVersion={(label) => void saveNamedVersion(label)}
            restoring={restoreVersionMut.isPending}
          />
        )}
      </>
    );
  }

  return (
    // A definite height, not min-height: with min-height the editor grows to fit
    // a tall tool panel, the app's scroll container takes the overflow, and the
    // sidebar's own `overflow-y-auto` never has a bounded parent to scroll in.
    //
    // `h-full` rather than a viewport calculation. This sits inside a flex column
    // that already runs from 100dvh down through the app chrome, so 100% of the
    // parent *is* the space that's left. Subtracting a guessed 7rem instead left
    // whatever the chrome didn't actually use as dead space under the editor.
    <main
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ fontFamily: "var(--font-outfit)" }}
    >
      <CreativeWorkspaceHeader
        documentId={document.id}
        title={document.title}
        saveState={saveState}
        pageCount={document.pages.length}
        canUndo={Boolean(history?.past.length)}
        canRedo={Boolean(history?.future.length)}
        assistantOpen={showAssistant}
        exporting={exporting}
        localDraft={Boolean(guest)}
        freeExportsRemaining={
          guest && !localEdition
            ? Math.max(0, guest.exportLimit - guest.exportCount)
            : undefined
        }
        onBack={() =>
          router.push(guest && !localEdition ? "/tools" : "/studio")
        }
        onRename={(title) =>
          dispatch([makeCommand({ type: "document.rename", title })])
        }
        onUndo={undo}
        onRedo={redo}
        onToggleAssistant={localEdition ? undefined : toggleAssistant}
        onSaveToMedia={
          localEdition
            ? undefined
            : () =>
                void (document.pages.length > 1
                  ? exportAllSlides("media")
                  : exportSlide("media"))
        }
        onDownloadSlide={() => void exportSlide("download")}
        onDownloadAll={() => void exportAllSlides("download")}
        onSendToCompose={
          localEdition ? undefined : () => void exportAllSlides("compose")
        }
        onShare={guest ? undefined : shareDesign}
        onOpenHistory={guest ? undefined : () => setHistoryOpen(true)}
        onExportVideo={document.kind === "video" ? exportVideo : undefined}
        onChooseSoundtrack={
          document.kind === "video" && !localEdition
            ? () => setSoundtrackPickerOpen(true)
            : undefined
        }
        soundtrackSelected={Boolean(document.soundtrack)}
        videoProgress={videoProgress}
        sharing={sharing}
      />

      {document.kind === "video" && !localEdition ? (
        <TrendingAudioPicker
          accessibleToAll
          libraryOnly
          hideTrigger
          open={soundtrackPickerOpen}
          onOpenChange={setSoundtrackPickerOpen}
          selectedAudioId={document.soundtrack?.audioId ?? null}
          onSelect={(audioId, track) =>
            dispatch([
              makeCommand({
                type: "document.soundtrack.set",
                soundtrack: audioId
                  ? {
                      audioId,
                      title: track?.song,
                      artist: track?.artist,
                      volume: document.soundtrack?.volume ?? 0.6,
                    }
                  : null,
              }),
            ])
          }
        />
      ) : null}

      {guest ? null : (
        <CreativeHistoryPanel
          documentId={documentId}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onRestore={(versionId) => void restoreVersion(versionId)}
          onSaveVersion={(label) => void saveNamedVersion(label)}
          restoring={restoreVersionMut.isPending}
        />
      )}

      {hiddenInputs}

      <CreativeWorkspaceShell
        tools={toolsPanel}
        canvas={canvasPanel}
        inspector={showAssistant ? assistantPanel : inspectorPanel}
      />
    </main>
  );
}

function CreativeToolShelf({
  activeTool,
  layerPages,
  background,
  backgroundEffect,
  uploadPending,
  showMediaLibrary = true,
  selectedElementIds,
  selectedTextFamily,
  customFontFamilies,
  onSelectFont,
  frameSelected,
  hideRail = false,
  onToolChange,
  onAddText,
  onAddShape,
  onAddFrame,
  onAddPager,
  onAddTag,
  onAddVector,
  onInsertHiclipart,
  onInsertPhoto,
  onInsertSticker,
  onAddVideo,
  onUpload,
  uploads,
  onPickLibraryImage,
  onSelectionChange,
  onGroupElements,
  onUngroupElements,
  onRenameGroup,
  onSetGroupVisible,
  onSetGroupLocked,
  onRemoveElements,
  onMoveLayers,
  onToggleElementVisible,
  onToggleElementLocked,
  onReorderElement,
  onBackgroundChange,
  onBackgroundEffectChange,
  drawing,
  onBrushChange,
  onDrawingChange,
  recents,
  onUseRecent,
}: {
  activeTool: CreativeTool;
  layerPages: CreativePage[];
  background: string;
  backgroundEffect?: CreativeBackgroundEffect;
  uploadPending: boolean;
  showMediaLibrary?: boolean;
  selectedElementIds: string[];
  /** Font of the selected text element, if that's what's selected. */
  selectedTextFamily?: string;
  customFontFamilies: string[];
  onSelectFont(family: string): void;
  /** Drives the selected-frame hint on the Uploads tab. */
  frameSelected: boolean;
  /** The mobile dock picks the tool, so the icon rail is redundant there. */
  hideRail?: boolean;
  onToolChange(tool: CreativeTool): void;
  onPickLibraryImage(item: CreativeMediaItem): void;
  onSelectionChange(elementIds: string[]): void;
  onGroupElements(elementIds: string[]): void;
  onUngroupElements(groupId: string): void;
  onRenameGroup(groupId: string, name: string): void;
  onSetGroupVisible(groupId: string, visible: boolean): void;
  onSetGroupLocked(groupId: string, locked: boolean): void;
  onRemoveElements(elementIds: string[]): void;
  onMoveLayers(input: {
    elementIds: string[];
    targetElementId: string;
    targetGroupId: string | null;
  }): void;
  onToggleElementVisible(element: CreativeElement): void;
  onToggleElementLocked(element: CreativeElement): void;
  onReorderElement(element: CreativeElement, index: number): void;
  onAddText(variant: "heading" | "body"): void;
  onAddShape(shape: CreativeShapeKind): void;
  onAddFrame(shape: CreativeFrameShape): void;
  onAddPager(variant: CreativePagerProps["variant"]): void;
  onAddTag(variant: CreativeTagVariant): void;
  onAddVector(input: { asset: CreativeLibraryAsset; svg?: string }): void;
  onInsertHiclipart(graphic: HiclipartGraphic): Promise<void> | void;
  onInsertPhoto(photo: UnsplashPhoto): Promise<void> | void;
  onInsertSticker(sticker: KlipySticker): Promise<void> | void;
  onAddVideo(opts: {
    src: string;
    chromaKeyed?: boolean;
    caption?: string;
  }): void;
  onUpload(): void;
  uploads?: StudioUploadProgress[];
  onBackgroundChange(background: string): void;
  onBackgroundEffectChange(backgroundEffect: CreativeBackgroundEffect): void;
  recents: StudioDragItem[];
  onUseRecent(item: StudioDragItem): void;
  drawing: DrawingControls;
  onBrushChange(brush: CreativeBrush): void;
  onDrawingChange(changes: Partial<Omit<DrawingControls, "brush">>): void;
}) {
  const tools = [
    { id: "text" as const, label: "Text", icon: IconTypography },
    { id: "uploads" as const, label: "Uploads", icon: IconPhotoPlus },
    { id: "elements" as const, label: "Elements", icon: IconRectangle },
    { id: "draw" as const, label: "Draw", icon: IconBrush },
    { id: "layers" as const, label: "Layers", icon: IconStack2 },
    { id: "background" as const, label: "Canvas", icon: IconPalette },
  ];
  const effect =
    backgroundEffect ?? createDefaultBackgroundEffect("none", background);

  return (
    <aside className="flex h-full min-h-0 min-w-0" aria-label="Creative tools">
      {hideRail ? null : (
        <nav
          className="flex w-[72px] shrink-0 flex-col items-center gap-1 p-2"
          aria-label="Add content"
          style={{ borderRight: "1px solid var(--hairline)" }}
        >
          {tools.map(({ id, label, icon: Icon }) => {
            const active = activeTool === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToolChange(id)}
                aria-pressed={active}
                className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-medium transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: "var(--inset)",
                        color: "var(--foreground)",
                      }
                    : { color: "var(--muted-foreground)" }
                }
              >
                <Icon className="size-[18px]" stroke={1.8} />
                {label}
              </button>
            );
          })}
        </nav>
      )}

      <div
        className={`min-h-0 min-w-0 flex-1 ${hideRail ? "" : "overflow-y-auto p-4"}`}
      >
        {activeTool === "text" ? (
          <div className="space-y-4">
            <ToolShelfHeading title="Text" detail="" />
            <button
              type="button"
              onClick={() => onAddText("heading")}
              {...tileDragProps({ kind: "text", variant: "heading" })}
              className="w-full cursor-grab rounded-xl px-3 py-4 text-left text-xl font-bold tracking-tight transition-colors hover:bg-foreground/[0.04] active:cursor-grabbing"
              style={{
                backgroundColor: "var(--inset)",
                border: "1px solid var(--hairline)",
              }}
            >
              Add a heading
            </button>
            <button
              type="button"
              onClick={() => onAddText("body")}
              {...tileDragProps({ kind: "text", variant: "body" })}
              className="w-full cursor-grab rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.04] active:cursor-grabbing"
              style={{ border: "1px solid var(--hairline)" }}
            >
              Add body text
            </button>

            <div
              className="space-y-2.5 pt-4"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold text-foreground">
                  Fonts
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {selectedTextFamily
                    ? "Applies to selection"
                    : "Adds a heading"}
                </span>
              </div>
              <FontPicker
                activeFamily={selectedTextFamily}
                customFamilies={customFontFamilies}
                onSelect={onSelectFont}
              />
            </div>
          </div>
        ) : null}

        {activeTool === "uploads" ? (
          <div className="space-y-4">
            <ToolShelfHeading title="Uploads" detail="" />
            {frameSelected ? (
              <p
                className="rounded-xl px-2.5 py-2 text-[11px] text-muted-foreground"
                style={{
                  border: "1px solid var(--hairline)",
                  backgroundColor: "var(--inset)",
                }}
              >
                A frame is selected. Images, icons, and stickers go inside it.
              </p>
            ) : null}
            <button
              type="button"
              onClick={onUpload}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-xs font-semibold text-background transition-opacity"
            >
              <IconPhotoPlus className="size-4" />
              Upload files
            </button>

            {uploads && uploads.length > 0 ? (
              <div className="space-y-2">
                {uploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="flex items-center gap-2.5 rounded-xl p-2"
                    style={{
                      border: "1px solid var(--hairline)",
                      backgroundColor: "var(--inset)",
                    }}
                  >
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-foreground/[0.06]">
                      {upload.kind === "video" ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          src={upload.previewUrl}
                          className="size-full object-cover"
                          muted
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={upload.previewUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-foreground">
                        {upload.name}
                      </p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.1]">
                        <div
                          className="h-full rounded-full transition-[width] duration-200"
                          style={{
                            width: `${upload.status === "error" ? 100 : upload.progress}%`,
                            backgroundColor:
                              upload.status === "error"
                                ? "#f87171"
                                : upload.status === "done"
                                  ? "#34d399"
                                  : "var(--studio-accent, #6366f1)",
                          }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {upload.status === "error"
                        ? "Failed"
                        : upload.status === "done"
                          ? "Done"
                          : `${upload.progress}%`}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div
              className="flex min-h-20 flex-col items-center justify-center rounded-xl px-3 py-3 text-center"
              style={{
                backgroundColor: "var(--inset)",
                border: "1px dashed var(--hairline)",
              }}
            >
              <IconPhotoPlus className="mb-2 size-5 text-muted-foreground" />
              <p className="text-xs font-medium">Images or video</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Watch the progress as each file uploads to your media.
              </p>
            </div>

            {showMediaLibrary ? (
              <div
                className="space-y-2.5 pt-4"
                style={{ borderTop: "1px solid var(--hairline)" }}
              >
                <h3 className="text-[11px] font-semibold text-foreground">
                  Your media
                </h3>
                <MediaLibraryPicker
                  onSelect={onPickLibraryImage}
                  disabled={uploadPending}
                />
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Create an account when you want cloud media. Local uploads stay
                available in this browser.
              </p>
            )}
          </div>
        ) : null}

        {activeTool === "layers" ? (
          <div className="space-y-3">
            {layerPages.length > 1 ? (
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-foreground">
                  Layers
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {layerPages.length} visible slides
                </span>
              </div>
            ) : null}
            {layerPages.map((layerPage) => (
              <LayersPanel
                key={layerPage.id}
                page={layerPage}
                heading={layerPages.length > 1 ? layerPage.name : undefined}
                selectedElementIds={selectedElementIds}
                onSelectionChange={onSelectionChange}
                onGroup={onGroupElements}
                onUngroup={onUngroupElements}
                onRenameGroup={onRenameGroup}
                onSetGroupVisible={onSetGroupVisible}
                onSetGroupLocked={onSetGroupLocked}
                onRemoveMany={onRemoveElements}
                onMoveLayers={onMoveLayers}
                onToggleVisible={onToggleElementVisible}
                onToggleLocked={onToggleElementLocked}
                onReorder={onReorderElement}
              />
            ))}
          </div>
        ) : null}

        {activeTool === "elements" ? (
          <ElementBrowser
            recents={recents}
            onUseRecent={onUseRecent}
            onAddShape={onAddShape}
            onAddFrame={onAddFrame}
            onAddText={onAddText}
            shapes={
              <div className="grid grid-cols-3 gap-2">
                {CREATIVE_SHAPES.map((shape) => (
                  <ElementTile
                    key={shape}
                    label={CREATIVE_SHAPE_LABELS[shape]}
                    dragItem={{ kind: "shape", shape }}
                    onClick={() => onAddShape(shape)}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      className="size-10 text-[var(--studio-accent)]"
                      aria-hidden
                    >
                      <path
                        d={shapeSvgPath(shape, 100, 100)}
                        fill="currentColor"
                      />
                    </svg>
                  </ElementTile>
                ))}
              </div>
            }
            frames={
              <div className="grid grid-cols-3 gap-2">
                {FRAME_SHAPES.map((shape) => (
                  <FrameTile
                    key={shape}
                    shape={shape}
                    onClick={() => onAddFrame(shape)}
                  />
                ))}
              </div>
            }
            smart={
              <div className="space-y-2.5">
                <p className="text-[10px] text-muted-foreground">
                  Pagers live on every slide and keep themselves in sync.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["dots", "Dots"],
                      ["stretch", "Stretch"],
                      ["bars", "Bars"],
                      ["numbers", "Numbers"],
                    ] as const
                  ).map(([variant, label]) => (
                    <PagerStyleTile
                      key={variant}
                      variant={variant}
                      label={label}
                      onClick={() => onAddPager(variant)}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {TAG_VARIANT_ORDER.map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => onAddTag(variant)}
                      title={TAG_VARIANTS[variant].hint}
                      className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-colors hover:bg-foreground/[0.05]"
                      style={{
                        backgroundColor: "var(--inset)",
                        border: "1px solid var(--hairline)",
                      }}
                    >
                      <span
                        className="max-w-full truncate px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: "var(--foreground)",
                          color: "var(--background)",
                          borderRadius: variant === "plate" ? 3 : 999,
                        }}
                      >
                        {TAG_VARIANTS[variant].sample}
                      </span>
                      <span className="text-[10px] font-medium text-foreground">
                        {TAG_VARIANTS[variant].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            }
            onInsertAsset={onAddVector}
            onInsertHiclipart={onInsertHiclipart}
            onInsertPhoto={onInsertPhoto}
            onInsertSticker={onInsertSticker}
            onAddVideo={onAddVideo}
          />
        ) : null}

        {activeTool === "draw" ? (
          <div className="space-y-5">
            <ToolShelfHeading title="Draw" detail="" />

            <div className="grid grid-cols-2 gap-1.5">
              {BRUSH_ORDER.map((id) => (
                <BrushTile
                  key={id}
                  brush={id}
                  color={drawing.color}
                  active={!drawing.eraser && drawing.brush === id}
                  onSelect={() => onBrushChange(id)}
                />
              ))}
              <button
                type="button"
                aria-pressed={drawing.eraser}
                onClick={() => onDrawingChange({ eraser: !drawing.eraser })}
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition-colors hover:bg-foreground/[0.05]"
                style={{
                  border: `1px solid ${
                    drawing.eraser ? "var(--studio-accent)" : "var(--hairline)"
                  }`,
                  backgroundColor: drawing.eraser ? "var(--inset)" : undefined,
                }}
              >
                <IconEraser className="size-[18px]" stroke={1.8} />
                Eraser
              </button>
            </div>

            <div
              className="space-y-3 pt-4"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <Field label="Colour">
                <ColorControl
                  value={drawing.color}
                  onChange={(color) => onDrawingChange({ color })}
                />
              </Field>
              <div className="grid grid-cols-6 gap-1.5">
                {INK_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Ink ${swatch}`}
                    aria-pressed={
                      drawing.color.toLowerCase() === swatch.toLowerCase()
                    }
                    onClick={() => onDrawingChange({ color: swatch })}
                    className="h-7 rounded-lg transition-transform hover:scale-105"
                    style={{
                      backgroundColor: swatch,
                      border:
                        drawing.color.toLowerCase() === swatch.toLowerCase()
                          ? "2px solid var(--studio-accent)"
                          : "1px solid var(--hairline)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div
              className="grid grid-cols-2 gap-2 pt-4"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <NumberField
                label="Size"
                value={Math.round(drawing.width)}
                min={BRUSH_PRESETS[drawing.brush].minWidth}
                max={BRUSH_PRESETS[drawing.brush].maxWidth}
                suffix="px"
                onChange={(width) => onDrawingChange({ width })}
              />
              <NumberField
                label="Opacity"
                value={Math.round(drawing.opacity * 100)}
                min={5}
                max={100}
                suffix="%"
                onChange={(value) => onDrawingChange({ opacity: value / 100 })}
              />
              <NumberField
                label="Smoothing"
                value={Math.round(drawing.smoothing * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) =>
                  onDrawingChange({ smoothing: value / 100 })
                }
              />
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {drawing.eraser
                ? "Drag across a sketch to rub out strokes."
                : `${BRUSH_PRESETS[drawing.brush].hint}. Strokes join one sketch until you switch tools or slides.`}
            </p>
          </div>
        ) : null}

        {activeTool === "background" ? (
          <div className="space-y-5">
            <ToolShelfHeading title="Canvas" detail="" />
            <div
              className="space-y-3 pt-4"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <h3 className="text-[11px] font-semibold text-foreground">
                Effect
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["none", "Solid"],
                    ["grid", "Grid"],
                    ["dots", "Dots"],
                    ["flicker", "Flicker"],
                    ["diagonal", "Diagonal"],
                    ["checker", "Checker"],
                    ["rings", "Rings"],
                    ["shape-grid", "Shapes"],
                  ] as const
                ).map(([type, label]) => (
                  <BackgroundEffectTile
                    key={type}
                    type={type}
                    label={label}
                    background={background}
                    active={effect.type === type}
                    onClick={() =>
                      onBackgroundEffectChange(
                        createDefaultBackgroundEffect(type, background, effect),
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <div
              className="space-y-3 pt-4"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <h3 className="text-[11px] font-semibold text-foreground">
                Cutting mat
              </h3>
              <CuttingMatTile
                active={effect.type === "cutting-mat"}
                mat={effect.mat}
                onClick={() =>
                  onBackgroundEffectChange(
                    createDefaultBackgroundEffect(
                      "cutting-mat",
                      background,
                      effect,
                    ),
                  )
                }
              />
            </div>
            <div
              className="space-y-3 pt-4"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <h3 className="text-[11px] font-semibold text-foreground">
                Texture
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["fabric-of-squares", "Fabric"],
                    ["grid-noise", "Noise"],
                    ["inflicted", "Speckle"],
                    ["debut-light", "Debut"],
                    ["groovepaper", "Paper"],
                  ] as const
                ).map(([texture, label]) => (
                  <TextureEffectTile
                    key={texture}
                    texture={texture}
                    label={label}
                    background={background}
                    active={
                      effect.type === "texture" && effect.texture === texture
                    }
                    onClick={() =>
                      onBackgroundEffectChange({
                        ...createDefaultBackgroundEffect(
                          "texture",
                          background,
                          effect,
                        ),
                        texture,
                      })
                    }
                  />
                ))}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Colours and settings for the canvas live in the properties panel.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Canvas properties, shown in the inspector when no element is selected.
 *
 * These used to sit in the left tool shelf next to the pickers, which put
 * "choose an effect" and "configure that effect" in different halves of the
 * screen. The left shelf adds things; the right panel edits the selection —
 * and with nothing selected, the selection is the slide itself.
 */
function BackgroundProperties({
  background,
  effect,
  onBackgroundChange,
  onBackgroundEffectChange,
}: {
  background: string;
  effect: CreativeBackgroundEffect;
  onBackgroundChange(background: string): void;
  onBackgroundEffectChange(effect: CreativeBackgroundEffect): void;
}) {
  return (
    <>
      <Field label="Color">
        <ColorControl value={background} onChange={onBackgroundChange} />
      </Field>
      <div className="grid grid-cols-4 gap-2">
        {[
          "#F2EDE4",
          "#FFFFFF",
          "#1D1B20",
          "#E9E2F4",
          "#DCEFE5",
          "#F9DCC4",
          "#DDE7F6",
          "#F5E0E8",
        ].map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onBackgroundChange(color)}
            className="aspect-square rounded-xl"
            style={{
              backgroundColor: color,
              border:
                normalizeColor(background) === color
                  ? "2px solid var(--studio-accent)"
                  : "1px solid var(--hairline)",
            }}
            aria-label={`Set canvas color to ${color}`}
            aria-pressed={normalizeColor(background) === color}
          />
        ))}
      </div>
      {effect.type === "cutting-mat" ? (
        <CuttingMatControls
          effect={effect}
          onChange={onBackgroundEffectChange}
        />
      ) : null}
      {effect.type !== "none" && effect.type !== "cutting-mat" ? (
        <div
          className="space-y-3 pt-4"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          {effect.type === "texture" ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Scale"
                value={effect.size}
                min={25}
                max={240}
                suffix="%"
                onChange={(size) =>
                  onBackgroundEffectChange({ ...effect, size })
                }
              />
              <NumberField
                label="Opacity"
                value={Math.round(effect.opacity * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(opacity) =>
                  onBackgroundEffectChange({
                    ...effect,
                    opacity: opacity / 100,
                  })
                }
              />
            </div>
          ) : (
            <>
              <Field label="Pattern color">
                <ColorControl
                  value={effect.color}
                  onChange={(color) =>
                    onBackgroundEffectChange({ ...effect, color })
                  }
                />
              </Field>
              {["flicker", "checker", "shape-grid"].includes(effect.type) ? (
                <Field label="Accent color">
                  <ColorControl
                    value={effect.secondaryColor}
                    onChange={(secondaryColor) =>
                      onBackgroundEffectChange({
                        ...effect,
                        secondaryColor,
                      })
                    }
                  />
                </Field>
              ) : null}
              {effect.type === "shape-grid" ? (
                <Field label="Shape">
                  <SelectControl
                    value={effect.shape}
                    onChange={(shape) =>
                      onBackgroundEffectChange({
                        ...effect,
                        shape: shape as CreativeBackgroundEffect["shape"],
                      })
                    }
                    options={[
                      { value: "square", label: "Square" },
                      { value: "circle", label: "Circle" },
                      { value: "hexagon", label: "Hexagon" },
                      { value: "triangle", label: "Triangle" },
                    ]}
                  />
                </Field>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Size"
                  value={effect.size}
                  min={4}
                  max={240}
                  onChange={(size) =>
                    onBackgroundEffectChange({ ...effect, size })
                  }
                />
                <NumberField
                  label="Gap"
                  value={effect.gap}
                  min={0}
                  max={120}
                  onChange={(gap) =>
                    onBackgroundEffectChange({ ...effect, gap })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Opacity"
                  value={Math.round(effect.opacity * 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(opacity) =>
                    onBackgroundEffectChange({
                      ...effect,
                      opacity: opacity / 100,
                    })
                  }
                />
                {["flicker", "checker"].includes(effect.type) ? (
                  <NumberField
                    label="Intensity"
                    value={Math.round(effect.intensity * 100)}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(intensity) =>
                      onBackgroundEffectChange({
                        ...effect,
                        intensity: intensity / 100,
                      })
                    }
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onBackgroundEffectChange({
                        ...effect,
                        seed: Math.floor(Math.random() * 2_147_483_647),
                      })
                    }
                    className="mt-[18px] h-9 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                    style={{ border: "1px solid var(--hairline)" }}
                  >
                    Shuffle
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

/** Live preview of the mat, drawn with the same routine as the canvas. */
function CuttingMatTile({
  active,
  mat,
  onClick,
}: {
  active: boolean;
  mat?: CreativeBackgroundEffect["mat"];
  onClick(): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useMemo(
    () => ({ ...DEFAULT_CUTTING_MAT, ...(mat ?? {}) }),
    [mat],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    // Fewer columns in the swatch so the grid stays readable at thumbnail size.
    drawCuttingMat(context, canvas.width, canvas.height, {
      ...settings,
      columns: 12,
      showLabels: false,
      showRadiusTicks: false,
    });
  }, [settings]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="w-full overflow-hidden rounded-xl transition-colors hover:bg-foreground/[0.04]"
      style={{
        border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={260}
        height={96}
        className="block w-full"
      />
      <span className="block py-1.5 text-[11px] font-medium">
        {active ? "Mat on" : "Use a cutting mat"}
      </span>
    </button>
  );
}

/**
 * Mat settings, grouped the way the reference tool groups them: the surface
 * first, then the guides drawn on it.
 */
function CuttingMatControls({
  effect,
  onChange,
}: {
  effect: CreativeBackgroundEffect;
  onChange(effect: CreativeBackgroundEffect): void;
}) {
  const mat = { ...DEFAULT_CUTTING_MAT, ...(effect.mat ?? {}) };
  const set = (changes: Partial<typeof mat>) =>
    onChange({ ...effect, mat: { ...mat, ...changes } });
  const activePreset = CUTTING_MAT_PRESETS.find(
    (preset) =>
      preset.background === mat.background && preset.line === mat.line,
  );

  return (
    <>
      <InspectorSection title="Mat size">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Unit">
            <SegmentedControl
              value={mat.unit}
              onChange={(unit) => set({ unit: unit as CuttingMatUnit })}
              options={[
                { value: "cm", label: "cm" },
                { value: "in", label: "in" },
              ]}
            />
          </Field>
          <NumberField
            label="Across"
            value={mat.columns}
            min={4}
            max={160}
            onChange={(columns) => set({ columns })}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Rows follow the slide’s height, so the mat always fills it.
        </p>
      </InspectorSection>

      <InspectorSection title="Surface">
        <div className="grid grid-cols-4 gap-1.5">
          {CUTTING_MAT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={activePreset?.id === preset.id}
              onClick={() =>
                set({ background: preset.background, line: preset.line })
              }
              className="flex h-8 items-center justify-center rounded-lg transition-transform hover:scale-105"
              style={{
                backgroundColor: preset.background,
                border: `1px solid ${
                  activePreset?.id === preset.id
                    ? "var(--studio-accent)"
                    : "var(--hairline)"
                }`,
              }}
            >
              <span
                className="h-4 w-0.5 rounded-full"
                style={{ backgroundColor: preset.line }}
              />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Surface">
            <ColorControl
              value={mat.background}
              onChange={(background) => set({ background })}
            />
          </Field>
          <Field label="Guides">
            <ColorControl value={mat.line} onChange={(line) => set({ line })} />
          </Field>
        </div>
      </InspectorSection>

      <InspectorSection title="Guides">
        <EffectToggle
          label="Grid"
          enabled={mat.showGrid}
          onToggle={(showGrid) => set({ showGrid })}
        />
        {mat.showGrid ? (
          <NumberField
            label="Grid opacity"
            value={Math.round(mat.gridOpacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => set({ gridOpacity: value / 100 })}
          />
        ) : null}
        <EffectToggle
          label="Edge ticks"
          enabled={mat.showEdgeTicks}
          onToggle={(showEdgeTicks) => set({ showEdgeTicks })}
        />
        <EffectToggle
          label="Numbers"
          enabled={mat.showLabels}
          onToggle={(showLabels) => set({ showLabels })}
        />
        <EffectToggle
          label="Angle guides"
          enabled={mat.showAngles}
          onToggle={(showAngles) => set({ showAngles })}
        />
        <EffectToggle
          label="Radius arcs"
          enabled={mat.showRadii}
          onToggle={(showRadii) => set({ showRadii })}
        />
        {mat.showRadii ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {mat.radii.map((radius, index) => (
                <CompactNumberInput
                  // Radii are positional and interchangeable, so the index is
                  // the only stable identity available.
                  key={`radius-${index}`}
                  prefix={`R${index + 1}`}
                  label={`Radius ${index + 1}`}
                  value={radius}
                  min={1}
                  max={200}
                  onChange={(value) =>
                    set({
                      radii: mat.radii.map((entry, position) =>
                        position === index ? value : entry,
                      ),
                    })
                  }
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={mat.radii.length >= 6}
                onClick={() =>
                  set({
                    radii: [...mat.radii, (mat.radii.at(-1) ?? 0) + 10],
                  })
                }
                className="h-8 flex-1 rounded-xl text-[11px] font-medium transition-colors hover:bg-foreground/[0.05] disabled:opacity-40"
                style={{ border: "1px solid var(--hairline)" }}
              >
                Add radius
              </button>
              <button
                type="button"
                disabled={mat.radii.length <= 1}
                onClick={() => set({ radii: mat.radii.slice(0, -1) })}
                className="h-8 flex-1 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] disabled:opacity-40"
                style={{ border: "1px solid var(--hairline)" }}
              >
                Remove
              </button>
            </div>
            <EffectToggle
              label="Radius ticks"
              enabled={mat.showRadiusTicks}
              onToggle={(showRadiusTicks) => set({ showRadiusTicks })}
            />
            {mat.showRadiusTicks ? (
              <NumberField
                label="Tick spacing"
                value={mat.tickSpacing}
                min={1}
                max={45}
                suffix="°"
                onChange={(tickSpacing) => set({ tickSpacing })}
              />
            ) : null}
          </>
        ) : null}
      </InspectorSection>
    </>
  );
}

function BackgroundEffectTile({
  type,
  label,
  background,
  active,
  onClick,
}: {
  type: CreativeBackgroundEffect["type"];
  label: string;
  background: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group overflow-hidden rounded-xl text-left"
      style={
        active
          ? {
              border: "1.5px solid transparent",
              backgroundImage:
                "linear-gradient(var(--tray),var(--tray)),var(--grad-brand)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box,border-box",
            }
          : { border: "1px solid var(--hairline)" }
      }
    >
      <span
        className="relative block h-14 overflow-hidden"
        style={{ backgroundColor: background }}
      >
        <BackgroundEffectPreview type={type} />
      </span>
      <span className="block px-2.5 py-2 text-[10px] font-medium text-foreground">
        {label}
      </span>
    </button>
  );
}

function TextureEffectTile({
  texture,
  label,
  background,
  active,
  onClick,
}: {
  texture: CreativeBackgroundEffect["texture"];
  label: string;
  background: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="overflow-hidden rounded-xl text-left"
      style={
        active
          ? {
              border: "1.5px solid transparent",
              backgroundImage:
                "linear-gradient(var(--tray),var(--tray)),var(--grad-brand)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box,border-box",
            }
          : { border: "1px solid var(--hairline)" }
      }
    >
      <span
        className="relative block h-14 overflow-hidden"
        style={{ backgroundColor: background }}
      >
        <BackgroundImageTexture
          variant={texture}
          opacity={0.58}
          className="absolute inset-0"
        />
      </span>
      <span className="block px-2.5 py-2 text-[10px] font-medium text-foreground">
        {label}
      </span>
    </button>
  );
}

function BackgroundEffectPreview({
  type,
}: {
  type: CreativeBackgroundEffect["type"];
}) {
  const color = "color-mix(in srgb, var(--foreground) 32%, transparent)";

  if (type === "none") return null;
  if (type === "dots") return <DotBackground color={color} size={12} />;
  if (type === "flicker") {
    return (
      <span className="absolute inset-0 grid grid-cols-8 gap-1 p-2">
        {Array.from({ length: 32 }, (_, index) => (
          <span
            key={index}
            className="rounded-[1px] bg-foreground"
            style={{ opacity: ((index * 17) % 10) / 22 }}
          />
        ))}
      </span>
    );
  }
  if (type === "shape-grid") {
    return (
      <span className="absolute inset-0 grid grid-cols-6 gap-1.5 p-2">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            className="rounded-full border border-foreground/25"
          />
        ))}
      </span>
    );
  }

  const backgroundImage =
    type === "grid"
      ? `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`
      : type === "diagonal"
        ? `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 10px)`
        : type === "checker"
          ? `conic-gradient(${color} 25%, transparent 0 50%, ${color} 0 75%, transparent 0)`
          : `repeating-radial-gradient(circle at center, transparent 0 7px, ${color} 8px 9px)`;
  const backgroundSize =
    type === "grid"
      ? "14px 14px"
      : type === "checker"
        ? "16px 16px"
        : undefined;

  return (
    <span
      className="absolute inset-0"
      style={{ backgroundImage, backgroundSize }}
    />
  );
}

function PagerStyleTile({
  variant,
  label,
  onClick,
}: {
  variant: CreativePagerProps["variant"];
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...tileDragProps({ kind: "pager", variant })}
      className="group flex h-20 cursor-grab flex-col items-center justify-center gap-3 rounded-xl text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      style={{
        backgroundColor: "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      <PagerPreview variant={variant} />
      {label}
    </button>
  );
}

function PagerPreview({ variant }: { variant: CreativePagerProps["variant"] }) {
  if (variant === "numbers") {
    return (
      <span className="flex items-end gap-2 text-[10px] font-semibold">
        {[1, 2, 3, 4].map((number) => (
          <span
            key={number}
            className={`relative pb-1 ${
              number === 1
                ? "text-[var(--studio-accent)]"
                : "text-muted-foreground"
            }`}
          >
            {number}
            {number === 1 ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--studio-accent)]" />
            ) : null}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map((index) => {
        const active = index === 0;
        return (
          <span
            key={index}
            className="block rounded-full"
            style={{
              width:
                variant === "bars"
                  ? 14
                  : variant === "stretch" && active
                    ? 18
                    : 6,
              height: variant === "bars" ? 4 : 6,
              backgroundColor: active ? "var(--studio-accent)" : "#A9A3AE",
            }}
          />
        );
      })}
    </span>
  );
}

/** What the Draw shelf edits. */
type DrawingControls = {
  brush: CreativeBrush;
  color: string;
  width: number;
  opacity: number;
  smoothing: number;
  eraser: boolean;
};

/** The three tags, named once for the shelf and the inspector. */
const TAG_VARIANTS: Record<
  CreativeTagVariant,
  { label: string; hint: string; sample: string }
> = {
  handle: {
    label: "Handle",
    hint: "Your @ on every slide",
    sample: "@you",
  },
  location: {
    label: "Location",
    hint: "A place pill with a pin",
    sample: "Lagos",
  },
  plate: {
    label: "Nameplate",
    hint: "Hard-edged slab",
    sample: "you",
  },
};

const TAG_VARIANT_ORDER: CreativeTagVariant[] = ["handle", "location", "plate"];

const INK_SWATCHES = [
  "#1F1235",
  "#FFFFFF",
  "var(--studio-accent)",
  "#E1436F",
  "#F0A868",
  "#2F9E75",
];

/** An S-curve to preview a brush on, in the tile's own 90×36 viewBox. */
const BRUSH_PREVIEW_POINTS = [8, 26, 22, 13, 38, 24, 54, 11, 70, 23, 82, 16];

/**
 * A brush swatch drawn with the same geometry code as the canvas, so what the
 * tile shows is what the brush actually lays down.
 */
function BrushTile({
  brush,
  color,
  active,
  onSelect,
}: {
  brush: CreativeBrush;
  color: string;
  active: boolean;
  onSelect(): void;
}) {
  const preset = BRUSH_PRESETS[brush];
  // Scaled down to the tile: the real default would fill the whole swatch.
  const width = Math.max(2, Math.min(13, preset.defaultWidth / 2.4));
  const geometry = strokeGeometry(
    { brush, width, points: BRUSH_PREVIEW_POINTS },
    0.6,
  );

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className="flex flex-col items-center gap-1 overflow-hidden rounded-xl pb-1.5 pt-2 text-[10px] font-medium transition-colors hover:bg-foreground/[0.05]"
      style={{
        border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
        backgroundColor: active ? "var(--inset)" : undefined,
      }}
    >
      <svg viewBox="0 0 90 36" className="h-8 w-full" aria-hidden>
        <path
          d={geometry.path}
          fill={geometry.filled ? color : "none"}
          stroke={geometry.filled ? "none" : color}
          strokeWidth={geometry.filled ? 0 : width}
          strokeLinecap={preset.lineCap}
          strokeLinejoin={preset.lineJoin}
          opacity={preset.defaultOpacity}
        />
      </svg>
      {preset.label}
    </button>
  );
}

function ToolShelfHeading({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {detail ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Drag props for a tool-shelf tile. Dropping lands the element under the
 * pointer; clicking still adds it to the middle of the slide.
 */
function tileDragProps(item: StudioDragItem) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(STUDIO_DRAG_MIME, encodeStudioDragItem(item));
    },
  };
}

/** Tool-shelf tile showing a frame's silhouette. */
function FrameTile({
  shape,
  onClick,
}: {
  shape: CreativeFrameShape;
  onClick(): void;
}) {
  const aperture = frameContentBox(shape, 100, 100);
  return (
    <button
      type="button"
      onClick={onClick}
      {...tileDragProps({ kind: "frame", shape })}
      title={`${FRAME_SHAPE_LABELS[shape]} frame`}
      className="flex cursor-grab flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-foreground/[0.05] active:cursor-grabbing"
      style={{ border: "1px solid var(--hairline)" }}
    >
      <svg
        viewBox="0 0 100 100"
        className="size-8 text-foreground/70"
        aria-hidden
      >
        <path
          d={frameSvgPath(shape, 100, 100, 18)}
          fill="currentColor"
          opacity={aperture ? 0.3 : 1}
        />
        {aperture ? (
          <rect
            x={aperture.x}
            y={aperture.y}
            width={aperture.width}
            height={aperture.height}
            fill="currentColor"
          />
        ) : null}
      </svg>
      <span className="text-[9px] text-muted-foreground">
        {FRAME_SHAPE_LABELS[shape]}
      </span>
    </button>
  );
}

function ElementTile({
  children,
  label,
  dragItem,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  dragItem?: StudioDragItem;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(dragItem ? tileDragProps(dragItem) : {})}
      className="flex aspect-square cursor-grab flex-col items-center justify-center gap-3 rounded-xl text-[11px] font-medium transition-colors hover:bg-foreground/[0.04] active:cursor-grabbing"
      style={{
        backgroundColor: "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      {children}
      {label}
    </button>
  );
}

function PageInspector({
  page,
  canvas,
  onChange,
  onResizeCanvas,
}: {
  page: CreativePage;
  canvas: CreativeDocument["canvas"];
  onChange(changes: {
    name?: string;
    background?: string;
    backgroundEffect?: CreativeBackgroundEffect;
  }): void;
  onResizeCanvas(preset: CreativePreset): void;
}) {
  const activePreset = matchCreativePreset(canvas);
  return (
    <div className="space-y-4">
      <InspectorHeading title="Slide" detail="Nothing selected" />
      <InspectorSection title="Page">
        <Field label="Name">
          <input
            value={page.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={inputClass}
          />
        </Field>
      </InspectorSection>
      <InspectorSection title="Canvas size">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CREATIVE_PRESETS) as CreativePreset[]).map((preset) => {
            const active = preset === activePreset;
            const { label, detail } = CREATIVE_PRESET_LABELS[preset];
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => onResizeCanvas(preset)}
                className="rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.04]"
                style={{
                  border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
                  backgroundColor: active ? "var(--inset)" : undefined,
                }}
              >
                <span className="block text-[11px] font-semibold">{label}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {detail}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Changing the size rescales every slide’s contents to fit.
        </p>
      </InspectorSection>
      <BackgroundProperties
        background={page.background}
        effect={
          page.backgroundEffect ??
          createDefaultBackgroundEffect("none", page.background)
        }
        onBackgroundChange={(background) => onChange({ background })}
        onBackgroundEffectChange={(backgroundEffect) =>
          onChange({ backgroundEffect })
        }
      />
    </div>
  );
}

const DEFAULT_IMAGE_SHADOW: NonNullable<
  Extract<CreativeElement, { type: "image" }>["shadow"]
> = {
  enabled: true,
  color: "#00000066",
  blur: 32,
  offsetX: 0,
  offsetY: 16,
};

/**
 * Photo editing: one-tap looks, then the individual grades behind them, plus
 * the object-level treatments (corners, flip, shadow).
 */
function ImageAdjustSections({
  element,
  onChange,
}: {
  element: Extract<CreativeElement, { type: "image" }>;
  onChange(changes: Record<string, unknown>): void;
}) {
  const { adjustments } = element;
  const activePreset = matchImageFilterPreset(adjustments);
  const shadow = element.shadow ?? DEFAULT_IMAGE_SHADOW;

  const setAdjustment = (key: keyof typeof adjustments, value: number) =>
    onChange({ adjustments: { ...adjustments, [key]: value } });

  return (
    <>
      <InspectorSection title="Filters">
        <div className="grid grid-cols-3 gap-1.5">
          {IMAGE_FILTER_PRESETS.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ adjustments: preset.adjustments })}
                className="overflow-hidden rounded-lg text-[10px] font-medium transition-colors hover:bg-foreground/[0.05]"
                style={{
                  border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
                  backgroundColor: active ? "var(--inset)" : undefined,
                }}
              >
                {/* The swatch is graded with the same maths as the canvas. */}
                <span
                  className="block h-9 w-full"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg,#F0A868 0%,#7B5EA7 55%,#2E4374 100%)",
                    filter:
                      cssFilterString(preset.adjustments) === "none"
                        ? undefined
                        : cssFilterString(preset.adjustments),
                  }}
                />
                <span className="block py-1">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorSection title="Adjust">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Brightness"
            value={Math.round(adjustments.brightness * 100)}
            min={0}
            max={200}
            suffix="%"
            onChange={(value) => setAdjustment("brightness", value / 100)}
          />
          <NumberField
            label="Contrast"
            value={Math.round(adjustments.contrast * 100)}
            min={0}
            max={200}
            suffix="%"
            onChange={(value) => setAdjustment("contrast", value / 100)}
          />
          <NumberField
            label="Saturation"
            value={Math.round(adjustments.saturation * 100)}
            min={0}
            max={200}
            suffix="%"
            onChange={(value) => setAdjustment("saturation", value / 100)}
          />
          <NumberField
            label="Warmth"
            value={Math.round(adjustments.warmth * 100)}
            min={-100}
            max={100}
            onChange={(value) => setAdjustment("warmth", value / 100)}
          />
          <NumberField
            label="Blur"
            value={adjustments.blur}
            min={0}
            max={40}
            step={0.5}
            onChange={(value) => setAdjustment("blur", value)}
          />
          <NumberField
            label="Vignette"
            value={Math.round(adjustments.vignette * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => setAdjustment("vignette", value / 100)}
          />
        </div>
        {isNeutralAdjustments(adjustments) ? null : (
          <button
            type="button"
            onClick={() => onChange({ adjustments: NEUTRAL_ADJUSTMENTS })}
            className="h-8 w-full rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            Reset adjustments
          </button>
        )}
      </InspectorSection>

      <InspectorSection title="Shape & shadow">
        <NumberField
          label="Corner radius"
          value={element.radius}
          min={0}
          max={2048}
          onChange={(radius) => onChange({ radius })}
        />
        <Field label="Flip">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={element.flipX}
              onClick={() => onChange({ flipX: !element.flipX })}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors hover:bg-foreground/[0.05]"
              style={{
                border: `1px solid ${element.flipX ? "var(--studio-accent)" : "var(--hairline)"}`,
              }}
            >
              <IconFlipHorizontal className="size-4" />
              Horizontal
            </button>
            <button
              type="button"
              aria-pressed={element.flipY}
              onClick={() => onChange({ flipY: !element.flipY })}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors hover:bg-foreground/[0.05]"
              style={{
                border: `1px solid ${element.flipY ? "var(--studio-accent)" : "var(--hairline)"}`,
              }}
            >
              <IconFlipVertical className="size-4" />
              Vertical
            </button>
          </div>
        </Field>
        <EffectToggle
          label="Drop shadow"
          enabled={element.shadow?.enabled ?? false}
          onToggle={(enabled) => onChange({ shadow: { ...shadow, enabled } })}
        />
        {element.shadow?.enabled ? (
          <>
            <Field label="Shadow color">
              <ColorControl
                value={shadow.color}
                onChange={(color) => onChange({ shadow: { ...shadow, color } })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="Blur"
                value={shadow.blur}
                min={0}
                max={120}
                onChange={(blur) => onChange({ shadow: { ...shadow, blur } })}
              />
              <NumberField
                label="X"
                value={shadow.offsetX}
                min={-200}
                max={200}
                onChange={(offsetX) =>
                  onChange({ shadow: { ...shadow, offsetX } })
                }
              />
              <NumberField
                label="Y"
                value={shadow.offsetY}
                min={-200}
                max={200}
                onChange={(offsetY) =>
                  onChange({ shadow: { ...shadow, offsetY } })
                }
              />
            </div>
          </>
        ) : null}
      </InspectorSection>
    </>
  );
}

type CutoutControls = {
  /** Progress for this element, or null when it isn't the one running. */
  state: BackgroundRemovalState | null;
  /** Another element is mid-cutout; only one can run at a time. */
  busyElsewhere: boolean;
  /** First run on this device still has to fetch the models. */
  needsDownload: boolean;
  confirming: boolean;
  onStart(): void;
  onConfirm(): void;
  onDismiss(): void;
  onCancel(): void;
};

/**
 * The cutout control, shared by images and filled frames.
 *
 * The models are a one-time ~134 MB download, so the first run asks first
 * rather than quietly starting a large transfer — which on a phone could be
 * someone's cellular allowance.
 */
function CutoutSection({ cutout }: { cutout: CutoutControls }) {
  const { state, busyElsewhere, needsDownload, confirming } = cutout;

  return (
    <InspectorSection title="Cutout">
      {confirming ? (
        <div
          className="space-y-2 rounded-xl p-3"
          style={{
            border: "1px solid var(--hairline)",
            backgroundColor: "var(--inset)",
          }}
        >
          <p className="text-[11px] font-medium text-foreground">
            Download {SNAP_DOWNLOAD_LABEL} of models?
          </p>
          <p className="text-[11px] text-muted-foreground">
            Background removal runs privately on this device. The models are
            downloaded once and reused after that.
            {isConnectionCostly()
              ? " You appear to be on a slow or metered connection."
              : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cutout.onDismiss}
              className="h-9 flex-1 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              style={{ border: "1px solid var(--hairline)" }}
            >
              Not now
            </button>
            <button
              type="button"
              onClick={cutout.onConfirm}
              className="h-9 flex-1 rounded-xl bg-foreground text-[11px] font-semibold text-background"
            >
              Download
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={cutout.onStart}
          disabled={state !== null || busyElsewhere}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-xs font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state ? (
            <span className="size-3.5 animate-spin rounded-full border border-current border-r-transparent" />
          ) : (
            <IconWand className="size-4" />
          )}
          {state
            ? backgroundRemovalLabel(state)
            : busyElsewhere
              ? "Finishing another cutout…"
              : "Remove background"}
        </button>
      )}

      {state ? (
        <>
          <div
            className="h-1 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--inset)" }}
          >
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{
                width: `${Math.max(4, Math.round(state.progress * 100))}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={cutout.onCancel}
            className="h-8 w-full rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            Cancel
          </button>
        </>
      ) : needsDownload && !busyElsewhere ? (
        <p className="text-[10px] text-muted-foreground">
          First run downloads {SNAP_DOWNLOAD_LABEL} of models to this device.
        </p>
      ) : null}
    </InspectorSection>
  );
}

/**
 * Document-level actions for the mobile dock's "More" sheet — the things the
 * desktop header carries, which would crowd a phone's top bar.
 */
function MobileDesignMenu({
  title,
  pageCount,
  activePageIndex,
  exporting,
  onRename,
  onDuplicatePage,
  onRemovePage,
  onMovePage,
  onTogglePageHidden,
  pageHidden = false,
  onSaveToMedia,
  onDownloadAll,
  onOpenHistory,
  assistantOpen,
  onToggleAssistant,
  onChooseSoundtrack,
  soundtrackSelected = false,
  onExportVideo,
  videoProgress = null,
}: {
  title: string;
  pageCount: number;
  activePageIndex: number;
  exporting: "download" | "media" | "compose" | null;
  onRename(title: string): void;
  onDuplicatePage(): void;
  onRemovePage(): void;
  onMovePage(index: number): void;
  onTogglePageHidden(): void;
  pageHidden?: boolean;
  onSaveToMedia?(): void;
  onDownloadAll(): void;
  /** Absent for guest/local drafts (version history is server-backed). */
  onOpenHistory?(): void;
  /** The dock has no room for it, so the assistant is toggled from here. */
  assistantOpen: boolean;
  onToggleAssistant?(): void;
  onChooseSoundtrack?(): void;
  soundtrackSelected?: boolean;
  onExportVideo?(): void;
  videoProgress?: number | null;
}) {
  const busy = exporting !== null;
  return (
    <div className="space-y-4">
      <Field label="Design name">
        <input
          key={title}
          defaultValue={title}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next && next !== title) onRename(next);
          }}
          className={inputClass}
        />
      </Field>

      <InspectorSection title="This slide">
        <div className="grid grid-cols-2 gap-2">
          {onToggleAssistant ? (
            <MenuAction
              label={assistantOpen ? "Hide assistant" : "Studio assistant"}
              onClick={onToggleAssistant}
            >
              <IconSparkles className="size-4" />
            </MenuAction>
          ) : null}
          <MenuAction
            label="Move earlier"
            disabled={activePageIndex === 0}
            onClick={() => onMovePage(activePageIndex - 1)}
          >
            <IconArrowLeft className="size-4" />
          </MenuAction>
          <MenuAction
            label="Move later"
            disabled={activePageIndex >= pageCount - 1}
            onClick={() => onMovePage(activePageIndex + 1)}
          >
            <IconArrowRight className="size-4" />
          </MenuAction>
          <MenuAction label="Duplicate" onClick={onDuplicatePage}>
            <IconCopy className="size-4" />
          </MenuAction>
          <MenuAction
            label={pageHidden ? "Show in exports" : "Hide from exports"}
            onClick={onTogglePageHidden}
          >
            {pageHidden ? (
              <IconEye className="size-4" />
            ) : (
              <IconEyeOff className="size-4" />
            )}
          </MenuAction>
          <MenuAction
            label="Delete"
            disabled={pageCount === 1}
            onClick={onRemovePage}
          >
            <IconTrash className="size-4" />
          </MenuAction>
        </div>
      </InspectorSection>

      {onOpenHistory ? (
        <InspectorSection title="History">
          <MenuAction label="Version history" onClick={onOpenHistory}>
            <IconHistory className="size-4" />
          </MenuAction>
        </InspectorSection>
      ) : null}

      <InspectorSection title="Export">
        {onChooseSoundtrack ? (
          <MenuAction
            label={soundtrackSelected ? "Change soundtrack" : "Add soundtrack"}
            onClick={onChooseSoundtrack}
          >
            <IconMusic className="size-4" />
          </MenuAction>
        ) : null}
        {onExportVideo ? (
          <MenuAction
            label={
              videoProgress !== null
                ? `Encoding video… ${Math.round(videoProgress * 100)}%`
                : "Export video (MP4)"
            }
            disabled={videoProgress !== null}
            onClick={onExportVideo}
          >
            <IconMovie className="size-4" />
          </MenuAction>
        ) : null}
        {onSaveToMedia ? (
          <MenuAction
            label={exporting === "media" ? "Saving…" : "Save all to Media"}
            disabled={busy}
            onClick={onSaveToMedia}
          >
            <IconFileUpload className="size-4" />
          </MenuAction>
        ) : null}
        <MenuAction
          label={exporting === "download" ? "Exporting…" : "Download all"}
          disabled={busy}
          onClick={onDownloadAll}
        >
          <IconDownload className="size-4" />
        </MenuAction>
      </InspectorSection>
    </div>
  );
}

function MenuAction({
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
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05] disabled:pointer-events-none disabled:opacity-40"
      style={{ border: "1px solid var(--hairline)" }}
    >
      {children}
      {label}
    </button>
  );
}

/**
 * Frame properties: which silhouette, and how the image sits inside it.
 * Pan is normalised, so the controls stay meaningful at any frame size.
 */
function FrameInspectorSections({
  element,
  uploadPending,
  onChange,
  onReplaceImage,
}: {
  element: CreativeFrameElement;
  uploadPending: boolean;
  onChange(changes: Record<string, unknown>): void;
  onReplaceImage(): void;
}) {
  const filled = Boolean(element.asset);

  return (
    <>
      <InspectorSection title="Frame">
        <div className="grid grid-cols-5 gap-1.5">
          {FRAME_SHAPES.map((shape) => {
            const active = shape === element.shape;
            return (
              <button
                key={shape}
                type="button"
                aria-pressed={active}
                aria-label={FRAME_SHAPE_LABELS[shape]}
                title={FRAME_SHAPE_LABELS[shape]}
                onClick={() => onChange({ shape })}
                className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-foreground/[0.05]"
                style={{
                  border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
                  backgroundColor: active ? "var(--inset)" : undefined,
                }}
              >
                <svg
                  viewBox="0 0 100 100"
                  className="size-5 text-foreground/75"
                  aria-hidden
                >
                  <path
                    d={frameSvgPath(shape, 100, 100, 18)}
                    fill="currentColor"
                  />
                </svg>
              </button>
            );
          })}
        </div>

        {element.shape === "rounded" ? (
          <NumberField
            label="Corner radius"
            value={element.radius}
            min={0}
            max={512}
            onChange={(radius) => onChange({ radius })}
          />
        ) : null}

        <button
          type="button"
          onClick={onReplaceImage}
          disabled={uploadPending}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <IconPhotoPlus className="size-4" />
          {uploadPending
            ? "Uploading…"
            : filled
              ? "Replace image"
              : "Add an image"}
        </button>
        {filled ? (
          <button
            type="button"
            onClick={() => onChange({ asset: null })}
            className="h-8 w-full rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            Empty the frame
          </button>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Drag an image, icon, logo, or sticker onto the frame. You can also
            pick one while the frame is selected.
          </p>
        )}
      </InspectorSection>

      {filled ? (
        <InspectorSection title="Crop">
          <Field label="Fit">
            <SegmentedControl
              value={element.fit}
              onChange={(fit) => onChange({ fit })}
              options={[
                { value: "cover", label: "Fill" },
                { value: "contain", label: "Fit" },
              ]}
            />
          </Field>
          <NumberField
            label="Zoom"
            value={Math.round(element.zoom * 100)}
            min={10}
            max={600}
            suffix="%"
            onChange={(zoom) => onChange({ zoom: zoom / 100 })}
          />
          <Field label="Position">
            <div className="grid grid-cols-2 gap-2">
              <CompactNumberInput
                prefix="X"
                label="Horizontal position"
                value={Math.round(element.offsetX * 100)}
                min={-100}
                max={100}
                onChange={(offsetX) => onChange({ offsetX: offsetX / 100 })}
              />
              <CompactNumberInput
                prefix="Y"
                label="Vertical position"
                value={Math.round(element.offsetY * 100)}
                min={-100}
                max={100}
                onChange={(offsetY) => onChange({ offsetY: offsetY / 100 })}
              />
            </div>
          </Field>
          <p className="text-[10px] text-muted-foreground">
            Position only moves the parts of the image that overflow the frame.
          </p>
        </InspectorSection>
      ) : null}

      <InspectorSection title="Border">
        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
          <ColorControl
            value={element.stroke}
            onChange={(stroke) => onChange({ stroke })}
          />
          <CompactNumberInput
            prefix="W"
            label="Border width"
            value={element.strokeWidth}
            min={0}
            max={64}
            onChange={(strokeWidth) => onChange({ strokeWidth })}
          />
        </div>
        {filled ? null : (
          <Field label="Placeholder color">
            <ColorControl
              value={element.fill}
              onChange={(fill) => onChange({ fill })}
            />
          </Field>
        )}
      </InspectorSection>
    </>
  );
}

const DEFAULT_TEXT_SHADOW: NonNullable<CreativeTextElement["shadow"]> = {
  enabled: true,
  color: "#00000059",
  blur: 18,
  offsetX: 0,
  offsetY: 8,
};
const DEFAULT_TEXT_OUTLINE: NonNullable<CreativeTextElement["outline"]> = {
  enabled: true,
  color: "#1D1B20",
  width: 3,
};
const DEFAULT_TEXT_HIGHLIGHT: NonNullable<CreativeTextElement["highlight"]> = {
  enabled: true,
  color: "#F5D90A",
};

/**
 * Highlight / outline / shadow for text. Each effect keeps its settings when
 * switched off (`enabled: false`) so toggling it back on doesn't lose the
 * colours the user picked.
 */
/**
 * Properties for a finished sketch. Every control restyles all of its strokes:
 * a sketch is one object to the person looking at it, and per-stroke editing
 * would mean selecting ink inside a layer, which the canvas has no affordance
 * for. Values shown are the first stroke's, with a note when they disagree.
 */
function DrawingInspectorSections({
  element,
  onChange,
}: {
  element: CreativeDrawingElement;
  onChange(changes: Record<string, unknown>): void;
}) {
  const first = element.strokes[0];
  const natural = drawingStrokeBounds(element.strokes);
  // Stored widths are local units; the control speaks document pixels.
  const uniform =
    (element.width / natural.width + element.height / natural.height) / 2 || 1;
  const mixed = element.strokes.some(
    (stroke) => stroke.brush !== first?.brush || stroke.color !== first?.color,
  );

  return (
    <>
      <InspectorSection title="Brush">
        <div className="grid grid-cols-2 gap-1.5">
          {BRUSH_ORDER.map((id) => (
            <BrushTile
              key={id}
              brush={id}
              color={first?.color ?? "#1F1235"}
              active={!mixed && first?.brush === id}
              onSelect={() => onChange({ brush: id })}
            />
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {element.strokes.length}{" "}
          {element.strokes.length === 1 ? "stroke" : "strokes"}
          {mixed ? ", mixed" : ""}. These controls restyle the whole sketch.
        </p>
      </InspectorSection>

      <InspectorSection title="Ink">
        <ColorControl
          value={first?.color ?? "#1F1235"}
          onChange={(color) => onChange({ color })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Size"
            value={Math.max(1, Math.round((first?.width ?? 8) * uniform))}
            min={1}
            max={400}
            suffix="px"
            onChange={(width) => onChange({ width })}
          />
          <NumberField
            label="Opacity"
            value={Math.round((first?.opacity ?? 1) * 100)}
            min={5}
            max={100}
            suffix="%"
            onChange={(value) => onChange({ opacity: value / 100 })}
          />
          <NumberField
            label="Smoothing"
            value={Math.round(element.smoothing * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => onChange({ smoothing: value / 100 })}
          />
        </div>
      </InspectorSection>
    </>
  );
}

/**
 * Name tag properties. Every change here lands on the tag on every slide, since
 * the copies are one element as far as anyone using it is concerned.
 *
 * Text and font changes also re-fit the box, so the pill keeps hugging the
 * handle instead of leaving a gap or clipping it.
 */
function TagInspectorSections({
  element,
  onChange,
  onResize,
}: {
  element: CreativeTagElement;
  onChange(changes: Record<string, unknown>): void;
  onResize(changes: Record<string, string | number | boolean>): void;
}) {
  const refit = (next: {
    text?: string;
    fontSize?: number;
    letterSpacing?: number;
  }) => {
    const box = estimateTagBox({
      text: next.text ?? element.text,
      fontSize: next.fontSize ?? element.fontSize,
      letterSpacing: next.letterSpacing ?? element.letterSpacing,
      style: element.style,
    });
    onResize(box);
  };

  return (
    <>
      <InspectorSection title="Tag">
        <div className="grid grid-cols-3 gap-1.5">
          {TAG_VARIANT_ORDER.map((variant) => {
            const active = element.variant === variant;
            return (
              <button
                key={variant}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ variant })}
                className="rounded-lg py-1.5 text-[10px] font-medium transition-colors hover:bg-foreground/[0.05]"
                style={{
                  border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
                  backgroundColor: active ? "var(--inset)" : undefined,
                  color: active
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                }}
              >
                {TAG_VARIANTS[variant].label}
              </button>
            );
          })}
        </div>
        {element.variant === "handle" ? (
          <button
            type="button"
            aria-pressed={element.badge}
            onClick={() => onChange({ badge: !element.badge })}
            className="h-9 w-full rounded-xl text-xs font-medium transition-colors hover:bg-foreground/[0.05]"
            style={{
              border: `1px solid ${element.badge ? "var(--studio-accent)" : "var(--hairline)"}`,
              color: element.badge
                ? "var(--foreground)"
                : "var(--muted-foreground)",
            }}
          >
            {element.badge ? "Verified tick on" : "Add verified tick"}
          </button>
        ) : null}
        <Field label="Text">
          <input
            value={element.text}
            onChange={(event) => {
              const text = event.target.value;
              if (!text.trim()) return;
              onChange({ text });
              refit({ text });
            }}
            className={inputClass}
          />
        </Field>
        <FontPicker
          activeFamily={element.fontFamily}
          onSelect={(fontFamily) => onChange({ fontFamily })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Size"
            value={Math.round(element.fontSize)}
            min={8}
            max={256}
            suffix="px"
            onChange={(fontSize) => {
              onChange({ fontSize });
              refit({ fontSize });
            }}
          />
          <NumberField
            label="Tracking"
            value={Math.round(element.letterSpacing)}
            min={-40}
            max={200}
            onChange={(letterSpacing) => {
              onChange({ letterSpacing });
              refit({ letterSpacing });
            }}
          />
        </div>
        <SegmentedControl
          value={element.fontWeight}
          options={[
            { value: "400", label: "Regular" },
            { value: "600", label: "Semi" },
            { value: "800", label: "Bold" },
          ]}
          onChange={(fontWeight) => onChange({ fontWeight })}
        />
      </InspectorSection>

      <InspectorSection title="Colour">
        <Field label="Text">
          <ColorControl
            value={element.fill}
            onChange={(fill) => onChange({ fill })}
          />
        </Field>
        <Field label="Pill">
          <ColorControl
            value={element.style.background ?? "#1F1235"}
            onChange={(background) => onChange({ style: { background } })}
          />
        </Field>
        <button
          type="button"
          onClick={() =>
            onChange({
              // Explicit null removes the pill; absent would mean "unchanged".
              style: {
                background: element.style.background ? null : "#1F1235",
              },
            })
          }
          className="h-9 w-full rounded-xl text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          style={{ border: "1px solid var(--hairline)" }}
        >
          {element.style.background ? "Remove pill" : "Add pill"}
        </button>
      </InspectorSection>
    </>
  );
}

function TextEffectsSection({
  element,
  onChange,
}: {
  element: CreativeTextElement;
  onChange(changes: Record<string, unknown>): void;
}) {
  const highlight = element.highlight ?? DEFAULT_TEXT_HIGHLIGHT;
  const outline = element.outline ?? DEFAULT_TEXT_OUTLINE;
  const shadow = element.shadow ?? DEFAULT_TEXT_SHADOW;

  return (
    <InspectorSection title="Text effects">
      <EffectToggle
        label="Highlight"
        enabled={element.highlight?.enabled ?? false}
        onToggle={(enabled) =>
          onChange({ highlight: { ...highlight, enabled } })
        }
      />
      {element.highlight?.enabled ? (
        <Field label="Highlight color">
          <ColorControl
            value={highlight.color}
            onChange={(color) =>
              onChange({ highlight: { ...highlight, color } })
            }
          />
        </Field>
      ) : null}

      <EffectToggle
        label="Outline"
        enabled={element.outline?.enabled ?? false}
        onToggle={(enabled) => onChange({ outline: { ...outline, enabled } })}
      />
      {element.outline?.enabled ? (
        <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-2">
          <Field label="Outline color">
            <ColorControl
              value={outline.color}
              onChange={(color) => onChange({ outline: { ...outline, color } })}
            />
          </Field>
          <NumberField
            label="Width"
            value={outline.width}
            min={0}
            max={40}
            step={0.5}
            onChange={(width) => onChange({ outline: { ...outline, width } })}
          />
        </div>
      ) : null}

      <EffectToggle
        label="Shadow"
        enabled={element.shadow?.enabled ?? false}
        onToggle={(enabled) => onChange({ shadow: { ...shadow, enabled } })}
      />
      {element.shadow?.enabled ? (
        <>
          <Field label="Shadow color">
            <ColorControl
              value={shadow.color}
              onChange={(color) => onChange({ shadow: { ...shadow, color } })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Blur"
              value={shadow.blur}
              min={0}
              max={120}
              onChange={(blur) => onChange({ shadow: { ...shadow, blur } })}
            />
            <NumberField
              label="X"
              value={shadow.offsetX}
              min={-200}
              max={200}
              onChange={(offsetX) =>
                onChange({ shadow: { ...shadow, offsetX } })
              }
            />
            <NumberField
              label="Y"
              value={shadow.offsetY}
              min={-200}
              max={200}
              onChange={(offsetY) =>
                onChange({ shadow: { ...shadow, offsetY } })
              }
            />
          </div>
        </>
      ) : null}
    </InspectorSection>
  );
}

/**
 * An effect choice, previewed on a gradient swatch rather than described. The
 * dither tile borrows the existing CSS dither frame; the pixelate tile draws a
 * coarse grid of flat cells, which is what the effect does.
 */
function EffectTile({
  label,
  active,
  gradient,
  dithered = false,
  glyphs = false,
  cells,
  onClick,
}: {
  label: string;
  active: boolean;
  gradient: string;
  dithered?: boolean;
  /** Draw the swatch as characters, for the ASCII tile. */
  glyphs?: boolean;
  /** Block size to suggest in the preview, for the pixelate tile. */
  cells?: number;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="overflow-hidden rounded-xl text-[10px] font-semibold transition-colors hover:bg-foreground/[0.05]"
      style={{
        border: `1px solid ${active ? "var(--studio-accent)" : "var(--hairline)"}`,
        backgroundColor: active ? "var(--inset)" : undefined,
      }}
    >
      {glyphs ? (
        <span
          className="flex h-12 w-full items-center justify-center overflow-hidden font-mono text-[9px] leading-[1.15] tracking-tighter"
          style={{ backgroundImage: gradient }}
          aria-hidden
        >
          {"@%#*+=-:.\n=+*#%@#*+=-\n:.-=+*#%@"}
        </span>
      ) : dithered ? (
        <DitherImageFrame size="sm" rounded={false} className="h-12 w-full">
          <span
            className="absolute inset-0"
            style={{ backgroundImage: gradient }}
          />
        </DitherImageFrame>
      ) : (
        <span
          className="relative block h-12 w-full"
          style={{ backgroundImage: gradient }}
        >
          {/* A hard cell grid over the swatch: the same read as the effect. */}
          <span
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in srgb, black 12%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, black 12%, transparent) 1px, transparent 1px)",
              backgroundSize: `${Math.max(6, Math.min(16, (cells ?? 16) / 2))}px ${Math.max(6, Math.min(16, (cells ?? 16) / 2))}px`,
            }}
          />
        </span>
      )}
      <span className="block py-1.5 text-foreground">{label}</span>
    </button>
  );
}

function EffectToggle({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle(enabled: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[11px] font-medium transition-colors hover:bg-foreground/[0.04]"
      style={{ border: "1px solid var(--hairline)" }}
    >
      {label}
      <span
        className="flex h-4 w-7 items-center rounded-full p-0.5 transition-colors"
        style={{
          backgroundColor: enabled ? "var(--studio-accent)" : "var(--inset)",
          border: "1px solid var(--hairline)",
        }}
      >
        <span
          className="size-3 rounded-full bg-white transition-transform"
          style={{ transform: enabled ? "translateX(12px)" : "none" }}
        />
      </span>
    </button>
  );
}

const ALIGN_ACTIONS: Array<{
  edge: AlignEdge;
  label: string;
  icon: typeof IconAlignBoxLeftMiddle;
}> = [
  { edge: "left", label: "Align left", icon: IconAlignBoxLeftMiddle },
  {
    edge: "center-x",
    label: "Centre horizontally",
    icon: IconAlignBoxCenterMiddle,
  },
  { edge: "right", label: "Align right", icon: IconAlignBoxRightMiddle },
  { edge: "top", label: "Align top", icon: IconAlignBoxTopCenter },
  {
    edge: "center-y",
    label: "Centre vertically",
    icon: IconAlignBoxCenterMiddle,
  },
  { edge: "bottom", label: "Align bottom", icon: IconAlignBoxBottomCenter },
];

/** Align the selected element against the canvas frame. */
function AlignControls({ onAlign }: { onAlign(edge: AlignEdge): void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ALIGN_ACTIONS.map(({ edge, label, icon: Icon }) => (
        <button
          key={`${edge}:${label}`}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onAlign(edge)}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <Icon
            className={`size-4 ${edge === "center-y" ? "rotate-90" : ""}`}
            stroke={1.8}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A minimal shared panel for a selection of MIXED element types — only the
 * properties they all have (opacity, align, duplicate, delete). Same-type
 * selections get the full ElementInspector instead.
 */
function MixedSelectionInspector({
  count,
  opacity,
  onOpacity,
  onAlign,
  onDuplicate,
  onRemove,
}: {
  count: number;
  opacity: number;
  onOpacity(value: number): void;
  onAlign(edge: AlignEdge): void;
  onDuplicate(): void;
  onRemove(): void;
}) {
  return (
    <div className="space-y-4">
      <InspectorHeading
        title={`${count} elements selected`}
        detail="Mixed types — shared basics"
      />
      <InspectorSection title="Transform">
        <NumberField
          label="Opacity"
          value={Math.round(opacity * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(value) => onOpacity(value / 100)}
        />
        <Field label="Align to canvas">
          <AlignControls onAlign={onAlign} />
        </Field>
      </InspectorSection>
      <button
        type="button"
        onClick={onDuplicate}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05]"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <IconCopy className="size-4" />
        {`Duplicate ${count}`}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        style={{
          border: "1px solid color-mix(in srgb, #f87171 22%, transparent)",
        }}
      >
        <IconTrash className="size-4" />
        {`Remove ${count} elements`}
      </button>
    </div>
  );
}

function ElementInspector({
  element,
  fonts,
  fontImporting,
  cutout,
  uploadPending,
  multiCount,
  onImportFont,
  onReplaceFrameImage,
  onReplaceImage,
  onBaseChange,
  onTypedChange,
  onAlign,
  onDuplicate,
  onRemove,
}: {
  element: CreativeElement;
  fonts: CreativeFont[];
  fontImporting: boolean;
  cutout: CutoutControls;
  uploadPending: boolean;
  /** When >1, this is a shared panel over N same-type elements; edits fan out. */
  multiCount?: number;
  onImportFont(): void;
  onReplaceFrameImage(): void;
  onReplaceImage(): void;
  onBaseChange(changes: Record<string, string | number | boolean>): void;
  onTypedChange(changes: Record<string, unknown>): void;
  onAlign(edge: AlignEdge): void;
  onDuplicate(): void;
  onRemove(): void;
}) {
  const isMulti = (multiCount ?? 1) > 1;
  const typePlural = (type: CreativeElement["type"]) =>
    ({
      text: "text layers",
      image: "images",
      frame: "frames",
      shape: "shapes",
      vector: "graphics",
      drawing: "drawings",
      tag: "tags",
      widget: "pagers",
      video: "videos",
    })[type] ?? `${type}s`;
  const imageEffect = element.type === "image" ? element.effect : undefined;
  const dither =
    imageEffect?.type === "dither" ? imageEffect : DEFAULT_DITHER_EFFECT;
  const pixelate =
    imageEffect?.type === "pixelate" ? imageEffect : DEFAULT_PIXELATE_EFFECT;
  const ascii =
    imageEffect?.type === "ascii" ? imageEffect : DEFAULT_ASCII_EFFECT;
  /** Which effect is actually on, if any — null when the pixels are untouched. */
  const activeEffect = imageEffect?.enabled ? imageEffect.type : null;
  const edgeEffect =
    element.type === "image"
      ? (element.edgeEffect ?? {
          ...DEFAULT_IMAGE_EDGE_EFFECT,
          seed: seedFromString(element.id),
        })
      : DEFAULT_IMAGE_EDGE_EFFECT;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <InspectorHeading
            title={
              isMulti
                ? `${multiCount} ${typePlural(element.type)} selected`
                : element.name
            }
            detail={
              isMulti
                ? "Shared edit — changes apply to all"
                : element.type === "vector"
                  ? `${element.source.provider} · ${element.source.license}`
                  : element.type === "widget"
                    ? "Smart pager · All pages"
                    : element.type === "tag"
                      ? "Smart tag · All pages"
                      : element.type
            }
          />
        </div>
        <InspectorIconButton
          label={element.visible ? "Hide element" : "Show element"}
          active={!element.visible}
          onClick={() => onBaseChange({ visible: !element.visible })}
        >
          {element.visible ? (
            <IconEye className="size-4" />
          ) : (
            <IconEyeOff className="size-4" />
          )}
        </InspectorIconButton>
        <InspectorIconButton
          label={element.locked ? "Unlock element" : "Lock element"}
          active={element.locked}
          onClick={() => onBaseChange({ locked: !element.locked })}
        >
          {element.locked ? (
            <IconLock className="size-4" />
          ) : (
            <IconLockOpen className="size-4" />
          )}
        </InspectorIconButton>
      </div>

      {element.type === "text" ? (
        <InspectorSection title="Typography">
          <Field label="Text">
            <textarea
              value={element.text}
              onChange={(event) => onTypedChange({ text: event.target.value })}
              rows={4}
              className={textareaClass}
            />
          </Field>
          <Field label="Font">
            <div className="grid grid-cols-[minmax(0,1fr)_82px] gap-2">
              <FontSelectControl
                value={element.fontFamily}
                onChange={(fontFamily) => {
                  onTypedChange({ fontFamily });
                }}
                customFamilies={fonts.map((font) => font.family)}
              />
              <button
                type="button"
                onClick={onImportFont}
                disabled={fontImporting}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.06] disabled:cursor-wait disabled:opacity-50"
                style={{ border: "1px solid var(--hairline)" }}
              >
                {fontImporting ? (
                  <span className="size-3.5 animate-spin rounded-full border border-current border-r-transparent" />
                ) : (
                  <IconFileUpload className="size-3.5" />
                )}
                Import
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <Field label="Weight">
              <SelectControl
                value={element.fontWeight}
                onChange={(fontWeight) => onTypedChange({ fontWeight })}
                options={[
                  { value: "400", label: "Regular" },
                  { value: "500", label: "Medium" },
                  { value: "600", label: "Semibold" },
                  { value: "700", label: "Bold" },
                  { value: "800", label: "Extra bold" },
                ]}
              />
            </Field>
            <NumberField
              label="Size"
              value={element.fontSize}
              min={1}
              max={512}
              onChange={(fontSize) => onTypedChange({ fontSize })}
            />
          </div>
          <Field label="Alignment">
            <SegmentedControl
              value={element.textAlign}
              onChange={(textAlign) => onTypedChange({ textAlign })}
              options={[
                {
                  value: "left",
                  label: "Align left",
                  icon: <IconAlignLeft className="size-4" />,
                },
                {
                  value: "center",
                  label: "Align center",
                  icon: <IconAlignCenter className="size-4" />,
                },
                {
                  value: "right",
                  label: "Align right",
                  icon: <IconAlignRight className="size-4" />,
                },
              ]}
            />
          </Field>
          <Field label="Text color">
            <ColorControl
              value={element.fill}
              onChange={(fill) => onTypedChange({ fill })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Line height"
              value={element.lineHeight}
              min={0.5}
              max={3}
              step={0.02}
              onChange={(lineHeight) => onTypedChange({ lineHeight })}
            />
            <NumberField
              label="Tracking"
              value={element.letterSpacing}
              min={-40}
              max={200}
              step={0.5}
              onChange={(letterSpacing) => onTypedChange({ letterSpacing })}
            />
          </div>
          <Field label="Capitalisation">
            <SelectControl
              value={element.textTransform}
              onChange={(textTransform) => onTypedChange({ textTransform })}
              options={[
                { value: "none", label: "As typed" },
                { value: "uppercase", label: "UPPERCASE" },
                { value: "lowercase", label: "lowercase" },
                { value: "capitalize", label: "Title Case" },
              ]}
            />
          </Field>
        </InspectorSection>
      ) : null}

      {element.type === "text" ? (
        <TextEffectsSection element={element} onChange={onTypedChange} />
      ) : null}

      {element.type === "frame" && element.asset && !isMulti ? (
        <CutoutSection cutout={cutout} />
      ) : null}

      {element.type === "frame" ? (
        <FrameInspectorSections
          element={element}
          uploadPending={uploadPending}
          onChange={onTypedChange}
          onReplaceImage={onReplaceFrameImage}
        />
      ) : null}

      {element.type === "widget" ? (
        <InspectorSection title="Pager">
          <Field label="Style">
            <SelectControl
              value={element.props.variant}
              onChange={(variant) => onTypedChange({ variant })}
              options={[
                { value: "dots", label: "Dots" },
                { value: "stretch", label: "Stretch" },
                { value: "bars", label: "Bars" },
                { value: "numbers", label: "Numbers" },
              ]}
            />
          </Field>
          <Field label="Page count">
            <SegmentedControl
              value={element.props.countMode}
              onChange={(countMode) => onTypedChange({ countMode })}
              options={[
                { value: "auto", label: "Automatic", text: "Auto" },
                { value: "fixed", label: "Fixed", text: "Fixed" },
              ]}
            />
          </Field>
          {element.props.countMode === "fixed" ? (
            <NumberField
              label="Dots or labels"
              value={element.props.count}
              min={2}
              max={20}
              onChange={(count) => onTypedChange({ count })}
            />
          ) : null}
          <Field label="Active page">
            <SegmentedControl
              value={element.props.activeMode}
              onChange={(activeMode) => onTypedChange({ activeMode })}
              options={[
                { value: "auto", label: "Current page", text: "Auto" },
                { value: "fixed", label: "Choose page", text: "Manual" },
              ]}
            />
          </Field>
          {element.props.activeMode === "fixed" ? (
            <NumberField
              label="Page"
              value={element.props.activeIndex + 1}
              min={1}
              max={element.props.count}
              onChange={(page) =>
                onTypedChange({ activeIndex: Math.max(0, page - 1) })
              }
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Active">
              <ColorControl
                value={element.props.activeColor}
                onChange={(activeColor) => onTypedChange({ activeColor })}
              />
            </Field>
            <Field label="Inactive">
              <ColorControl
                value={element.props.inactiveColor}
                onChange={(inactiveColor) => onTypedChange({ inactiveColor })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Size"
              value={element.props.size}
              min={4}
              max={80}
              onChange={(size) => onTypedChange({ size })}
            />
            <NumberField
              label="Spacing"
              value={element.props.gap}
              min={0}
              max={100}
              onChange={(gap) => onTypedChange({ gap })}
            />
          </div>
        </InspectorSection>
      ) : null}

      {element.type === "video" ? (
        <InspectorSection title="Sound">
          <button
            type="button"
            onClick={() => onTypedChange({ muted: !element.muted })}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-foreground transition-colors"
            style={{
              border: "1px solid var(--hairline)",
              backgroundColor: element.muted ? "transparent" : "var(--inset)",
            }}
          >
            {element.muted ? (
              <>
                <IconVolumeOff className="size-4" />
                Muted — tap for sound (and to include it in the export)
              </>
            ) : (
              <>
                <IconVolume className="size-4" />
                Sound on — plays here and in the exported video
              </>
            )}
          </button>
        </InspectorSection>
      ) : null}

      {element.type === "image" && !isMulti ? (
        <InspectorSection title="Image">
          <button
            type="button"
            onClick={onReplaceImage}
            disabled={uploadPending}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
            style={{ border: "1px solid var(--hairline)" }}
          >
            <IconPhotoPlus className="size-4" />
            {uploadPending ? "Uploading…" : "Replace image"}
          </button>
        </InspectorSection>
      ) : null}

      {element.type === "image" ? (
        <ImageAdjustSections element={element} onChange={onTypedChange} />
      ) : null}

      {element.type === "image" ? (
        <>
          {isMulti ? null : <CutoutSection cutout={cutout} />}

          <InspectorSection title="Edge">
            <Field label="Style">
              <SegmentedControl
                value={edgeEffect.enabled ? edgeEffect.style : "none"}
                onChange={(style) =>
                  onTypedChange({
                    edgeEffect:
                      style === "none"
                        ? { ...edgeEffect, enabled: false }
                        : {
                            ...edgeEffect,
                            enabled: true,
                            style: style as CreativeImageEdgeEffect["style"],
                          },
                  })
                }
                options={[
                  { value: "none", label: "No edge", text: "None" },
                  { value: "outline", label: "Clean border", text: "Border" },
                  {
                    value: "torn-paper",
                    label: "Ripped paper",
                    text: "Ripped",
                  },
                ]}
              />
            </Field>
            {edgeEffect.enabled ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                  <Field
                    label={
                      edgeEffect.style === "torn-paper" ? "Paper" : "Border"
                    }
                  >
                    <ColorControl
                      value={edgeEffect.color}
                      onChange={(color) =>
                        onTypedChange({
                          edgeEffect: { ...edgeEffect, color },
                        })
                      }
                    />
                  </Field>
                  <NumberField
                    label="Width"
                    value={edgeEffect.width}
                    min={1}
                    max={128}
                    onChange={(width) =>
                      onTypedChange({
                        edgeEffect: { ...edgeEffect, width },
                      })
                    }
                  />
                </div>
                {edgeEffect.style === "torn-paper" ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                    <NumberField
                      label="Roughness"
                      value={Math.round(edgeEffect.roughness * 100)}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(roughness) =>
                        onTypedChange({
                          edgeEffect: {
                            ...edgeEffect,
                            roughness: roughness / 100,
                          },
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onTypedChange({
                          edgeEffect: {
                            ...edgeEffect,
                            seed: Math.floor(Math.random() * 2_147_483_647),
                          },
                        })
                      }
                      className="mt-[18px] flex h-9 items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                      style={{ border: "1px solid var(--hairline)" }}
                    >
                      <IconRefresh className="size-3.5" />
                      New tear
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </InspectorSection>

          <InspectorSection title="Effects">
            {/* One effect at a time: they are competing ways of re-rendering the
                same pixels, so this picks rather than stacks. */}
            <div className="grid grid-cols-3 gap-1.5">
              <EffectTile
                label="Dither"
                active={activeEffect === "dither"}
                gradient="linear-gradient(135deg,#ef7b16,#8a43e1 52%,#d511fd)"
                dithered
                onClick={() =>
                  onTypedChange({
                    effect:
                      activeEffect === "dither"
                        ? { ...dither, enabled: false }
                        : { ...dither, enabled: true },
                  })
                }
              />
              <EffectTile
                label="Pixelate"
                active={activeEffect === "pixelate"}
                gradient="linear-gradient(135deg,#ef7b16,#8a43e1 52%,#d511fd)"
                cells={pixelate.cellSize}
                onClick={() =>
                  onTypedChange({
                    effect:
                      activeEffect === "pixelate"
                        ? { ...pixelate, enabled: false }
                        : { ...pixelate, enabled: true },
                  })
                }
              />
              <EffectTile
                label="ASCII"
                active={activeEffect === "ascii"}
                gradient={`linear-gradient(135deg,${ascii.background},${ascii.ink})`}
                glyphs
                onClick={() =>
                  onTypedChange({
                    effect:
                      activeEffect === "ascii"
                        ? { ...ascii, enabled: false }
                        : { ...ascii, enabled: true },
                  })
                }
              />
            </div>

            {activeEffect === "dither" ? (
              <>
                <Field label="Style">
                  <SegmentedControl
                    value={dither.mode}
                    onChange={(mode) =>
                      onTypedChange({ effect: { ...dither, mode } })
                    }
                    options={[
                      {
                        value: "monochrome",
                        label: "Monochrome",
                        text: "Mono",
                      },
                      { value: "color", label: "Color", text: "Color" },
                    ]}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Cell"
                    value={dither.cellSize}
                    min={1}
                    max={64}
                    onChange={(cellSize) =>
                      onTypedChange({ effect: { ...dither, cellSize } })
                    }
                  />
                  <NumberField
                    label="Strength"
                    value={Math.round(dither.strength * 100)}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(strength) =>
                      onTypedChange({
                        effect: { ...dither, strength: strength / 100 },
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Contrast"
                    value={Math.round(dither.contrast * 100)}
                    min={50}
                    max={300}
                    suffix="%"
                    onChange={(contrast) =>
                      onTypedChange({
                        effect: { ...dither, contrast: contrast / 100 },
                      })
                    }
                  />
                  <NumberField
                    label="Brightness"
                    value={Math.round(dither.brightness * 100)}
                    min={25}
                    max={200}
                    suffix="%"
                    onChange={(brightness) =>
                      onTypedChange({
                        effect: { ...dither, brightness: brightness / 100 },
                      })
                    }
                  />
                </div>
              </>
            ) : null}

            {activeEffect === "ascii" ? (
              <>
                <Field label="Glyphs">
                  <SelectControl
                    value={ascii.charset}
                    onChange={(charset) =>
                      onTypedChange({ effect: { ...ascii, charset } })
                    }
                    options={[
                      { value: "classic", label: ".:-=+*#%@" },
                      { value: "blocks", label: "░▒▓█" },
                      { value: "binary", label: "0 1" },
                      { value: "dots", label: "·∙•●" },
                      { value: "braille", label: "⠿⡿⣿" },
                    ]}
                  />
                </Field>
                <Field label="Colour">
                  <SegmentedControl
                    value={ascii.color}
                    onChange={(color) =>
                      onTypedChange({ effect: { ...ascii, color } })
                    }
                    options={[
                      { value: "ink", label: "One ink", text: "Ink" },
                      { value: "source", label: "From photo", text: "Photo" },
                    ]}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Ink">
                    <ColorControl
                      value={ascii.ink}
                      onChange={(ink) =>
                        onTypedChange({ effect: { ...ascii, ink } })
                      }
                    />
                  </Field>
                  <Field label="Background">
                    <ColorControl
                      value={ascii.background}
                      onChange={(background) =>
                        onTypedChange({ effect: { ...ascii, background } })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Cell"
                    value={ascii.cellSize}
                    min={4}
                    max={64}
                    suffix="px"
                    onChange={(cellSize) =>
                      onTypedChange({ effect: { ...ascii, cellSize } })
                    }
                  />
                  <button
                    type="button"
                    aria-pressed={ascii.invert}
                    onClick={() =>
                      onTypedChange({
                        effect: { ...ascii, invert: !ascii.invert },
                      })
                    }
                    className="mt-[22px] h-9 rounded-xl text-xs font-medium transition-colors hover:bg-foreground/[0.05]"
                    style={{
                      border: `1px solid ${ascii.invert ? "var(--studio-accent)" : "var(--hairline)"}`,
                      color: ascii.invert
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                    }}
                  >
                    {ascii.invert ? "Inverted" : "Invert"}
                  </button>
                </div>
              </>
            ) : null}

            {activeEffect === "pixelate" ? (
              <>
                <Field label="Sampling">
                  <SegmentedControl
                    value={pixelate.sampling}
                    onChange={(sampling) =>
                      onTypedChange({ effect: { ...pixelate, sampling } })
                    }
                    options={[
                      { value: "average", label: "Average", text: "Smooth" },
                      { value: "nearest", label: "Nearest", text: "Retro" },
                    ]}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Block"
                    value={pixelate.cellSize}
                    min={2}
                    max={160}
                    suffix="px"
                    onChange={(cellSize) =>
                      onTypedChange({ effect: { ...pixelate, cellSize } })
                    }
                  />
                  <NumberField
                    label="Colours"
                    value={pixelate.levels}
                    min={0}
                    max={64}
                    onChange={(levels) =>
                      onTypedChange({ effect: { ...pixelate, levels } })
                    }
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {pixelate.levels === 0
                    ? "Colours 0 keeps the original palette."
                    : `Each channel snapped to ${pixelate.levels} steps.`}
                </p>
              </>
            ) : null}
          </InspectorSection>
        </>
      ) : null}

      <InspectorSection title="Transform">
        {isMulti ? null : (
          <Field label="Position">
            <div className="grid grid-cols-2 gap-2">
              <CompactNumberInput
                prefix="X"
                label="X position"
                value={Math.round(element.x)}
                onChange={(x) => onBaseChange({ x })}
              />
              <CompactNumberInput
                prefix="Y"
                label="Y position"
                value={Math.round(element.y)}
                onChange={(y) => onBaseChange({ y })}
              />
            </div>
          </Field>
        )}
        {isMulti ? null : (
          <Field label="Dimensions">
            <div className="grid grid-cols-2 gap-2">
              <CompactNumberInput
                prefix="W"
                label="Width"
                value={Math.round(element.width)}
                min={1}
                onChange={(width) => onBaseChange({ width })}
              />
              <CompactNumberInput
                prefix="H"
                label="Height"
                value={Math.round(element.height)}
                min={1}
                onChange={(height) => onBaseChange({ height })}
              />
            </div>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          {isMulti ? null : (
            <NumberField
              label="Rotation"
              value={element.rotation}
              onChange={(rotation) => onBaseChange({ rotation })}
            />
          )}
          <NumberField
            label="Opacity"
            value={Math.round(element.opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(opacity) => onBaseChange({ opacity: opacity / 100 })}
          />
        </div>
        <Field label="Align to canvas">
          <AlignControls onAlign={onAlign} />
        </Field>
      </InspectorSection>

      {element.type === "shape" ? (
        <>
          <InspectorSection title="Fill">
            <ColorControl
              value={element.fill}
              onChange={(fill) => onTypedChange({ fill })}
            />
          </InspectorSection>
          <InspectorSection title="Stroke">
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <ColorControl
                value={element.stroke}
                onChange={(stroke) => onTypedChange({ stroke })}
              />
              <CompactNumberInput
                prefix="W"
                label="Stroke width"
                value={element.strokeWidth}
                min={0}
                max={128}
                onChange={(strokeWidth) => onTypedChange({ strokeWidth })}
              />
            </div>
          </InspectorSection>
          {element.shape === "rectangle" ? (
            <InspectorSection title="Corners">
              <NumberField
                label="Corner radius"
                value={element.radius}
                min={0}
                onChange={(radius) => onTypedChange({ radius })}
              />
            </InspectorSection>
          ) : null}
        </>
      ) : null}

      {element.type === "vector" && element.recolorable ? (
        <InspectorSection title="Color">
          <ColorControl
            value={element.fill}
            onChange={(fill) => onTypedChange({ fill })}
          />
        </InspectorSection>
      ) : null}

      {element.type === "drawing" ? (
        <DrawingInspectorSections element={element} onChange={onTypedChange} />
      ) : null}

      {element.type === "tag" ? (
        <TagInspectorSections
          element={element}
          onChange={onTypedChange}
          onResize={onBaseChange}
        />
      ) : null}

      <button
        type="button"
        onClick={onDuplicate}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05]"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <IconCopy className="size-4" />
        {isMulti ? `Duplicate ${multiCount}` : "Duplicate"}
      </button>

      <button
        type="button"
        onClick={onRemove}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        style={{
          border: "1px solid color-mix(in srgb, #f87171 22%, transparent)",
        }}
      >
        <IconTrash className="size-4" />
        {isMulti
          ? `Remove ${multiCount} elements`
          : isSmartElement(element)
            ? "Remove from all pages"
            : "Remove element"}
      </button>
    </div>
  );
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-3 pt-4"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <h3 className="text-[11px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function InspectorIconButton({
  children,
  label,
  active = false,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
      style={
        active
          ? {
              backgroundColor: "var(--inset)",
              color: "var(--foreground)",
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function SelectControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} appearance-none pr-8`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: {
    value: string;
    label: string;
    icon?: React.ReactNode;
    text?: string;
  }[];
  onChange(value: string): void;
}) {
  return (
    <div
      className="grid h-9 overflow-hidden rounded-xl p-0.5"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 5%, transparent)",
        border: "1px solid var(--hairline)",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-label={option.label}
            title={option.label}
            aria-pressed={active}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            style={
              active
                ? {
                    backgroundColor: "var(--tray)",
                    color: "var(--foreground)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  }
                : undefined
            }
          >
            {option.icon}
            {option.text}
          </button>
        );
      })}
    </div>
  );
}

function CompactNumberInput({
  prefix,
  label,
  value,
  min,
  max,
  onChange,
}: {
  prefix: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange(value: number): void;
}) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
        {prefix}
      </span>
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(clampToRange(next, min, max));
        }}
        className={`${inputClass} pl-7`}
      />
    </label>
  );
}

function InspectorHeading({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div>
      <h2 className="truncate text-sm font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-0.5 capitalize text-xs text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange(value: number): void;
}) {
  return (
    <Field label={label}>
      <span className="relative block">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(clampToRange(next, min, max));
          }}
          className={`${inputClass} ${suffix ? "pr-7" : ""}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </span>
    </Field>
  );
}

function ColorControl({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  return (
    <span
      className="flex h-9 items-center gap-2 rounded-xl px-2"
      style={{
        backgroundColor: "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      <input
        type="color"
        value={normalizeColor(value)}
        onChange={(event) => onChange(event.target.value)}
        className="size-5 cursor-pointer border-0 bg-transparent p-0"
        aria-label="Choose color"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-xs uppercase outline-none"
      />
    </span>
  );
}

const inputClass =
  "h-9 w-full rounded-xl border border-foreground/[0.07] bg-foreground/[0.045] px-3 text-xs text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus:border-foreground/20 focus:bg-foreground/[0.065]";
const textareaClass =
  "min-h-24 w-full resize-y rounded-xl border border-foreground/[0.07] bg-foreground/[0.045] px-3 py-2.5 text-xs leading-relaxed text-foreground outline-none transition-colors hover:bg-foreground/[0.06] focus:border-foreground/20 focus:bg-foreground/[0.065]";

function backgroundRemovalLabel(state: BackgroundRemovalState) {
  if (state.stage === "downloading") {
    return `Downloading ${Math.round(state.progress * 100)}%`;
  }
  if (state.stage === "loading") {
    return `Preparing models ${Math.round(state.progress * 100)}%`;
  }
  if (state.stage === "uploading") return "Saving cutout";
  return `Removing ${Math.round(state.progress * 100)}%`;
}

function seedFromString(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 1;
}

function createDefaultBackgroundEffect(
  type: CreativeBackgroundEffect["type"],
  background: string,
  previous?: CreativeBackgroundEffect,
): CreativeBackgroundEffect {
  const sameType = previous?.type === type;
  const compact = type === "flicker" || type === "dots";
  return {
    type,
    color: previous?.color ?? contrastColor(background),
    secondaryColor: previous?.secondaryColor ?? "var(--studio-accent)",
    size: sameType
      ? previous.size
      : type === "texture"
        ? 100
        : compact
          ? 12
          : 40,
    gap: sameType ? previous.gap : compact ? 9 : 16,
    opacity: sameType ? previous.opacity : 0.22,
    intensity: sameType ? previous.intensity : 0.5,
    seed: sameType ? previous.seed : Math.floor(Math.random() * 2_147_483_647),
    shape: previous?.shape ?? "square",
    direction: previous?.direction ?? "diagonal",
    speed: previous?.speed ?? 0.5,
    texture: previous?.texture ?? "fabric-of-squares",
    // Carried so switching to another effect and back keeps the mat as it was.
    mat: previous?.mat ?? { ...DEFAULT_CUTTING_MAT },
  };
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "var(--studio-accent)";
}

function readSvgAspectRatio(svg: string) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  const viewBox = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  if (
    viewBox?.length === 4 &&
    Number.isFinite(viewBox[2]) &&
    Number.isFinite(viewBox[3]) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0
  ) {
    return viewBox[2] / viewBox[3];
  }

  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
    ? width / height
    : 1;
}

function isSvgFile(file: File) {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

/**
 * Render an SVG through the browser's isolated image decoder, then persist only
 * PNG pixels. A 2048px long edge stays sharp on the largest studio canvases
 * without turning a small icon into an unnecessarily large upload.
 */
async function rasterizeSvgToPng(svg: string, filename: string): Promise<File> {
  const ratio = Math.max(0.01, readSvgAspectRatio(svg));
  const longEdge = 2_048;
  const width =
    ratio >= 1 ? longEdge : Math.max(1, Math.round(longEdge * ratio));
  const height =
    ratio >= 1 ? Math.max(1, Math.round(longEdge / ratio)) : longEdge;
  const sourceUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = new Image();
    image.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The SVG could not be rendered as an image."));
    });

    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The image renderer is unavailable.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("The SVG could not be converted to PNG.")),
        "image/png",
      );
    });
    return new File([blob], filename || "element.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function fitWithinBounds(ratio: number, maxWidth: number, maxHeight: number) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let width = maxWidth;
  let height = width / safeRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
  }
  return {
    width: Math.max(80, Math.round(width)),
    height: Math.max(80, Math.round(height)),
  };
}

function contrastColor(background: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(background);
  if (!match) return "#1D1B20";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance < 138 ? "#F8F6F2" : "#1D1B20";
}

/**
 * A number input's `min`/`max` only constrain the stepper — a typed value goes
 * straight through. Without clamping, an out-of-range number reaches the
 * command schema and fails validation instead of being quietly corrected.
 */
function clampToRange(value: number, min?: number, max?: number) {
  let result = value;
  if (typeof min === "number") result = Math.max(min, result);
  if (typeof max === "number") result = Math.min(max, result);
  return result;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agentic-canvas-slide"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function readImageDimensions(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The image could not be read."));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Intrinsic size of a library image whose dimensions weren't recorded. */
async function readImageDimensionsFromUrl(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = url;
  });
  return { width: image.naturalWidth, height: image.naturalHeight };
}
