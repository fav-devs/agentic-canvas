# Agentic Canvas

The standalone, local-first Next.js host for the Studio editor.

## Run it

From the repository root:

```bash
pnpm install
pnpm --filter @agentic-canvas/web dev
```

Open <http://localhost:3010>. Projects, uploaded assets, and fonts are stored in
the browser with IndexedDB. No backend or account is required for the local
editing and export workflow.

## Architecture

- `@agentic-canvas/shared/creative` owns the document schema and command reducer.
- `@agentic-canvas/studio` defines the host persistence contract and local IndexedDB adapter.
- `apps/studio` owns the standalone project library and editor host.
- `StudioHost` is the only boundary for persistence, assets, assistants,
  versioning, sharing, and publishing.

Hosted capabilities such as the AI assistant, cloud media, public sharing,
server rendering, and version history are intentionally separate from the local
core. The local host omits them entirely instead of shipping private service
clients in the browser bundle.
