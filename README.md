# Agentic Canvas

Agentic Canvas is a local-first, open-source visual design studio for creating
social graphics, carousels, and video scenes with human and AI-assisted editing.

The project is being extracted from the production editor that powers PostPal.
The public core is intentionally separated from PostPal accounts, billing,
cloud media, publishing, and other hosted services.

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

The independent build is currently being completed. Until the extraction audit
is finished, the default branch contains only code that has been reviewed for
public release.

## License

MIT
