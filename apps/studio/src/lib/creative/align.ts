/**
 * Alignment + snapping maths for the Studio canvas.
 *
 * Pure functions over axis-aligned boxes in *document* coordinates (the same
 * space element x/y/width/height live in), so the same logic drives the
 * inspector's align buttons and the drag-time snapping in the Fabric stage.
 * Rotation is deliberately ignored: the inspector reports the unrotated box,
 * and aligning by the visual bounding box of a rotated element surprises people
 * more often than it helps.
 */

export type CreativeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CreativeFrame = { width: number; height: number };

export type AlignEdge =
  "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

export type SnapGuide = {
  orientation: "vertical" | "horizontal";
  /** Document-space coordinate of the guide line. */
  position: number;
};

export const DEFAULT_SNAP_THRESHOLD = 12;

/** Position changes that align `box` to one edge/axis of the canvas frame. */
export function alignBoxToFrame(
  box: CreativeBox,
  frame: CreativeFrame,
  edge: AlignEdge,
): { x?: number; y?: number } {
  switch (edge) {
    case "left":
      return { x: 0 };
    case "center-x":
      return { x: Math.round((frame.width - box.width) / 2) };
    case "right":
      return { x: Math.round(frame.width - box.width) };
    case "top":
      return { y: 0 };
    case "center-y":
      return { y: Math.round((frame.height - box.height) / 2) };
    case "bottom":
      return { y: Math.round(frame.height - box.height) };
  }
}

type Axis = {
  /** Lines on the moving box, in document space. */
  candidates: number[];
  /** Lines it can snap to. */
  targets: number[];
};

function bestSnap(axis: Axis, threshold: number) {
  let delta = 0;
  let guide: number | undefined;
  let distance = threshold;

  for (const candidate of axis.candidates) {
    for (const target of axis.targets) {
      const gap = target - candidate;
      const magnitude = Math.abs(gap);
      // `<` keeps the first (edge-before-centre) match on ties, which reads as
      // less jumpy than letting a later target win by a hair.
      if (magnitude < distance) {
        distance = magnitude;
        delta = gap;
        guide = target;
      }
    }
  }

  return { delta, guide };
}

/**
 * Nudge `box` onto the nearest canvas or sibling alignment line within
 * `threshold`, and report the guides that should be drawn while dragging.
 */
export function snapBox(
  box: CreativeBox,
  options: {
    frame: CreativeFrame;
    others: CreativeBox[];
    threshold?: number;
  },
): { x: number; y: number; guides: SnapGuide[] } {
  const threshold = options.threshold ?? DEFAULT_SNAP_THRESHOLD;
  const { frame, others } = options;

  const horizontal = bestSnap(
    {
      candidates: [box.x, box.x + box.width / 2, box.x + box.width],
      targets: [
        0,
        frame.width / 2,
        frame.width,
        ...others.flatMap((other) => [
          other.x,
          other.x + other.width / 2,
          other.x + other.width,
        ]),
      ],
    },
    threshold,
  );

  const vertical = bestSnap(
    {
      candidates: [box.y, box.y + box.height / 2, box.y + box.height],
      targets: [
        0,
        frame.height / 2,
        frame.height,
        ...others.flatMap((other) => [
          other.y,
          other.y + other.height / 2,
          other.y + other.height,
        ]),
      ],
    },
    threshold,
  );

  const guides: SnapGuide[] = [];
  if (horizontal.guide !== undefined) {
    guides.push({ orientation: "vertical", position: horizontal.guide });
  }
  if (vertical.guide !== undefined) {
    guides.push({ orientation: "horizontal", position: vertical.guide });
  }

  return {
    x: box.x + horizontal.delta,
    y: box.y + vertical.delta,
    guides,
  };
}
