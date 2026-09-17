"use client";

import { useState } from "react";
import Image from "next/image";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLink,
  IconLock,
  IconLockOpen,
  IconTrash,
  IconUnlink,
} from "@tabler/icons-react";
import type { CreativeElement, CreativePage } from "@/lib/creative/document";
import { drawingStrokeBounds } from "@/lib/creative/document";
import { frameSvgPath } from "@/lib/creative/frames";
import { strokeGeometry } from "@/lib/creative/strokes";

function elementLabel(element: CreativeElement) {
  if (element.type === "text") return element.text.trim() || element.name;
  if (element.type === "tag") return element.text.trim() || element.name;
  return element.name;
}

/**
 * The stacking list for the current slide.
 *
 * This is also the only way back to an element that has been hidden or locked:
 * both states remove it from the canvas as a click target, so without a list
 * the toggle would be a one-way door.
 *
 * Rows show the element rather than an icon for its type. A slide with five
 * circles and three photos is nothing but icons otherwise — you cannot tell which
 * row is which without clicking each one, which defeats having a list.
 */
export function LayersPanel({
  page,
  heading = "Layers",
  selectedElementIds,
  onSelectionChange,
  onGroup,
  onUngroup,
  onRenameGroup,
  onSetGroupVisible,
  onSetGroupLocked,
  onRemoveMany,
  onMoveLayers,
  onToggleVisible,
  onToggleLocked,
  onReorder,
}: {
  page: CreativePage;
  heading?: string;
  selectedElementIds: string[];
  onSelectionChange(elementIds: string[]): void;
  onGroup(elementIds: string[]): void;
  onUngroup(groupId: string): void;
  onRenameGroup(groupId: string, name: string): void;
  onSetGroupVisible(groupId: string, visible: boolean): void;
  onSetGroupLocked(groupId: string, locked: boolean): void;
  onRemoveMany(elementIds: string[]): void;
  onMoveLayers(input: {
    elementIds: string[];
    targetElementId: string;
    targetGroupId: string | null;
  }): void;
  onToggleVisible(element: CreativeElement): void;
  onToggleLocked(element: CreativeElement): void;
  onReorder(element: CreativeElement, index: number): void;
}) {
  // Top of the list is the front of the canvas, which is the end of the array.
  const ordered = page.elements.map((element, index) => ({ element, index }));
  ordered.reverse();
  const pageElementIds = new Set(page.elements.map((element) => element.id));
  const pageSelectedElementIds = selectedElementIds.filter((id) =>
    pageElementIds.has(id),
  );
  const selected = new Set(pageSelectedElementIds);
  const groupMembers = new Map<
    string,
    Array<{ element: CreativeElement; index: number }>
  >();
  for (const entry of ordered) {
    const groupId = entry.element.groupId;
    if (!groupId) continue;
    const members = groupMembers.get(groupId) ?? [];
    members.push(entry);
    groupMembers.set(groupId, members);
  }
  const rootRows: Array<
    | {
        kind: "group";
        id: string;
        name: string;
        members: Array<{ element: CreativeElement; index: number }>;
      }
    | {
        kind: "element";
        element: CreativeElement;
        index: number;
      }
  > = [];
  const seenGroups = new Set<string>();
  for (const entry of ordered) {
    const groupId = entry.element.groupId;
    if (!groupId) {
      rootRows.push({ kind: "element", ...entry });
      continue;
    }
    if (seenGroups.has(groupId)) continue;
    seenGroups.add(groupId);
    const members = groupMembers.get(groupId) ?? [entry];
    rootRows.push({
      kind: "group",
      id: groupId,
      name:
        members.find(({ element }) => element.groupName)?.element.groupName ??
        "Group",
      members,
    });
  }

  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [overId, setOverId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [renamingGroupId, setRenamingGroupId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const [selectionAnchorId, setSelectionAnchorId] = useState<string>();

  const endDrag = () => {
    setDraggingIds([]);
    setOverId(null);
  };

  const selectRows = (
    ids: string[],
    anchorId: string,
    event: React.MouseEvent,
  ) => {
    let next: string[];
    if (event.shiftKey && selectionAnchorId) {
      const flatIds = ordered.map(({ element }) => element.id);
      const from = flatIds.indexOf(selectionAnchorId);
      const to = flatIds.indexOf(anchorId);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        next = flatIds.slice(start, end + 1);
      } else {
        next = ids;
      }
    } else if (event.metaKey || event.ctrlKey) {
      const nextSet = new Set(selectedElementIds);
      const remove = ids.every((id) => nextSet.has(id));
      for (const id of ids) {
        if (remove) nextSet.delete(id);
        else nextSet.add(id);
      }
      next = [
        ...selectedElementIds.filter((id) => !pageElementIds.has(id)),
        ...ordered
          .map(({ element }) => element.id)
          .filter((id) => nextSet.has(id)),
      ];
    } else {
      next = ids;
    }
    setSelectionAnchorId(anchorId);
    onSelectionChange(next);
  };

  const selectedGroupIds = Array.from(
    new Set(
      page.elements
        .filter((element) => selected.has(element.id) && element.groupId)
        .map((element) => element.groupId as string),
    ),
  );
  const completeSelectedGroup =
    selectedGroupIds.length === 1 &&
    pageSelectedElementIds.length > 1 &&
    pageSelectedElementIds.length ===
      (groupMembers.get(selectedGroupIds[0]!) ?? []).length &&
    (groupMembers.get(selectedGroupIds[0]!) ?? []).every(({ element }) =>
      selected.has(element.id),
    )
      ? selectedGroupIds[0]
      : undefined;

  const commitRename = (groupId: string) => {
    const name = renameValue.trim();
    if (name) onRenameGroup(groupId, name);
    setRenamingGroupId(undefined);
    setRenameValue("");
  };

  const dropLayers = (
    targetElementId: string,
    targetGroupId: string | null,
  ) => {
    if (draggingIds.length === 0 || draggingIds.includes(targetElementId)) {
      endDrag();
      return;
    }
    onMoveLayers({
      elementIds: draggingIds,
      targetElementId,
      targetGroupId,
    });
    endDrag();
  };

  return (
    <section aria-label={`Layers: ${heading}`} className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-foreground">{heading}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {page.elements.length}
        </span>
      </div>

      {pageSelectedElementIds.length > 1 ? (
        <div
          className="flex items-center gap-1 rounded-xl p-1"
          style={{
            backgroundColor: "var(--inset)",
            border: "1px solid var(--hairline)",
          }}
        >
          <span className="min-w-0 flex-1 px-2 text-[10px] font-medium tabular-nums text-muted-foreground">
            {pageSelectedElementIds.length} selected
          </span>
          <button
            type="button"
            onClick={() =>
              completeSelectedGroup
                ? onUngroup(completeSelectedGroup)
                : onGroup(pageSelectedElementIds)
            }
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.06]"
            title={
              completeSelectedGroup ? "Ungroup selection" : "Group selection"
            }
          >
            {completeSelectedGroup ? (
              <IconUnlink className="size-3.5" />
            ) : (
              <IconLink className="size-3.5" />
            )}
            {completeSelectedGroup ? "Ungroup" : "Group"}
          </button>
          <LayerIconButton
            label="Delete selected layers"
            onClick={() => onRemoveMany(pageSelectedElementIds)}
          >
            <IconTrash className="size-3.5" />
          </LayerIconButton>
        </div>
      ) : null}

      {page.elements.length === 0 ? (
        <p className="py-2 text-[11px] text-muted-foreground">
          Nothing on this slide yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {rootRows.map((row) => {
            if (row.kind === "element") {
              return (
                <ElementLayerRow
                  key={row.element.id}
                  element={row.element}
                  index={row.index}
                  pageCount={page.elements.length}
                  active={selected.has(row.element.id)}
                  dragging={draggingIds.includes(row.element.id)}
                  over={overId === row.element.id}
                  onSelect={(event) =>
                    selectRows([row.element.id], row.element.id, event)
                  }
                  onDragStart={() => setDraggingIds([row.element.id])}
                  onDragEnd={endDrag}
                  onDragOver={() => setOverId(row.element.id)}
                  onDrop={() =>
                    dropLayers(row.element.id, row.element.groupId ?? null)
                  }
                  onToggleVisible={() => onToggleVisible(row.element)}
                  onToggleLocked={() => onToggleLocked(row.element)}
                  onReorder={(index) => onReorder(row.element, index)}
                />
              );
            }

            const ids = row.members.map(({ element }) => element.id);
            const active = ids.every((id) => selected.has(id));
            const collapsed = collapsedGroups.has(row.id);
            const visible = row.members.every(({ element }) => element.visible);
            const locked = row.members.some(({ element }) => element.locked);
            const target = row.members[0]!.element;
            return (
              <li key={row.id} className="space-y-0.5">
                <div
                  draggable={!locked}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", row.id);
                    setDraggingIds(ids);
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(event) => {
                    if (
                      draggingIds.length === 0 ||
                      draggingIds.every((id) => ids.includes(id))
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOverId(row.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropLayers(target.id, row.id);
                  }}
                  className={`group flex items-center gap-1 rounded-lg pr-1 transition-opacity ${
                    draggingIds.length > 0 &&
                    draggingIds.every((id) => ids.includes(id))
                      ? "opacity-40"
                      : ""
                  }`}
                  style={{
                    backgroundColor: active ? "var(--inset)" : undefined,
                    border: `1px solid ${
                      overId === row.id
                        ? "var(--studio-accent)"
                        : active
                          ? "var(--hairline)"
                          : "transparent"
                    }`,
                  }}
                >
                  <span
                    aria-hidden
                    className={`flex w-4 shrink-0 justify-center text-muted-foreground/50 ${
                      locked ? "opacity-30" : "cursor-grab"
                    }`}
                  >
                    <IconGripVertical className="size-3.5" />
                  </span>
                  <button
                    type="button"
                    aria-label={collapsed ? "Expand group" : "Collapse group"}
                    onClick={() =>
                      setCollapsedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    {collapsed ? (
                      <IconChevronRight className="size-3.5" />
                    ) : (
                      <IconChevronDown className="size-3.5" />
                    )}
                  </button>
                  {renamingGroupId === row.id ? (
                    <input
                      value={renameValue}
                      autoFocus
                      maxLength={120}
                      aria-label="Group name"
                      onChange={(event) => setRenameValue(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={() => commitRename(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename(row.id);
                        if (event.key === "Escape") {
                          setRenamingGroupId(undefined);
                          setRenameValue("");
                        }
                      }}
                      className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[11px] font-semibold outline-none focus:ring-1 focus:ring-[var(--studio-accent)]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => selectRows(ids, target.id, event)}
                      onDoubleClick={() => {
                        setRenamingGroupId(row.id);
                        setRenameValue(row.name);
                      }}
                      className="min-w-0 flex-1 truncate rounded-md py-1.5 text-left text-[11px] font-semibold text-foreground"
                      title="Double-click to rename"
                    >
                      {row.name}
                      <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                        {ids.length}
                      </span>
                    </button>
                  )}
                  <LayerIconButton
                    label={visible ? "Hide group" : "Show group"}
                    active={!visible}
                    onClick={() => onSetGroupVisible(row.id, !visible)}
                  >
                    {visible ? (
                      <IconEye className="size-3.5" />
                    ) : (
                      <IconEyeOff className="size-3.5" />
                    )}
                  </LayerIconButton>
                  <LayerIconButton
                    label={locked ? "Unlock group" : "Lock group"}
                    active={locked}
                    onClick={() => onSetGroupLocked(row.id, !locked)}
                  >
                    {locked ? (
                      <IconLock className="size-3.5" />
                    ) : (
                      <IconLockOpen className="size-3.5" />
                    )}
                  </LayerIconButton>
                </div>
                {collapsed ? null : (
                  <ul
                    className="ml-5 space-y-0.5 pl-1"
                    style={{ borderLeft: "1px solid var(--hairline)" }}
                  >
                    {row.members.map(({ element, index }) => (
                      <ElementLayerRow
                        key={element.id}
                        element={element}
                        index={index}
                        pageCount={page.elements.length}
                        active={selected.has(element.id)}
                        dragging={draggingIds.includes(element.id)}
                        over={overId === element.id}
                        nested
                        onSelect={(event) =>
                          selectRows([element.id], element.id, event)
                        }
                        onDragStart={() => setDraggingIds([element.id])}
                        onDragEnd={endDrag}
                        onDragOver={() => setOverId(element.id)}
                        onDrop={() =>
                          dropLayers(element.id, element.groupId ?? null)
                        }
                        onToggleVisible={() => onToggleVisible(element)}
                        onToggleLocked={() => onToggleLocked(element)}
                        onReorder={(targetIndex) =>
                          onReorder(element, targetIndex)
                        }
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ElementLayerRow({
  element,
  index,
  pageCount,
  active,
  dragging,
  over,
  nested = false,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onToggleVisible,
  onToggleLocked,
  onReorder,
}: {
  element: CreativeElement;
  index: number;
  pageCount: number;
  active: boolean;
  dragging: boolean;
  over: boolean;
  nested?: boolean;
  onSelect(event: React.MouseEvent): void;
  onDragStart(): void;
  onDragEnd(): void;
  onDragOver(): void;
  onDrop(): void;
  onToggleVisible(): void;
  onToggleLocked(): void;
  onReorder(index: number): void;
}) {
  return (
    <li
      draggable={!element.locked}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", element.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`group flex items-center gap-1 rounded-lg pr-1 transition-opacity ${
        dragging ? "opacity-40" : ""
      }`}
      style={{
        backgroundColor: active ? "var(--inset)" : undefined,
        border: `1px solid ${
          over
            ? "var(--studio-accent)"
            : active
              ? "var(--hairline)"
              : "transparent"
        }`,
      }}
    >
      <span
        aria-hidden
        className={`flex w-4 shrink-0 justify-center text-muted-foreground/50 ${
          element.locked ? "opacity-30" : "cursor-grab"
        }`}
      >
        <IconGripVertical className="size-3.5" />
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left transition-colors hover:bg-foreground/[0.04]"
      >
        <LayerPreview element={element} />
        <span
          className={`truncate text-[11px] ${
            element.visible
              ? "text-foreground"
              : "text-muted-foreground/60 line-through"
          }`}
        >
          {elementLabel(element)}
        </span>
      </button>
      {nested ? null : (
        <>
          <LayerIconButton
            label={index === pageCount - 1 ? "" : "Bring forward"}
            disabled={index === pageCount - 1}
            onClick={() => onReorder(index + 1)}
          >
            <IconArrowUp className="size-3.5" />
          </LayerIconButton>
          <LayerIconButton
            label={index === 0 ? "" : "Send backward"}
            disabled={index === 0}
            onClick={() => onReorder(index - 1)}
          >
            <IconArrowDown className="size-3.5" />
          </LayerIconButton>
        </>
      )}
      <LayerIconButton
        label={element.visible ? "Hide layer" : "Show layer"}
        active={!element.visible}
        onClick={onToggleVisible}
      >
        {element.visible ? (
          <IconEye className="size-3.5" />
        ) : (
          <IconEyeOff className="size-3.5" />
        )}
      </LayerIconButton>
      <LayerIconButton
        label={element.locked ? "Unlock layer" : "Lock layer"}
        active={element.locked}
        onClick={onToggleLocked}
      >
        {element.locked ? (
          <IconLock className="size-3.5" />
        ) : (
          <IconLockOpen className="size-3.5" />
        )}
      </LayerIconButton>
    </li>
  );
}

/**
 * A thumbnail of the element itself.
 *
 * Drawn from the document rather than rasterised from the canvas: the data is
 * already here, a real render would cost a canvas per row, and a cached bitmap
 * would go stale the moment the element changed.
 */
function LayerPreview({ element }: { element: CreativeElement }) {
  const box =
    "relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md";
  const wash = { backgroundColor: "var(--inset)" };

  if (element.type === "image") {
    return (
      <span className={box} style={wash}>
        <Image
          src={element.asset.url}
          alt=""
          fill
          unoptimized
          sizes="28px"
          className="object-cover"
        />
      </span>
    );
  }

  if (element.type === "frame") {
    return (
      <span className={box} style={wash}>
        {element.asset ? (
          <Image
            src={element.asset.url}
            alt=""
            fill
            unoptimized
            sizes="28px"
            className="object-cover"
          />
        ) : (
          <svg viewBox="0 0 28 28" className="size-5" aria-hidden>
            <path
              d={frameSvgPath(element.shape, 28, 28, 6)}
              fill={element.fill}
            />
          </svg>
        )}
      </span>
    );
  }

  if (element.type === "text") {
    return (
      <span className={box} style={wash}>
        {/* The text in its own face and colour, which is what tells two
            headlines apart at a glance. */}
        <span
          className="max-w-full truncate px-0.5 text-[7px] leading-none"
          style={{
            fontFamily: `"${element.fontFamily}", sans-serif`,
            fontWeight: Number(element.fontWeight),
            color: element.fill,
          }}
        >
          {element.text.trim().slice(0, 12) || "Aa"}
        </span>
      </span>
    );
  }

  if (element.type === "tag") {
    return (
      <span className={box} style={wash}>
        <span
          className="max-w-full truncate px-1 text-[6px] leading-none"
          style={{
            backgroundColor: element.style.background ?? "transparent",
            color: element.fill,
            borderRadius: element.variant === "plate" ? 2 : 999,
            padding: "2px 3px",
          }}
        >
          {element.text.trim().slice(0, 10) || "@"}
        </span>
      </span>
    );
  }

  if (element.type === "shape") {
    return (
      <span className={box} style={wash}>
        <span
          className="size-4"
          style={{
            backgroundColor: element.fill,
            border:
              element.strokeWidth > 0
                ? `1px solid ${element.stroke}`
                : undefined,
            borderRadius:
              element.shape === "ellipse"
                ? "999px"
                : `${Math.min(6, element.radius / 8)}px`,
          }}
        />
      </span>
    );
  }

  if (element.type === "vector") {
    return (
      <span className={box} style={wash}>
        {/* A recolourable icon is one colour by definition, so a mask shows it
            faithfully; a brand mark is not, so it goes through as an image. */}
        {element.recolorable ? (
          <span
            className="size-4"
            style={{
              backgroundColor: element.fill,
              maskImage: element.assetUrl
                ? `url("${element.assetUrl}")`
                : undefined,
              maskPosition: "center",
              maskRepeat: "no-repeat",
              maskSize: "contain",
            }}
          />
        ) : element.assetUrl ? (
          <Image
            src={element.assetUrl}
            alt=""
            fill
            unoptimized
            sizes="28px"
            className="object-contain p-1"
          />
        ) : (
          <span className="text-[7px] text-muted-foreground">SVG</span>
        )}
      </span>
    );
  }

  if (element.type === "drawing") {
    const bounds = drawingStrokeBounds(element.strokes);
    return (
      <span className={box} style={wash}>
        <svg
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          className="size-6"
          aria-hidden
        >
          {element.strokes.slice(0, 40).map((stroke, index) => {
            const geometry = strokeGeometry(stroke, element.smoothing);
            return (
              <path
                key={index}
                d={geometry.path}
                fill={geometry.filled ? stroke.color : "none"}
                stroke={geometry.filled ? "none" : stroke.color}
                strokeWidth={geometry.filled ? 0 : stroke.width}
                strokeLinecap={geometry.preset.lineCap}
                strokeLinejoin={geometry.preset.lineJoin}
                opacity={stroke.opacity}
              />
            );
          })}
        </svg>
      </span>
    );
  }

  // Pager: the dots it draws, which is the only thing distinguishing two of them.
  if (element.type === "widget" && element.widget === "pager") {
    return (
      <span className={box} style={wash}>
        <span className="flex items-center gap-0.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1 rounded-full"
              style={{
                backgroundColor:
                  dot === 0
                    ? element.props.activeColor
                    : element.props.inactiveColor,
              }}
            />
          ))}
        </span>
      </span>
    );
  }

  // Any other element type (video, tag, …) has no bespoke preview — a neutral
  // swatch, so the layers list never crashes on an unhandled type.
  return <span className={box} style={wash} />;
}

function LayerIconButton({
  children,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-label={label || undefined}
      title={label || undefined}
      aria-hidden={label ? undefined : true}
      tabIndex={label ? undefined : -1}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
      style={active ? { color: "var(--foreground)" } : undefined}
    >
      {children}
    </button>
  );
}
