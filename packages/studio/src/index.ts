import type {
  CreativeDocument,
  CreativeMediaAsset,
} from "@agentic-canvas/shared/creative";

export type StudioProjectSummary = {
  id: string;
  title: string;
  kind: CreativeDocument["kind"];
  pageCount: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};

export type HydratedStudioProject = {
  document: CreativeDocument;
  objectUrls: string[];
};

/**
 * Persistence boundary consumed by a Studio host.
 *
 * The editor does not need to know whether projects live in IndexedDB, a
 * filesystem-backed desktop shell, or a hosted database. The standalone app
 * ships the IndexedDB implementation; hosted products can provide cloud adapters.
 */
export interface StudioProjectRepository {
  list(): Promise<StudioProjectSummary[]>;
  create(input?: {
    title?: string;
    kind?: CreativeDocument["kind"];
  }): Promise<CreativeDocument>;
  load(id: string): Promise<HydratedStudioProject | null>;
  save(document: CreativeDocument): Promise<void>;
  remove(id: string): Promise<void>;
  storeAsset(projectId: string, file: File): Promise<CreativeMediaAsset>;
}

export type StudioCapabilities = {
  assistant: boolean;
  cloudMedia: boolean;
  publicSharing: boolean;
  serverRendering: boolean;
  versionHistory: boolean;
};

export type StudioMediaItem = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
};

export interface StudioAssetProvider {
  store(projectId: string, file: File): Promise<CreativeMediaAsset>;
  list?(input?: {
    query?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: StudioMediaItem[]; total: number }>;
}

export interface StudioVersionProvider {
  snapshot(projectId: string, label?: string): Promise<string>;
  restore(projectId: string, versionId: string): Promise<CreativeDocument>;
}

export interface StudioAssistantProvider {
  run(input: {
    projectId: string;
    document: CreativeDocument;
    prompt: string;
  }): Promise<{ commands: unknown[] }>;
}

export interface StudioPublishProvider {
  share?(projectId: string): Promise<{ url: string }>;
  sendToComposer?(files: File[]): Promise<void>;
}

/**
 * Everything outside the canvas core enters through this host boundary. A
 * browser-only build supplies only repository/assets; SaaS products can opt in
 * to versions, assistants, sharing, and publishing without changing the editor.
 */
export interface StudioHost {
  mode: "local" | "hosted";
  capabilities: StudioCapabilities;
  projects: StudioProjectRepository;
  assets: StudioAssetProvider;
  versions?: StudioVersionProvider;
  assistant?: StudioAssistantProvider;
  publishing?: StudioPublishProvider;
}

export const LOCAL_STUDIO_CAPABILITIES: StudioCapabilities = {
  assistant: false,
  cloudMedia: false,
  publicSharing: false,
  serverRendering: false,
  versionHistory: false,
};

export {
  createLocalStudioRepository,
  type LocalStudioRepositoryOptions,
} from "./local-repository";
export { createLocalStudioHost } from "./local-host";
