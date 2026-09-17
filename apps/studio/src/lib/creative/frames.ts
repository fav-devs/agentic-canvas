/**
 * Image frames — shaped placeholders an image is dropped into and clipped by.
 *
 * The geometry here is pure so it can be tested and shared: the canvas renderer
 * traces the same shapes, and the inspector uses the same placement maths to
 * show what a crop will look like.
 */

export type CreativeFrameShape =
  | "rectangle"
  | "rounded"
  | "circle"
  | "arch"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "star"
  | "heart"
  | "blob"
  | "postage"
  | "postage-circle"
  | "squircle"
  | "pill"
  | "pentagon"
  | "octagon"
  | "burst"
  | "cloud"
  | "shield"
  | "ticket"
  | "polaroid"
  | "polaroid-landscape"
  | "photo-border"
  | "filmstrip";

export const FRAME_SHAPES = [
  "rectangle",
  "rounded",
  "circle",
  "arch",
  "triangle",
  "diamond",
  "hexagon",
  "star",
  "heart",
  "blob",
  "postage",
  "postage-circle",
  "squircle",
  "pill",
  "pentagon",
  "octagon",
  "burst",
  "cloud",
  "shield",
  "ticket",
  "polaroid",
  "polaroid-landscape",
  "photo-border",
  "filmstrip",
] as const satisfies readonly CreativeFrameShape[];

export const FRAME_SHAPE_LABELS: Record<CreativeFrameShape, string> = {
  rectangle: "Square",
  rounded: "Rounded",
  circle: "Circle",
  arch: "Arch",
  triangle: "Triangle",
  diamond: "Diamond",
  hexagon: "Hexagon",
  star: "Star",
  heart: "Heart",
  blob: "Blob",
  postage: "Stamp",
  "postage-circle": "Stamp circle",
  squircle: "Squircle",
  pill: "Pill",
  pentagon: "Pentagon",
  octagon: "Octagon",
  burst: "Burst",
  cloud: "Cloud",
  shield: "Shield",
  ticket: "Ticket",
  polaroid: "Polaroid",
  "polaroid-landscape": "Wide Polaroid",
  "photo-border": "Photo border",
  filmstrip: "Film strip",
};

export type FramePoint = [x: number, y: number];

/**
 * Vertices for the straight-edged shapes, in a `width` × `height` box.
 * Returns null for shapes that need curves (traced by the renderer instead).
 */
export function framePolygonPoints(
  shape: CreativeFrameShape,
  width: number,
  height: number,
): FramePoint[] | null {
  switch (shape) {
    case "triangle":
      return [
        [width / 2, 0],
        [width, height],
        [0, height],
      ];
    case "diamond":
      return [
        [width / 2, 0],
        [width, height / 2],
        [width / 2, height],
        [0, height / 2],
      ];
    case "hexagon":
      return [
        [width * 0.25, 0],
        [width * 0.75, 0],
        [width, height / 2],
        [width * 0.75, height],
        [width * 0.25, height],
        [0, height / 2],
      ];
    case "pentagon":
      return radialPoints(width, height, 5);
    case "octagon":
      return radialPoints(width, height, 8);
    case "burst":
      return radialPoints(width, height, 12, 0.72);
    case "shield":
      return [
        [width * 0.5, height],
        [width * 0.12, height * 0.66],
        [width * 0.06, height * 0.12],
        [width * 0.5, 0],
        [width * 0.94, height * 0.12],
        [width * 0.88, height * 0.66],
      ];
    case "ticket":
      return ticketPoints(width, height);
    case "star":
      return starPoints(width, height);
    case "postage":
      return postagePoints(width, height);
    case "postage-circle":
      return postageCirclePoints(width, height);
    default:
      return null;
  }
}

/** Five-pointed star, first point at 12 o'clock. */
function starPoints(width: number, height: number): FramePoint[] {
  const points: FramePoint[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const innerRatio = 0.42;

  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    const radius = index % 2 === 0 ? 1 : innerRatio;
    points.push([
      centerX + Math.cos(angle) * centerX * radius,
      centerY + Math.sin(angle) * centerY * radius,
    ]);
  }
  return points;
}

function radialPoints(
  width: number,
  height: number,
  corners: number,
  innerRatio = 1,
): FramePoint[] {
  const count = innerRatio === 1 ? corners : corners * 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const ratio = innerRatio === 1 || index % 2 === 0 ? 1 : innerRatio;
    return [
      width / 2 + Math.cos(angle) * (width / 2) * ratio,
      height / 2 + Math.sin(angle) * (height / 2) * ratio,
    ];
  });
}

function ticketPoints(width: number, height: number): FramePoint[] {
  const notch = Math.min(width, height) * 0.13;
  return [
    [0, 0],
    [width, 0],
    [width, height * 0.34],
    [width - notch, height / 2],
    [width, height * 0.66],
    [width, height],
    [0, height],
    [0, height * 0.66],
    [notch, height / 2],
    [0, height * 0.34],
  ];
}

