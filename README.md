# Agentic Canvas

> **The name is temporary.** “Agentic Canvas” describes the idea well enough
> for now, but it is not necessarily the final project name.

Agentic Canvas is a local-first, open-source visual editor for social graphics,
carousels, and video scenes. It works like the design editors people already
understand: add text and media, arrange layers, group objects, work across
pages, and export the result. The difference is that its document model and
editing commands are also designed to be understood and safely operated by AI
agents.

You do not need an account, a hosted backend, or an AI provider to use the
standard editor. Projects and imported assets remain in your browser unless
you choose to export them.

[**Try the free public demo →**](https://app.sociona.app/studio/free/new)

## Why this repository exists

I originally built this editor as a feature inside
[Sociona](https://www.sociona.app), my social media application. What began as
a way to create graphics without leaving the app gradually became a full visual
workspace: a Canva-like editor with multi-page carousels, seamless spreads,
frames, image effects, layers, grouping, video scenes, and an agent that could
reason about the same document the user was editing.

At some point it stopped feeling like a small feature. It had become a useful
product of its own.

There are many people who need a capable design canvas without needing the rest
of a social media platform, and there are developers exploring what creative
software looks like when humans and agents can work on the same structured
document. I decided the editor would be more useful in public than locked
inside my application, so I extracted its reusable core and released it here.

The Sociona version remains a convenient hosted demo. This repository is the
independent, local-first version: no Sociona account, billing system, publishing
workflow, or private services are required.

I will do my best to maintain the project as it develops. It is still early,
some edges are rough, and contributions are welcome.

## What it can do

- Freeform editing for text, images, SVG graphics, stickers, GIFs, and drawings
- Shapes, image frames, crop controls, filters, effects, and background removal
- Multi-select, grouping, named layer groups, locking, visibility, and ordering
- Multi-page image, carousel, and video projects
- Seamless spread mode for artwork that crosses carousel page boundaries
- Browser-local project, asset, and custom-font persistence
- PNG, carousel ZIP, and browser-side MP4 export
- Undo and redo with a typed command-based document model
- Responsive desktop and mobile editing shells
- Optional host interfaces for assistants, cloud assets, version history,
  sharing, and publishing

## What “agentic” means here

The canvas is not an image-generation wrapper. It is a structured editor.

Every page and element is represented in a typed document model. Edits are
expressed as validated commands, so an agent can inspect a design, make bounded
changes, and join the same undo history as a human edit. The editor remains
useful without an agent, while applications that have an AI backend can provide
one through the `StudioHost` boundary.

Agentic Canvas deliberately does not bundle a particular model vendor, API key
flow, or chat product. Those are host concerns rather than requirements of the
canvas.

## Run locally

Requirements:

- Node.js 22 or newer
- pnpm 10
- A modern browser with IndexedDB, Canvas, and Web Worker support

```bash
git clone https://github.com/fav-devs/agentic-canvas.git
cd agentic-canvas
pnpm install
pnpm dev
```

Open [http://localhost:3010](http://localhost:3010).

Useful checks:

```bash
pnpm check-types
pnpm build
```

## How it is built

- **Next.js 16 and React 19** provide the application shell and editor UI.
- **TypeScript and Zod** define and validate the creative document format and
  command protocol.
- **Fabric.js** powers interactive canvas rendering, selection, transforms,
  cropping, and object manipulation.
- **IndexedDB** stores local projects, imported assets, and fonts without an
  account or server.
- **Mediabunny and browser media APIs** render video projects locally.
- **ONNX Runtime Web and Web Workers** support optional in-browser background
  removal while keeping expensive work away from the UI thread.
- **Tailwind CSS and Radix primitives** provide styling and accessible interface
  foundations.

## Architecture

```text
apps/studio
  Standalone Next.js application and the complete visual editor

packages/shared
  Creative document schemas, element types, commands, and reducers

packages/studio
  StudioHost contracts plus the local IndexedDB implementation
```

The canvas core does not know whether it is running locally, inside a hosted
product, or eventually inside a desktop shell. External capabilities enter
through `StudioHost`:

- `StudioProjectRepository` for loading and saving projects
- `StudioAssetProvider` for imported or hosted media
- `StudioAssistantProvider` for agent-driven edits
- `StudioVersionProvider` for snapshots and restoration
- `StudioPublishProvider` for sharing and downstream publishing

The included local host implements project and asset storage. Hosted products
can opt into the other interfaces without adding account or backend assumptions
to the editor itself.

## Direction

The immediate goal is to make the extracted editor easier to understand,
extend, and embed while preserving the capabilities of the original product.
Areas I want to improve include:

- A documented agent command protocol and reference assistant adapter
- Reusable components and richer nested layer groups
- More templates, frames, shapes, and open graphic sources
- A portable project file format with import and export
- Better tests for rendering parity and complex canvas interactions
- Performance improvements for long carousels and media-heavy projects
- Clear extension points for storage, model, and publishing providers

The editor should remain valuable as an ordinary design tool. Agentic features
should extend direct manipulation, not replace it.

## Contributing

Issues, focused pull requests, documentation fixes, and experiments are
welcome. If you are proposing a large architectural change, opening an issue
first will make it easier to align on the document model and host boundaries.

Please do not commit API keys, private media, model credentials, or application
secrets. The default local app should continue to run without them.

## License

[MIT](./LICENSE)
