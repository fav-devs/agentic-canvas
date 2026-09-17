import {
  createStarterCreativeDocument,
  creativeDocumentSchema,
  type CreativeDocument,
  type CreativeMediaAsset,
} from "@agentic-canvas/shared/creative";
import type {
  HydratedStudioProject,
  StudioProjectRepository,
  StudioProjectSummary,
} from "./index.js";

const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const LOCAL_MEDIA_PREFIX = "local:";
const LOCAL_URL_PREFIX = "studio-asset:";

type StoredProject = {
  id: string;
  document: CreativeDocument;
  createdAt: string;
  updatedAt: string;
};

type StoredAsset = {
  key: string;
  projectId: string;
  id: string;
  blob: Blob;
  filename: string;
  mimeType: string;
};

export type LocalStudioRepositoryOptions = {
  databaseName?: string;
  profileId?: string;
};

export function createLocalStudioRepository(
  options: LocalStudioRepositoryOptions = {},
): StudioProjectRepository {
  const databaseName = options.databaseName ?? "studio-local";
  const profileId = options.profileId ?? "local";

  const openDatabase = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      // Version 2 also repairs the short-lived v1 development build, which
      // could leave an empty database behind if hot reload interrupted its
      // first upgrade transaction.
      const request = indexedDB.open(databaseName, 2);
      request.onerror = () =>
        reject(request.error ?? new Error("Studio storage could not open."));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_STORE)) {
          database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          const assets = database.createObjectStore(ASSET_STORE, {
            keyPath: "key",
          });
          assets.createIndex("projectId", "projectId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

  const putProject = async (document: CreativeDocument) => {
    const database = await openDatabase();
    const existing = await requestResult<StoredProject | undefined>(
      database
        .transaction(PROJECT_STORE, "readonly")
        .objectStore(PROJECT_STORE)
        .get(document.id),
    );
    const now = new Date().toISOString();
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(PROJECT_STORE);
    store.put({
      id: document.id,
      document: serializeDocument(document),
      createdAt: existing?.createdAt ?? document.createdAt ?? now,
      updatedAt: now,
    } satisfies StoredProject);
    await done;
    database.close();
  };

  return {
    async list() {
      const database = await openDatabase();
      const projects = await requestResult<StoredProject[]>(
        database
          .transaction(PROJECT_STORE, "readonly")
          .objectStore(PROJECT_STORE)
          .getAll(),
      );
      database.close();
      return projects
        .map(toSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async create(
      input: {
        title?: string;
        kind?: CreativeDocument["kind"];
      } = {},
    ) {
      const document = createStarterCreativeDocument({
        profileId,
        title: input.title,
        kind: input.kind,
      });
      await putProject(document);
      return document;
    },

    async load(id: string): Promise<HydratedStudioProject | null> {
      const database = await openDatabase();
      const project = await requestResult<StoredProject | undefined>(
        database
          .transaction(PROJECT_STORE, "readonly")
          .objectStore(PROJECT_STORE)
          .get(id),
      );
      if (!project) {
        database.close();
        return null;
      }
      const parsed = creativeDocumentSchema.safeParse(project.document);
      if (!parsed.success) {
        database.close();
        throw new Error("This project uses an unsupported document format.");
      }
      const assets = await listAssets(database, id);
      database.close();
      const objectUrls: string[] = [];
      const replacements = new Map<string, CreativeMediaAsset>();
      for (const asset of assets) {
        const url = URL.createObjectURL(asset.blob);
        objectUrls.push(url);
        replacements.set(asset.id, {
          mediaId: `${LOCAL_MEDIA_PREFIX}${asset.id}`,
          url,
          filename: asset.filename,
        });
      }
      return {
        document: hydrateDocument(parsed.data, replacements),
        objectUrls,
      };
    },

    save: putProject,

    async remove(id: string) {
      const database = await openDatabase();
      const assets = await listAssets(database, id);
      const transaction = database.transaction(
        [PROJECT_STORE, ASSET_STORE],
        "readwrite",
      );
      const done = transactionDone(transaction);
      transaction.objectStore(PROJECT_STORE).delete(id);
      const assetStore = transaction.objectStore(ASSET_STORE);
      for (const asset of assets) assetStore.delete(asset.key);
      await done;
      database.close();
    },

    async storeAsset(projectId: string, file: File) {
      const id = crypto.randomUUID();
      const database = await openDatabase();
      const transaction = database.transaction(ASSET_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(ASSET_STORE).put({
        key: `${projectId}:${id}`,
        projectId,
        id,
        blob: file,
        filename: file.name || "asset",
        mimeType: file.type || "application/octet-stream",
      } satisfies StoredAsset);
      await done;
      database.close();
      return {
        mediaId: `${LOCAL_MEDIA_PREFIX}${id}`,
        url: URL.createObjectURL(file),
        filename: file.name || "asset",
      };
    },
  };
}

function toSummary(project: StoredProject): StudioProjectSummary {
  const document = project.document;
  return {
    id: project.id,
    title: document.title,
    kind: document.kind,
    pageCount: document.pages.length,
    width: document.canvas.width,
    height: document.canvas.height,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Studio storage failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Studio storage failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Studio storage stopped."));
  });
}

async function listAssets(database: IDBDatabase, projectId: string) {
  const index = database
    .transaction(ASSET_STORE, "readonly")
    .objectStore(ASSET_STORE)
    .index("projectId");
  return requestResult<StoredAsset[]>(index.getAll(projectId));
}

function localAssetId(mediaId: string) {
  return mediaId.startsWith(LOCAL_MEDIA_PREFIX)
    ? mediaId.slice(LOCAL_MEDIA_PREFIX.length)
    : null;
}

function serializeDocument(document: CreativeDocument) {
  const copy = structuredClone(document);
  visitAssets(copy, (asset) => {
    const id = localAssetId(asset.mediaId);
    return id ? { ...asset, url: `${LOCAL_URL_PREFIX}${id}` } : asset;
  });
  for (const font of copy.fonts) {
    const id = localAssetId(font.id);
    if (id) font.url = `${LOCAL_URL_PREFIX}${id}`;
  }
  return copy;
}

function hydrateDocument(
  document: CreativeDocument,
  replacements: ReadonlyMap<string, CreativeMediaAsset>,
) {
  const copy = structuredClone(document);
  visitAssets(copy, (asset) => {
    const id = localAssetId(asset.mediaId);
    return (id && replacements.get(id)) || asset;
  });
  for (const font of copy.fonts) {
    const id = localAssetId(font.id);
    const replacement = id ? replacements.get(id) : undefined;
    if (replacement) {
      font.id = replacement.mediaId;
      font.url = replacement.url;
    }
  }
  return copy;
}

function visitAssets(
  document: CreativeDocument,
  replace: (asset: CreativeMediaAsset) => CreativeMediaAsset,
) {
  for (const page of document.pages) {
    for (const element of page.elements) {
      if (element.type === "image") {
        element.asset = replace(element.asset);
      }
      if (element.type === "frame" && element.asset) {
        element.asset = replace(element.asset);
      }
    }
  }
}
