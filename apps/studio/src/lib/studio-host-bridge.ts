/**
 * Temporary React adapter for the extracted editor. All hosted capabilities
 * terminate here until their StudioHost providers are supplied by an embedding
 * application. The local app never calls these branches.
 */

const unavailable = async (..._args: any[]): Promise<any> => {
  throw new Error("This capability is not configured by the Studio host.");
};

const mutation: any = {
  mutate: (..._args: any[]) => undefined,
  mutateAsync: unavailable,
  isPending: false,
};

export const useOptionalProfileContext = (..._args: any[]): any => null;
export const useMediaUpload = (..._args: any[]): any => mutation;
export const useMediaList = (..._args: any[]): any => ({
  data: undefined,
  isLoading: false,
});
export const uploadMediaDirect = unavailable;

export const useCreativeDocumentRecord = (..._args: any[]): any => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: async () => ({ data: undefined }),
});
export const useSaveCreativeDocument = (..._args: any[]): any => mutation;
export const usePatchCreativeDocument = (..._args: any[]): any => mutation;
export const useSnapshotCreativeVersion = (..._args: any[]): any => mutation;
export const useRestoreCreativeVersion = (..._args: any[]): any => mutation;
export const useCreativeVersions = (..._args: any[]): any => ({
  data: [],
  isLoading: false,
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
  }
}

export async function post<T = unknown>(..._args: any[]): Promise<T> {
  throw new Error("This capability is not configured by the Studio host.");
}

type LocalAppState = { studioTemplateSeed: null };
const localState: LocalAppState & { mutate(input: unknown): void } = {
  studioTemplateSeed: null,
  mutate: () => undefined,
};

export const appStore = Object.assign(
  (selector: (state: LocalAppState) => unknown) => selector(localState),
  { getState: () => localState },
);

export type CreativeVersionSource = "ai" | "manual" | "restore" | "auto";
export type CreativeVersion = {
  id: string;
  label?: string | null;
  source: CreativeVersionSource;
  createdAt: string;
  revision: number;
};
