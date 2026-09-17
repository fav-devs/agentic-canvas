import { createLocalStudioHost } from "@agentic-canvas/studio";

export const studioHost = createLocalStudioHost({
  profileId: "local",
});

export const studioRepository = studioHost.projects;