/**
 * How deep a perforation bites into the stamp, and how finely each notch is
 * approximated. A notch is a semicircle, so four segments per notch is enough to
 * read as round at the sizes a stamp is used at, and keeps the point count for a
 * whole stamp in the low hundreds rather than the thousands.
 */
const PERFORATION_SEGMENTS = 4;

/**
 * Perforations along one edge, bulging inward.
 *
 * Notch size comes from the shorter side of the frame rather than the edge being
 * walked, so a tall stamp and a wide one get the same size of tooth instead of
 * stretched ones on the long edges.
 */
function perforatedEdge(
  from: FramePoint,
  to: FramePoint,
  notch: number,
  inward: FramePoint,
): FramePoint[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];

  // A whole number of notches per edge, so corners land on a tooth boundary.
  const count = Math.max(3, Math.round(length / (notch * 2)));
  const step = length / count;
  const alongX = dx / length;
  const alongY = dy / length;
  const points: FramePoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const baseX = from[0] + alongX * step * index;
    const baseY = from[1] + alongY * step * index;
    for (let segment = 0; segment < PERFORATION_SEGMENTS; segment += 1) {
      const t = segment / PERFORATION_SEGMENTS;
      // sin gives the semicircle; half the step is its radius, so neighbouring
      // notches meet exactly rather than overlapping or leaving a flat.
      const bulge = Math.sin(Math.PI * t) * (step / 2);
      points.push([
        baseX + alongX * step * t + inward[0] * bulge,
        baseY + alongY * step * t + inward[1] * bulge,
      ]);
    }
  }
  return points;
}

/** A postage stamp: perforated on all four edges. */
function postagePoints(width: number, height: number): FramePoint[] {
  const notch = Math.max(3, Math.min(width, height) / 22);
  return [
    ...perforatedEdge([0, 0], [width, 0], notch, [0, 1]),
    ...perforatedEdge([width, 0], [width, height], notch, [-1, 0]),
    ...perforatedEdge([width, height], [0, height], notch, [0, -1]),
    ...perforatedEdge([0, height], [0, 0], notch, [1, 0]),
  ];
}

/** Round stamp: the radius dips once per perforation around the circle. */
function postageCirclePoints(
  width: number,
  height: number,
  notches = 24,
): FramePoint[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const depth = 0.055;
  const samples = notches * PERFORATION_SEGMENTS;
  const points: FramePoint[] = [];

  for (let index = 0; index < samples; index += 1) {
    const turn = index / samples;
    const angle = turn * Math.PI * 2 - Math.PI / 2;
    // cos peaks once per notch; halved and offset so the factor runs between
    // (1 - depth) at a bite and 1 at the tooth tip.
    const factor =
      1 - (depth * (1 + Math.cos(notches * turn * Math.PI * 2))) / 2;
    points.push([
      centerX + Math.cos(angle) * centerX * factor,
      centerY + Math.sin(angle) * centerY * factor,
    ]);
  }
  return points;
}

/**
 * Cubic curves for the organic shapes, as fractions of the frame box.
 * Each entry is a bezier segment: [c1x, c1y, c2x, c2y, x, y].
 */
export const FRAME_CURVES: Partial<
  Record<CreativeFrameShape, { start: FramePoint; curves: number[][] }>
> = {
  heart: {
    start: [0.5, 1],
    curves: [
      [0.16, 0.75, 0, 0.5, 0, 0.31],
      [0, 0.13, 0.13, 0, 0.27, 0],
      [0.38, 0, 0.46, 0.07, 0.5, 0.16],
      [0.54, 0.07, 0.62, 0, 0.73, 0],
      [0.87, 0, 1, 0.13, 1, 0.31],
      [1, 0.5, 0.84, 0.75, 0.5, 1],
    ],
  },
  blob: {
    start: [0.5, 0.02],
    curves: [
      [0.74, 0.02, 0.98, 0.14, 0.98, 0.38],
      [0.98, 0.58, 0.88, 0.72, 0.8, 0.85],
      [0.72, 0.97, 0.6, 1, 0.46, 0.98],
      [0.3, 0.96, 0.12, 0.88, 0.05, 0.7],
      [-0.02, 0.5, 0.04, 0.26, 0.18, 0.13],
      [0.28, 0.04, 0.39, 0.02, 0.5, 0.02],
    ],
  },
  cloud: {
    start: [0.2, 0.84],
    curves: [
      [0.02, 0.84, -0.03, 0.58, 0.12, 0.46],
      [0.1, 0.22, 0.38, 0.1, 0.53, 0.28],
      [0.68, 0.08, 0.96, 0.24, 0.91, 0.49],
      [1.08, 0.58, 1, 0.84, 0.82, 0.84],
      [0.62, 0.84, 0.4, 0.84, 0.2, 0.84],
    ],
  },
};

