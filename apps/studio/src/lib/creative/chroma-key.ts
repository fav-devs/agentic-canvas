/**
 * Live green-screen keyer.
 *
 * The backend "keyed" WebMs have no usable alpha (our ffmpeg build can't encode
 * VP8/VP9 alpha), so green removal happens here instead: each video frame is
 * uploaded to a WebGL texture and a fragment shader turns green pixels
 * transparent, writing to a canvas that a Fabric image then composites over the
 * design.
 *
 * Everything is defensive: if WebGL is unavailable, the context is lost, or a
 * shader fails to compile, `createChromaKeyer` returns null and the caller
 * falls back to drawing the raw (green) video rather than crashing.
 */

export interface ChromaKeyer {
  /** The keyed output; use this as the Fabric image source. */
  readonly canvas: HTMLCanvasElement;
  /** Key the video's current frame into `canvas`. Call once per rendered frame. */
  render(): void;
  /** Free GL resources. */
  dispose(): void;
}

const VERTEX_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // Map clip space to texture space, flipping Y (video origin is top-left).
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_sim;     // how green a pixel must be before it starts keying
uniform float u_smooth;  // soft edge width
uniform float u_spill;   // green-spill suppression on kept edges
varying vec2 v_uv;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  // "Greenness": green dominance over the stronger of red/blue. Robust across
  // green shades and lighting, unlike a fixed-colour distance.
  float greenness = c.g - max(c.r, c.b);
  float alpha = 1.0 - smoothstep(u_sim, u_sim + u_smooth, greenness);
  // Suppress residual green fringing on the subject's edges.
  if (greenness > 0.0) {
    float neutral = (c.r + c.b) * 0.5;
    c.g = min(c.g, neutral + u_spill);
  }
  gl_FragColor = vec4(c.rgb, alpha);
}`;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createChromaKeyer(
  video: HTMLVideoElement,
  width: number,
  height: number,
  options: { similarity?: number; smoothness?: number; spill?: number } = {},
): ChromaKeyer | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const gl = (canvas.getContext("webgl", {
      premultipliedAlpha: false,
      alpha: true,
    }) ||
      canvas.getContext("experimental-webgl", {
        premultipliedAlpha: false,
        alpha: true,
      })) as WebGLRenderingContext | null;
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    // Fullscreen quad.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.uniform1f(
      gl.getUniformLocation(program, "u_sim"),
      options.similarity ?? 0.1,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_smooth"),
      options.smoothness ?? 0.12,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_spill"),
      options.spill ?? 0.1,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);

    let disposed = false;
    const render = () => {
      if (disposed || video.readyState < 2) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          video,
        );
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } catch {
        // A transient texture-upload failure (e.g. a not-yet-decoded frame)
        // just skips this frame.
      }
    };

    // Key the first available frame immediately so the image isn't blank.
    render();

    return {
      canvas,
      render,
      dispose() {
        disposed = true;
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      },
    };
  } catch {
    return null;
  }
}
