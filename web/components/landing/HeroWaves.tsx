import { useEffect, useRef } from "react";

// Layered paper waves (ported from the portfolio's LayeredPaperWaves, without three.js) in the brand
// palette: paper at the top-left, stepping down through seven sheets into the accent blue.
const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform float uTime;
uniform vec2 uResolution;

vec2 rotate(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.2;
  vec2 r = rotate(p, -0.5);
  float t = uTime * 0.3;

  vec3 col = vec3(0.965, 0.965, 0.953);

  vec3 palette[7];
  palette[0] = vec3(0.965, 0.965, 0.953);
  palette[1] = vec3(0.925, 0.933, 0.965);
  palette[2] = vec3(0.855, 0.878, 0.984);
  palette[3] = vec3(0.725, 0.776, 0.996);
  palette[4] = vec3(0.545, 0.616, 1.000);
  palette[5] = vec3(0.333, 0.431, 1.000);
  palette[6] = vec3(0.141, 0.251, 1.000);

  for (int i = 6; i >= 0; i--) {
    float fi = float(i);
    float bp = 0.12 - fi * 0.27;
    float wave = sin(r.x * 1.65 + t * 0.90 + fi * 0.85) * 0.15
               + cos(r.x * 3.10 - t * 0.70 + fi * 1.15) * 0.05
               + sin(r.x * 0.85 + t * 0.45) * 0.07;
    float dist = bp + wave - r.y;

    float shadow = smoothstep(0.22 + fi * 0.015, 0.0, dist);
    col = mix(col, col * vec3(0.55, 0.58, 0.72), shadow * 0.35);

    float alpha = smoothstep(0.003, -0.003, dist);
    vec3 layer = mix(palette[i], palette[i] * 0.965, clamp(-dist * 0.15, 0.0, 1.0));
    layer += vec3(smoothstep(-0.015, -0.001, dist) * smoothstep(0.004, -0.001, dist) * 0.3);
    col = mix(col, layer, alpha);
  }

  col += (hash(gl_FragCoord.xy) - 0.5) * 0.018;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default function HeroWaves() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const gl = el?.getContext("webgl", { antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!el || !gl) return;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uRes = gl.getUniformLocation(prog, "uResolution");

    // ponytail: DPR capped at 1.5; a soft gradient gains nothing from more pixels.
    const size = () => {
      const pr = Math.min(window.devicePixelRatio, 1.5);
      el.width = Math.round(el.clientWidth * pr);
      el.height = Math.round(el.clientHeight * pr);
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform2f(uRes, el.width, el.height);
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true, frame = 0;
    const start = performance.now();
    const draw = () => {
      gl.uniform1f(uTime, still ? 4 : (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      draw();
      frame = requestAnimationFrame(loop);
    };
    const resume = () => { if (!frame && !still && visible && !document.hidden) frame = requestAnimationFrame(loop); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume(); });
    io.observe(el);
    document.addEventListener("visibilitychange", resume);
    draw();
    resume();

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", resume);
      // Not loseContext(): the canvas is reused on remount (StrictMode) and a lost context stays lost.
      gl.deleteProgram(prog);
    };
  }, []);

  return <canvas ref={canvas} className="hero-waves" aria-hidden />;
}
