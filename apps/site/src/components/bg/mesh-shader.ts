// Living mesh-gradient — vanilla WebGL, ZERO dependencies, bundled.
// A Stripe/FBM-style dark mesh: slow simplex-noise pools of warm amber / clay
// over the #0A0A08 ground. Designed to be *felt*, not seen — very low contrast,
// ~0.4ms/frame on the GPU, nothing on the layout/paint path.
//
// Discipline:
//  • single fullscreen TRIANGLE_STRIP draw call, one fragment program
//  • DPR capped at 1.5 (a soft background never needs retina sampling)
//  • caller owns the rAF loop so it can pause on tab-hide / reduced-motion
//  • returns a tiny handle: resize(), render(t), and dispose()

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// stegu/webgl-noise simplex2 (public domain) + 3-octave FBM, then a low-contrast
// warm mix. Colors live in linear-ish sRGB; kept dim on purpose.
const FRAG = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p *= 2.0; a *= 0.5; }
  return s;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  // correct for aspect so the pools don't smear on wide screens
  vec2 p = uv;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.035;
  float n1 = fbm(p * 1.6 + vec2(t, t * 0.7));
  float n2 = fbm(p * 2.4 - vec2(t * 0.6, t) + 7.3);
  float blend = (n1 + n2 * 0.5) * 0.5 + 0.5;

  // warm dark ground + two dim accent pools
  vec3 ground = vec3(0.039, 0.039, 0.031);   // #0A0A08
  vec3 amber  = vec3(0.090, 0.066, 0.030);   // dim amber pool
  vec3 clay   = vec3(0.075, 0.040, 0.034);   // dim clay pool

  vec3 col = ground;
  col = mix(col, amber, smoothstep(0.55, 0.95, blend) * 0.9);
  col = mix(col, clay,  smoothstep(0.35, 0.05, n2) * 0.6);

  // a slow, very soft vignette toward the edges keeps focus centered
  float vig = smoothstep(1.25, 0.25, length(uv - 0.5));
  col *= 0.85 + 0.15 * vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface MeshHandle {
  resize: () => void;
  render: (timeMs: number) => void;
  dispose: () => void;
}

const DPR_CAP = 1.5;

/** Initialise the mesh program on a canvas. Returns null if WebGL is unavailable
 *  (caller keeps the CSS fallback gradient). The caller drives render(). */
export function initMesh(canvas: HTMLCanvasElement): MeshHandle | null {
  const ctx = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
  }) as WebGLRenderingContext | null;
  if (!ctx) return null;
  const gl: WebGLRenderingContext = ctx;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  }

  function render(timeMs: number) {
    gl.uniform1f(uTime, timeMs / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function dispose() {
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  resize();
  return { resize, render, dispose };
}
