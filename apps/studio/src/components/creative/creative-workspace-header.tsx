"use client";

import type { ReactNode } from "react";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconSparkles,
  IconDownload,
  IconFileUpload,
  IconHistory,
  IconLoader2,
  IconMovie,
  IconMusic,
  IconSend,
  IconShare2,
} from "@tabler/icons-react";

export type CreativeExportTarget = "download" | "media" | "compose" | null;

const SAVE_LABELS = {
  saved: "Saved",
  dirty: "Unsaved",
  saving: "Saving…",
  conflict: "Edited elsewhere — reload to continue",
  error: "Couldn’t save — retries on your next edit",
} as const;

export function CreativeWorkspaceHeader({
  documentId,
  title,
  saveState,
  pageCount,
  canUndo,
  canRedo,
  assistantOpen,
  exporting,
  onBack,
  onRename,
  onUndo,
  onRedo,
  onToggleAssistant,
  onSaveToMedia,
  onDownloadSlide,
  onDownloadAll,
  onSendToCompose,
  onShare,
  onOpenHistory,
  onExportVideo,
  onChooseSoundtrack,
  soundtrackSelected = false,
  videoProgress = null,
  sharing = false,
  localDraft = false,
  freeExportsRemaining,
}: {
  documentId: string;
  title: string;
  saveState: keyof typeof SAVE_LABELS;
  pageCount: number;
  canUndo: boolean;
  canRedo: boolean;
  assistantOpen: boolean;
  exporting: CreativeExportTarget;
  onBack(): void;
  onRename(title: string): void;
  onUndo(): void;
  onRedo(): void;
  onToggleAssistant?(): void;
  onSaveToMedia?(): void;
  onDownloadSlide(): void;
  onDownloadAll(): void;
  onSendToCompose?(): void;
  /** Absent for guest/local drafts (nothing on the server to share yet). */
  onShare?(): void;
  /** Absent for guest/local drafts (version history is server-backed). */
  onOpenHistory?(): void;
  /** Present only for video-kind designs — encodes the scenes to an MP4. */
  onExportVideo?(): void;
  /** Present only for video projects; opens the popular-sound picker. */
  onChooseSoundtrack?(): void;
  soundtrackSelected?: boolean;
  /** 0..1 while a video export runs; null when idle. */
  videoProgress?: number | null;
  sharing?: boolean;
  localDraft?: boolean;
  freeExportsRemaining?: number;
}) {
  const busy = exporting !== null;
  const multiple = pageCount > 1;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-3 py-2 sm:px-4">
      <ToolbarButton label="All designs" onClick={onBack}>
        <IconArrowLeft className="size-4" />
      </ToolbarButton>

      <div className="min-w-0 flex-1">
        <input
          key={`${documentId}:title`}
          defaultValue={title}
          onBlur={(event) => {
            const nextTitle = event.target.value.trim();
            if (nextTitle && nextTitle !== title) onRename(nextTitle);
          }}
          aria-label="Creative project title"
          className="w-full truncate bg-transparent text-xl font-semibold tracking-tight outline-none"
        />
        <p
          className="text-xs text-muted-foreground"
          aria-live="polite"
          style={
            saveState === "conflict" || saveState === "error"
              ? { color: "#E5484D" }
              : undefined
          }
        >
          {localDraft && saveState === "saved"
            ? "Saved on this device"
            : SAVE_LABELS[saveState]}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {freeExportsRemaining !== undefined ? (
          <span
            className="mr-1 hidden rounded-full px-2.5 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex"
            style={{
              border: "1px solid var(--hairline)",
              backgroundColor: "var(--inset)",
            }}
          >
            {freeExportsRemaining} free export
            {freeExportsRemaining === 1 ? "" : "s"} left
          </span>
        ) : null}
        <ToolbarButton label="Undo" disabled={!canUndo} onClick={onUndo}>
          <IconArrowBackUp className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!canRedo} onClick={onRedo}>
          <IconArrowForwardUp className="size-4" />
        </ToolbarButton>
        {onToggleAssistant ? (
          <ToolbarButton
            label="Studio assistant"
            active={assistantOpen}
            onClick={onToggleAssistant}
          >
            <IconSparkles className="size-4" />
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          label={
            exporting === "download"
              ? "Exporting…"
              : multiple
                ? "Download all slides"
                : "Download"
          }
          disabled={busy}
          onClick={multiple ? onDownloadAll : onDownloadSlide}
        >
          {exporting === "download" ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconDownload className="size-4" />
          )}
        </ToolbarButton>
        {onSaveToMedia ? (
          <ToolbarButton
            label={exporting === "media" ? "Saving…" : "Save to Media"}
            disabled={busy}
            onClick={onSaveToMedia}
          >
            {exporting === "media" ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconFileUpload className="size-4" />
            )}
          </ToolbarButton>
        ) : null}
        {onOpenHistory ? (
          <ToolbarButton label="Version history" onClick={onOpenHistory}>
            <IconHistory className="size-4" />
          </ToolbarButton>
        ) : null}
        {onShare ? (
          <ToolbarButton
            label={sharing ? "Creating link…" : "Share a public link"}
            disabled={sharing}
            onClick={onShare}
          >
            {sharing ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconShare2 className="size-4" />
            )}
          </ToolbarButton>
        ) : null}
        {onExportVideo ? (
          <ToolbarButton
            label={soundtrackSelected ? "Change soundtrack" : "Add soundtrack"}
            active={soundtrackSelected}
            onClick={onChooseSoundtrack ?? (() => undefined)}
          >
            <IconMusic className="size-4" />
          </ToolbarButton>
        ) : null}
        {onExportVideo ? (
          <ToolbarButton
            label={
              videoProgress !== null
                ? `Encoding video… ${Math.round(videoProgress * 100)}%`
                : "Export as video (MP4)"
            }
            disabled={videoProgress !== null}
            onClick={onExportVideo}
          >
            {videoProgress !== null ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconMovie className="size-4" />
            )}
          </ToolbarButton>
        ) : null}
        {onSendToCompose ? (
          <button
            type="button"
            onClick={onSendToCompose}
            disabled={busy}
            className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium text-foreground transition-opacity disabled:opacity-50"
            style={{
              border: "1.5px solid transparent",
              backgroundImage:
                "linear-gradient(var(--tray),var(--tray)),var(--grad-brand)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box,border-box",
            }}
          >
            <IconSend className="size-4" />
            {exporting === "compose" ? "Preparing…" : "Use in a post"}
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function ToolbarButton({
  children,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
      style={
        active
          ? {
              backgroundColor: "var(--inset)",
              color: "var(--foreground)",
              border: "1px solid var(--hairline)",
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}
