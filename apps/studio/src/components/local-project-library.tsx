"use client";

import {
  IconCarouselHorizontal,
  IconMovie,
  IconPhoto,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { StudioProjectSummary } from "@agentic-canvas/studio";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { studioRepository } from "./studio-repository";

const PROJECT_KINDS = [
  {
    kind: "carousel" as const,
    label: "Carousel",
    detail: "A connected set of social slides",
    icon: IconCarouselHorizontal,
  },
  {
    kind: "image" as const,
    label: "Image",
    detail: "A single still design",
    icon: IconPhoto,
  },
  {
    kind: "video" as const,
    label: "Video",
    detail: "Scenes, motion and sound",
    icon: IconMovie,
  },
];

export function LocalProjectLibrary() {
  const router = useRouter();
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setProjects(await studioRepository.list());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Projects could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProject = async (kind: "carousel" | "image" | "video") => {
    setCreating(kind);
    try {
      const document = await studioRepository.create({ kind });
      router.push(`/studio/${document.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Project could not be created.",
      );
      setCreating(undefined);
    }
  };

  const removeProject = async (project: StudioProjectSummary) => {
    if (!window.confirm(`Delete “${project.title}”? This cannot be undone.`)) {
      return;
    }
    await studioRepository.remove(project.id);
    await refresh();
    toast.success("Project deleted");
  };

  return (
    <main className="min-h-dvh bg-[var(--canvas)] text-foreground">
      <header
        className="border-b px-5 py-4 sm:px-8"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Local-first
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              Studio
            </h1>
          </div>
          <span
            className="rounded-full border px-3 py-1.5 text-[11px] text-muted-foreground"
            style={{ borderColor: "var(--hairline)" }}
          >
            Saved in this browser
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <section aria-labelledby="new-project-heading">
          <div className="max-w-xl">
            <h2
              id="new-project-heading"
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Make something worth sharing.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Start locally. Your projects and uploads stay in this browser
              unless you export them.
            </p>
          </div>

          <div className="mt-7 grid gap-2 sm:grid-cols-3">
            {PROJECT_KINDS.map(({ kind, label, detail, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                disabled={Boolean(creating)}
                onClick={() => void createProject(kind)}
                className="group flex min-h-28 items-start gap-4 rounded-2xl p-4 text-left transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-foreground/[0.04] disabled:cursor-wait disabled:opacity-50"
                style={{ border: "1px solid var(--hairline)" }}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background">
                  {creating === kind ? (
                    <IconPlus className="size-5 animate-pulse" />
                  ) : (
                    <Icon className="size-5" stroke={1.7} />
                  )}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="projects-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="projects-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Projects
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {projects.length}
            </span>
          </div>

          {loading ? (
            <div
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Loading projects"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <span
                  key={index}
                  className="h-36 animate-pulse rounded-2xl bg-foreground/[0.04]"
                />
              ))}
            </div>
          ) : projects.length ? (
            <div
              className="mt-4 divide-y"
              style={{ borderColor: "var(--hairline)" }}
            >
              {projects.map((project) => {
                const Icon =
                  PROJECT_KINDS.find((entry) => entry.kind === project.kind)
                    ?.icon ?? IconPhoto;
                return (
                  <article
                    key={project.id}
                    className="group flex items-center gap-4 py-4"
                  >
                    <Link
                      href={`/studio/${project.id}`}
                      className="grid size-14 shrink-0 place-items-center rounded-xl bg-foreground/[0.045] transition-colors group-hover:bg-foreground/[0.075]"
                      aria-label={`Open ${project.title}`}
                    >
                      <Icon
                        className="size-5 text-muted-foreground"
                        stroke={1.7}
                      />
                    </Link>
                    <Link
                      href={`/studio/${project.id}`}
                      className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <h3 className="truncate text-sm font-semibold">
                        {project.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {project.pageCount}{" "}
                        {project.pageCount === 1 ? "page" : "pages"} ·{" "}
                        {project.width} × {project.height} · Updated{" "}
                        {formatDate(project.updatedAt)}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeProject(project)}
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Delete ${project.title}`}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              className="mt-4 flex min-h-44 items-center justify-center rounded-2xl border border-dashed px-6 text-center"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div>
                <IconPlus className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No projects yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a format above to open a blank canvas.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(value).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(new Date(value));
}
