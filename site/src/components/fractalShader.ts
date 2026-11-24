// Infinite-zoom fractal in the style of my Mandelbulb3D render "Home of the Postiers":
// hexagonal halls with stepped terraces and rows of windows, lit purple to blue.
//
// How the zoom never ends: the same hex architecture is stacked as N layers, each S times
// smaller than the one in front. Every cell has an open centre, so you look through it into
// the next, smaller (= deeper, darker) layer. All layers grow slowly; once a layer has grown
// by S it has exactly replaced the one in front of it, so the picture loops with no seam.
// Layers fade in while tiny and fade out once you're inside their open centre.
// Bevels and windows are anti-aliased against the pixel size of each layer.

export const VERT = `#version 300 es
void main() {
  // One triangle that covers the whole screen
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 fragColor;

const float PI = 3.14159265;
const float S = 3.0;      // scale between layers
const int N = 5;          // number of layers
const float BASE = 30.0;  // cells per screen height on the smallest layer
const float SPEED = 0.05; // layers per second (one x3 zoom every 20 s)
const float HOLE = 0.34;  // open centre of each cell (0..1 of the cell radius)

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// 0 at the centre of a hexagon (flat sides left/right), 0.5 on its sides
float hexd(vec2 p) { p = abs(p); return max(p.x, dot(p, vec2(0.5, 0.8660254))); }

// Smooth step from 0 to 1 around x = e, over a width of +-a
float edge(float e, float a, float x) { return smoothstep(e - a, e + a, x); }

// Architecture at p (cells of width 1, one centred on the origin).
// px = size of one screen pixel in these units. Returns (height 0..1, solid 0..1).
vec2 pat(vec2 p, float px) {
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;  // position inside the cell
  float d = hexd(g) * 2.0;                 // 0 centre .. 1 side

  float aa = clamp(px * 2.5, 0.003, 0.25); // ~1.5 px bevels, in d units

  // Terraces climbing from the open centre to the outer wall
  float k = (d - HOLE) / (0.86 - HOLE) * 4.0;
  float ka = aa / (0.86 - HOLE) * 4.0;
  float fk = fract(k);
  float steps = floor(k) + smoothstep(1.0 - min(ka * 2.0, 1.0), 1.0, fk);
  float H = 0.3 + 0.09 * clamp(steps, 0.0, 4.0);

  // Windows along each terrace, fading out when they get too small to draw
  float sa = floor(atan(g.y, g.x) / (PI / 3.0) + 0.5) * (PI / 3.0);
  vec2 lg = rot(sa) * g;
  float t = lg.y / max(lg.x, 1e-3) * 0.8660254 + 0.5; // 0..1 along the side
  float n = 2.0 + floor(clamp(k, 0.0, 3.99)) * 2.0;
  float ua = px * n * 4.0 / max(d, 0.2);
  float u = fract(t * n);
  float win = edge(0.18, ua, u) * (1.0 - edge(0.82, ua, u))
            * edge(0.3, ka, fk) * (1.0 - edge(0.78, ka, fk))
            * (1.0 - smoothstep(0.12, 0.3, max(ua, ka)))
            * step(0.0, k) * step(k, 4.0);
  H -= 0.06 * win;

  H = mix(H, 0.74, edge(0.86, aa, d));      // ledge
  H = mix(H, 1.0, edge(0.93, aa, d));       // beams shared with the neighbours
  H += 0.05 * (1.0 - edge(HOLE + 0.05, aa, d)) * edge(HOLE, aa, d); // lip round the opening

  return vec2(H, edge(HOLE, aa, d));
}

void main() {
  vec2 uv0 = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float rr = dot(uv0, uv0);
  float warp = 1.0 + 0.45 * rr;             // dome-like perspective at the edges
  vec2 uv = rot(uTime * 0.012) * uv0 * warp;
  float e = warp / uRes.y;                  // one pixel in uv units
  float f = fract(uTime * SPEED);

  vec3 L = normalize(vec3(-0.5, 0.6, 0.62));
  float side = clamp(0.5 + 0.55 * uv0.x + 0.15 * sin(uTime * 0.07), 0.0, 1.0);
  vec3 base = mix(vec3(0.70, 0.20, 0.88), vec3(0.32, 0.26, 0.95), side);

  vec3 col = vec3(0.0);
  float A = 0.0;
  // Front (largest) layer first, then look through its openings
  for (int j = N - 1; j >= 0; j--) {
    float li = float(j) + f;                // grows by 1 per zoom step
    float x = li / float(N);
    float w = smoothstep(0.0, 0.3, x) * (1.0 - smoothstep(0.8, 1.0, x));
    if (w <= 0.0) continue;
    float m = BASE * pow(S, -li);
    mat2 R = rot(0.25 * li);
    vec2 q = R * uv * m;
    float px = e * m;
    vec2 P = pat(q, px);
    float hx = pat(R * (uv + vec2(e, 0.0)) * m, px).x;
    float hy = pat(R * (uv + vec2(0.0, e)) * m, px).x;
    vec3 nrm = normalize(vec3(P.x - hx, P.x - hy, 0.035));
    float dif = max(dot(nrm, L), 0.0);
    float rim = pow(1.0 - nrm.z, 2.0);

    float depth = mix(0.22, 1.0, smoothstep(0.0, float(N) - 1.0, li)); // deeper = darker
    vec3 c = base * (0.2 + 0.8 * P.x) * (0.3 + 0.95 * dif) + vec3(0.85, 0.6, 1.0) * rim * 0.35;
    c *= depth;

    float alpha = P.y * w;
    col += (1.0 - A) * alpha * c;
    A += (1.0 - A) * alpha;
    if (A > 0.995) break;
  }
  col += (1.0 - A) * vec3(0.03, 0.01, 0.07); // the far depths

  col *= 1.0 - 0.45 * clamp(rr, 0.0, 1.0);  // darker towards the corners
  fragColor = vec4(col, 1.0);
}`
