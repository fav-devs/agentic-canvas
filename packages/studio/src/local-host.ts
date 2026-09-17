import {
  createLocalStudioRepository,
  type LocalStudioRepositoryOptions,
} from "./local-repository";
import type { StudioHost } from "./index";

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
