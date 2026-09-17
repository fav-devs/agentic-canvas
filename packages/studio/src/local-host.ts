import {
  createLocalStudioRepository,
  type LocalStudioRepositoryOptions,
} from "./local-repository.js";
import type { StudioHost } from "./index.js";

export function createLocalStudioHost(
  options: LocalStudioRepositoryOptions = {},
): StudioHost {
  const projects = createLocalStudioRepository(options);
  return {
    mode: "local",
    capabilities: {
      assistant: false,
      cloudMedia: false,
      publicSharing: false,
      serverRendering: false,
      versionHistory: false,
    },
    projects,
    assets: {
      store: (projectId, file) => projects.storeAsset(projectId, file),
    },
  };
}
