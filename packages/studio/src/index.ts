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
} from "./local-repository.js";
