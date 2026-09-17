# Agentic Canvas

Agentic Canvas is a local-first, open-source visual design studio for creating
social graphics, carousels, and video scenes with human and AI-assisted editing.

The standalone editor is separated from accounts, billing, cloud media,
publishing, and other hosted services through explicit provider interfaces.

## Run locally

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3010>. Projects and imported assets stay in IndexedDB
unless you export them.

## Direction

- Freeform canvas editing with text, images, shapes, frames, stickers, and GIFs
- Multi-page and seamless carousel layouts
- Grouping, layers, reusable components, and precise export
- Browser-local projects and assets by default
- A typed document model that agents and people can edit together
- Optional provider interfaces for AI and hosted integrations

## Repository structure

```text
apps/studio       Standalone Next.js application
packages/shared   Canvas document model and command schema
packages/studio   Local persistence and host capability contracts
```

The local host is fully runnable. Assistant, version-history, cloud-media,
sharing, and publishing integrations are optional `StudioHost` providers and
are not included in the local browser bundle.

## License

MIT
