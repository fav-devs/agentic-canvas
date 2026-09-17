"use client";

import type { ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

/**
 * The three-pane desktop layout. Narrower viewports never reach this shell —
 * the workspace hands them the immersive mobile shell instead — so there is no
 * stacked fallback here.
 */
export function CreativeWorkspaceShell({
  tools,
  canvas,
  inspector,
}: {
  tools: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
}) {
  return (
    <section className="min-h-0 flex-1 overflow-hidden bg-[var(--tray)]">
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="stencil-creative-workspace"
        className="min-h-0"
      >
        <ResizablePanel defaultSize={20} minSize={14} maxSize={32}>
          <div className="h-full min-w-0 overflow-hidden">{tools}</div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label="Resize creative tools"
          className="z-20 w-1 bg-[var(--hairline)] after:w-2 hover:bg-foreground/15"
        />
        <ResizablePanel defaultSize={56} minSize={36}>
          <div className="h-full min-w-0">{canvas}</div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label="Resize properties panel"
          className="z-20 w-1 bg-[var(--hairline)] after:w-2 hover:bg-foreground/15"
        />
        <ResizablePanel defaultSize={24} minSize={18} maxSize={36}>
          <aside className="h-full min-w-0 overflow-y-auto p-4">
            {inspector}
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
}
