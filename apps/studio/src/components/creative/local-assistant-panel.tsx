import type { CreativeCommandInput } from "@/lib/creative/commands";

export type StudioClientAction =
  | { type: "remove-background"; elementId: string }
  | { type: "render"; pageId?: string };

export function StudioAssistantPanel({
  onApplyCommands: _onApplyCommands,
}: {
  documentId: string;
  documentTitle: string;
  canvas: { width: number; height: number };
  pageCount: number;
  activePageId?: string;
  resolveClientTool?: (toolName: string, input: unknown) => Promise<unknown>;
  onRunFinish(): void;
  onApplyCommands(commands: CreativeCommandInput[]): void;
  onClientAction?(action: StudioClientAction): void;
}) {
  return (
    <div className="p-4 text-xs leading-5 text-muted-foreground">
      Connect an assistant provider through the Studio host to enable agentic
      editing.
    </div>
  );
}
