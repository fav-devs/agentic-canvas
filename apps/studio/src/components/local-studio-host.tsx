"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreativeDocument } from "@stencil/shared/creative";
import type { GuestCreativeWorkspace } from "@/components/creative/creative-workspace";
import { studioHost } from "./studio-repository";

const CreativeWorkspace = dynamic(
  () =>
    import("@/components/creative/creative-workspace").then(
      (module) => module.CreativeWorkspace,
    ),
  {
    ssr: false,
    loading: () => <StudioLoading label="Opening project…" />,
  },
);

export function LocalStudioHost({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [document, setDocument] = useState<CreativeDocument>();
  const [error, setError] = useState<string>();
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    void studioHost.projects
      .load(projectId)
      .then((project) => {
        if (!active) {
          project?.objectUrls.forEach(URL.revokeObjectURL);
          return;
        }
        if (!project) {
          setError("This local project does not exist.");
          return;
        }
        objectUrlsRef.current = project.objectUrls;
        setDocument(project.document);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The project could not open.",
          );
        }
      });
    return () => {
      active = false;
      objectUrlsRef.current.forEach(URL.revokeObjectURL);
      objectUrlsRef.current = [];
    };
  }, [projectId]);

  const saveDocument = useCallback((next: CreativeDocument) => {
    setDocument(next);
    void studioHost.projects.save(next).catch(() => {
      setError("The latest change could not be saved in this browser.");
    });
  }, []);

  const storeAsset = useCallback(
    (file: File) => studioHost.assets.store(projectId, file),
    [projectId],
  );

  const guest = useMemo<GuestCreativeWorkspace | undefined>(
    () =>
      document
        ? {
            edition: "local",
            initialDocument: document,
            exportCount: 0,
            exportLimit: Number.MAX_SAFE_INTEGER,
            maxPages: Number.MAX_SAFE_INTEGER,
            onDocumentChange: saveDocument,
            onStoreAsset: storeAsset,
            onExportComplete: async () => undefined,
            onRequireAccount: () => {
              setError(
                "This hosted feature is not enabled in the local edition yet.",
              );
            },
          }
        : undefined,
    [document, saveDocument, storeAsset],
  );

  if (error && !guest) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] px-6 text-center text-foreground">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold">Project unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.push("/studio")}
            className="mt-5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
            Back to projects
          </button>
        </div>
      </main>
    );
  }

  if (!guest) return <StudioLoading label="Loading local assets…" />;

  return (
    <div className="relative h-dvh overflow-hidden bg-[var(--canvas)]">
      <CreativeWorkspace documentId={projectId} guest={guest} />
      {error ? (
        <div
          className="fixed bottom-3 left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-[var(--tray)] px-4 py-2 text-xs text-foreground shadow-xl"
          style={{ border: "1px solid var(--hairline)" }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function StudioLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--canvas)] text-sm text-muted-foreground">
      {label}
    </div>
  );
}
