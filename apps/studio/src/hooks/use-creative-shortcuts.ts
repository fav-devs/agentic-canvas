"use client";

import { useEffect, useRef } from "react";

export type CreativeShortcutHandlers = {
  onUndo(): void;
  onRedo(): void;
  onDelete(): void;
  onDuplicate(): void;
  onCut?(): void;
  /** Return true when Studio handled the shortcut and native copy should stop. */
  onCopy(): boolean;
  /** Return true when Studio handled the shortcut and native paste should stop. */
  onPaste(): boolean;
  onSelectAll?(): void;
  onGroup?(): void;
  onUngroup?(): void;
  onDeselect(): void;
  onNudge(dx: number, dy: number): void;
  onPreviousPage(): void;
  onNextPage(): void;
  /** B for brush, E for eraser, V back to select — the usual editor bindings. */
  onPickTool?(tool: "select" | "draw" | "erase"): void;
};

/**
 * True when the keystroke belongs to whatever the user is typing into — a form
 * field, a contenteditable, or Fabric's own hidden textarea while a text object
 * is in edit mode. Canvas shortcuts must never steal those.
 */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Editor keyboard shortcuts, bound while the Studio canvas is mounted. */
export function useCreativeShortcuts(
  handlerProps: CreativeShortcutHandlers,
  enabled = true,
) {
  // Held in a ref so the listener is bound once rather than on every render of
  // the workspace (whose handlers are re-created each time).
  const handlersRef = useRef(handlerProps);
  handlersRef.current = handlerProps;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const handlers = handlersRef.current;
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) handlers.onRedo();
        else handlers.onUndo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handlers.onRedo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handlers.onDuplicate();
        return;
      }
      if (modifier && event.key.toLowerCase() === "c") {
        if (handlers.onCopy()) event.preventDefault();
        return;
      }
      if (modifier && event.key.toLowerCase() === "x") {
        event.preventDefault();
        handlers.onCut?.();
        return;
      }
      if (modifier && event.key.toLowerCase() === "v") {
        if (handlers.onPaste()) event.preventDefault();
        return;
      }
      if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        handlers.onSelectAll?.();
        return;
      }
      if (modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) handlers.onUngroup?.();
        else handlers.onGroup?.();
        return;
      }
      if (modifier) return;

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        handlers.onDelete();
        return;
      }
      if (event.key === "Escape") {
        handlers.onDeselect();
        return;
      }

      // Single-letter tool switches, only when nothing is being typed into —
      // which `isTypingTarget` has already established above.
      if (handlers.onPickTool && !event.shiftKey && !event.altKey) {
        const tool = { b: "draw", e: "erase", v: "select" } as const;
        const picked = tool[event.key.toLowerCase() as keyof typeof tool];
        if (picked) {
          event.preventDefault();
          handlers.onPickTool(picked);
          return;
        }
      }

      const step = event.shiftKey ? 10 : 1;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          handlers.onNudge(-step, 0);
          return;
        case "ArrowRight":
          event.preventDefault();
          handlers.onNudge(step, 0);
          return;
        case "ArrowUp":
          event.preventDefault();
          handlers.onNudge(0, -step);
          return;
        case "ArrowDown":
          event.preventDefault();
          handlers.onNudge(0, step);
          return;
        case "PageUp":
          event.preventDefault();
          handlers.onPreviousPage();
          return;
        case "PageDown":
          event.preventDefault();
          handlers.onNextPage();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