export type FrameContentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Image aperture inside decorative photo frames; null means full silhouette. */
export function frameContentBox(
  shape: CreativeFrameShape,
  width: number,
  height: number,
): FrameContentBox | null {
  switch (shape) {
    case "polaroid":
      return {
        x: width * 0.075,
        y: height * 0.065,
        width: width * 0.85,
        height: height * 0.71,
      };
    case "polaroid-landscape":
      return {
        x: width * 0.06,
        y: height * 0.075,
        width: width * 0.88,
        height: height * 0.73,
      };
    case "photo-border":
      return {
        x: width * 0.065,
        y: height * 0.065,
        width: width * 0.87,
        height: height * 0.87,
      };
    case "filmstrip":
      return {
        x: width * 0.055,
        y: height * 0.17,
        width: width * 0.89,
        height: height * 0.66,
      };
    default:
      return null;
  }
}

/**
 * The same silhouette as an SVG `d` attribute, for previews (tool tiles,
 * inspector swatches) that can't use a canvas.
 */
export function frameSvgPath(
  shape: CreativeFrameShape,
  width: number,
  height: number,
  radius = 0,
): string {
  const round = (value: number) => Math.round(value * 100) / 100;

  const polygon = framePolygonPoints(shape, width, height);
  if (polygon) {
    return `${polygon
      .map(
        ([x, y], index) => `${index === 0 ? "M" : "L"}${round(x)},${round(y)}`,
      )
      .join(" ")} Z`;
  }

  const curve = FRAME_CURVES[shape];
  if (curve) {
    const segments = curve.curves.map(
      ([c1x, c1y, c2x, c2y, x, y]) =>
        `C${round(c1x * width)},${round(c1y * height)} ${round(
          c2x * width,
        )},${round(c2y * height)} ${round(x * width)},${round(y * height)}`,
    );
    return `M${round(curve.start[0] * width)},${round(
      curve.start[1] * height,
    )} ${segments.join(" ")} Z`;
  }

  switch (shape) {
    case "circle": {
      const rx = width / 2;
      const ry = height / 2;
      return `M0,${round(ry)} A${round(rx)},${round(ry)} 0 1 0 ${round(
        width,
      )},${round(ry)} A${round(rx)},${round(ry)} 0 1 0 0,${round(ry)} Z`;
    }
    case "arch": {
      const arc = Math.min(width / 2, height);
      return `M0,${round(height)} L0,${round(arc)} A${round(width / 2)},${round(
        arc,
      )} 0 0 1 ${round(width)},${round(arc)} L${round(width)},${round(
        height,
      )} Z`;
    }
    case "rounded": {
      const corner = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
      if (corner === 0) break;
      const c = round(corner);
      return [
        `M${c},0`,
        `L${round(width - corner)},0`,
        `A${c},${c} 0 0 1 ${round(width)},${c}`,
        `L${round(width)},${round(height - corner)}`,
        `A${c},${c} 0 0 1 ${round(width - corner)},${round(height)}`,
        `L${c},${round(height)}`,
        `A${c},${c} 0 0 1 0,${round(height - corner)}`,
        `L0,${c}`,
        `A${c},${c} 0 0 1 ${c},0`,
        "Z",
      ].join(" ");
    }
    case "squircle": {
      const corner = Math.min(width, height) * 0.28;
      return frameSvgPath("rounded", width, height, corner);
    }
    case "pill":
      return frameSvgPath(
        "rounded",
        width,
        height,
        Math.min(width, height) / 2,
      );
    case "polaroid":
    case "polaroid-landscape":
    case "photo-border":
    case "filmstrip":
      break;
    default:
      break;
  }

  return `M0,0 L${round(width)},0 L${round(width)},${round(height)} L0,${round(
    height,
  )} Z`;
}

export type FrameFit = "cover" | "contain";

export type FrameImagePlacement = {
  /** Position of the image's top-left corner, relative to the frame's. */
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

/**
 * Where an image sits inside its frame.
 *
 * Pan is stored normalised (-1…1) rather than in pixels so the crop survives
 * the frame being resized: -1 is flush against one overflowing edge, 0 centred,
 * 1 flush against the other. When the image doesn't overflow (contain, or
 * zoom 1 on an exact-ratio image) there is nothing to pan and the offset is
 * simply ignored.
 */
export function frameImagePlacement(input: {
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
  fit: FrameFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
}): FrameImagePlacement {
  const imageWidth = Math.max(1, input.imageWidth);
  const imageHeight = Math.max(1, input.imageHeight);
  const ratioX = input.frameWidth / imageWidth;
  const ratioY = input.frameHeight / imageHeight;
  const base =
    input.fit === "contain"
      ? Math.min(ratioX, ratioY)
      : Math.max(ratioX, ratioY);
  const scale = base * Math.max(0.1, input.zoom);

  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const slackX = Math.max(0, (width - input.frameWidth) / 2);
  const slackY = Math.max(0, (height - input.frameHeight) / 2);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  return {
    x: (input.frameWidth - width) / 2 + clamp(input.offsetX) * slackX,
    y: (input.frameHeight - height) / 2 + clamp(input.offsetY) * slackY,
    width,
    height,
    scale,
  };
}
