import { createLocalStudioHost } from "@stencil/studio";

export const studioHost = createLocalStudioHost({
  profileId: "local",
});

export const studioRepository = studioHost.projects;
