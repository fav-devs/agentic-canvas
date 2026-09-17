"use client";

import { useState } from "react";
import {
  IconClock,
  IconDeviceFloppy,
  IconRotateClockwise,
  IconSparkles,
} from "@tabler/icons-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreativeVersions,
  type CreativeVersion,
  type CreativeVersionSource,
} from "@/lib/studio-host-bridge";

const SOURCE_META: Record<
  CreativeVersionSource,
  { label: string; icon: typeof IconClock }
> = {
  ai: { label: "Before AI edit", icon: IconSparkles },
  manual: { label: "Saved version", icon: IconDeviceFloppy },
  restore: { label: "Before restore", icon: IconRotateClockwise },
  auto: { label: "Autosave", icon: IconClock },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Version history for a Studio design: a timeline of restore points with a
 * manual "Save version" button. Restoring rolls the whole document back (the
 * current state is snapshotted server-side first, so it's never destructive).
 */
export function CreativeHistoryPanel({
  documentId,
  open,
  onOpenChange,
  onRestore,
  onSaveVersion,
  restoring = false,
}: {
  documentId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRestore(versionId: string): void;
  onSaveVersion(label?: string): void;
  restoring?: boolean;
}) {
  const versions = useCreativeVersions(documentId, open);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = versions.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-[var(--hairline)]">
          <SheetTitle className="flex items-center gap-2">
            <IconClock className="size-4" />
            Version history
          </SheetTitle>
          <SheetDescription>
            Restore points are captured before AI edits and while you work. Keep
            the last 30.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => onSaveVersion()}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-foreground transition-opacity hover:opacity-90"
            style={{
              border: "1.5px solid transparent",
              backgroundImage:
                "linear-gradient(var(--tray),var(--tray)),var(--grad-brand)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box,border-box",
            }}
          >
            <IconDeviceFloppy className="size-4" />
            Save current version
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {versions.isLoading ? (
            <p className="px-1 py-8 text-center text-xs text-muted-foreground">
              Loading history…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-1 py-8 text-center text-xs text-muted-foreground">
              No restore points yet. One is captured before the assistant edits
              this design, or when you save a version.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {rows.map((version) => (
                <HistoryRow
                  key={version.id}
                  version={version}
                  busy={restoring && pendingId === version.id}
                  disabled={restoring}
                  onRestore={() => {
                    setPendingId(version.id);
                    onRestore(version.id);
                  }}
                />
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HistoryRow({
  version,
  busy,
  disabled,
  onRestore,
}: {
  version: CreativeVersion;
  busy: boolean;
  disabled: boolean;
  onRestore(): void;
}) {
  const meta = SOURCE_META[version.source] ?? SOURCE_META.auto;
  const Icon = meta.icon;
  return (
    <li
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        border: "1px solid var(--hairline)",
        backgroundColor: "var(--inset)",
      }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        style={{ backgroundColor: "var(--tray)" }}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {version.label || meta.label}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {relativeTime(version.createdAt)} · rev {version.revision}
        </p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={disabled}
        className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <IconRotateClockwise className="size-3.5" />
        {busy ? "Restoring…" : "Restore"}
      </button>
    </li>
  );
}
