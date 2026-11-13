/* ==========================================================================
   Kris — 首屏水墨
   俯视一盆清水：点一下滴进一滴墨，按住再拖则墨跟着走。
   墨被几股水流推开、拉成细丝，边漂边淡，
   墨浓的地方透出山水。引文跟着同一股水走，水静下来再回到原处。
   水和墨都在 WebGL2 里按不可压缩流体（Stable Fluids）演算。
   没有 WebGL2、或系统开了「减少动态效果」时整个效果不启用。

   底图是 Lingdong Huang《{Shan, Shui}*》生成的一帧（MIT）
   https://github.com/LingDong-/shan-shui-inf
   纸色已去掉，只留墨。
   ========================================================================== */

(function () {
  'use strict';

  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ---------- 手感 ---------- */
  // 长度以首屏短边为 1，速度单位是「短边/秒」，换屏幕尺寸观感不变
  const SIM_CELLS = 128;        // 水流网格短边格数
  const DYE_CELLS = 640;        // 墨的分辨率（短边像素上限）
  const PRESSURE_ITERS = 20;
  const STEP = 1 / 60;          // 固定步长：60Hz、120Hz 屏上墨走得一样快

  const DROP_R = 0.014;         // 墨滴半径
  const DROP_INK = 2.2;         // 墨滴浓度
  const SPREAD = 72;            // 入水后带着墨往外涌的水
  const SPREAD_R = 0.035;
  const SPREAD_TAU = 1.05;      // 涌出多留一会儿，不要刚铺开就断
  const SPREAD_INK_TAU = 0.35;  // 涌出的水里墨变淡的时间：先浓后清，中心慢慢透亮
  const JET_V = 1.35;           // 把墨推成瓣的几股水流（总冲量）
  const SWIRL_V = 0.7;          // 瓣头的小涡
  const VEL_FADE = 0.42;        // 水流衰减放慢：半秒内还在走，而不是推一下就停
  const INK_FADE = 0.18;        // 墨每秒稀释
  const CURL = 24;              // 涡度增强：细节继续卷，不让水流变直然后停住
  const DRIFT = 0.045;          // 落墨后的缓慢暗流，幅度仍小，避免过会儿从底边冲出一股
  const DRIFT_TAU = 2.4;        // 暗流慢慢停，不在头一秒里切断
  const FADE_FROM = 5;          // 最后一滴落下几秒后加快散去
  const LIFE = 9;               // 最后一滴落下几秒后停下

  const INK_CAP = 4;
  const VEL_CAP = 4000;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power'
  });
  if (!gl) return;
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return;

  const formats = {
    r: pickFormat([[gl.R16F, gl.RED], [gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]]),
    rg: pickFormat([[gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]])
  };
  if (!formats.r || !formats.rg) return;

  function pickFormat(chain) {
    for (const [internal, format] of chain) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      if (ok) return { internal, format };
    }
    return null;
  }

  /* ---------- 着色器 ---------- */
  const VS = `#version 300 es
in vec2 aPos;
uniform vec2 texel;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texel.x, 0.0);
  vR = vUv + vec2(texel.x, 0.0);
  vT = vUv + vec2(0.0, texel.y);
  vB = vUv - vec2(0.0, texel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
`;

  // 入水处往外涌的水：xy 是位置，z 是强度（1/秒），w 是水里的墨浓度。
  // 返回 (总强度, 强度×浓度)
  const SPREAD_GLSL = `
uniform vec4 uSrc[8];
uniform vec2 scale;
uniform float spreadR;
vec2 spread(vec2 uv) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 q = uSrc[i];
    if (q.z <= 0.0) continue;
    vec2 p = (uv - q.xy) * scale;
    float k = q.z * exp(-dot(p, p) / (spreadR * spreadR));
    s += vec2(k, k * q.w);
  }
  return s;
}
`;

  const PRESSURE_GLSL = `
uniform sampler2D uPressure;
float P(vec2 uv) {
  return (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? 0.0 : texture(uPressure, uv).x;
}
`;

  const SPLAT_FS = `
uniform sampler2D uTarget;
uniform vec2 point;
uniform vec2 scale;
uniform float radius;
uniform vec2 value;
uniform float swirl;
uniform float cap;
void main() {
  vec2 p = (vUv - point) * scale;
  float g = exp(-dot(p, p) / (radius * radius));
  vec2 add = (value + swirl * vec2(-p.y, p.x) / radius) * g;
  vec4 base = texture(uTarget, vUv);
  outColor = vec4(clamp(base.xy + add, -cap, cap), base.zw);
}`;

  const ADVECT_FS = SPREAD_GLSL + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 simTexel;
uniform float dt;
uniform float fade;
uniform float inject;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * simTexel;
  vec4 v = texture(uSource, coord) * exp(-fade * dt);
  vec2 s = spread(vUv) * inject;
  outColor = (v + dt * s.y) / (1.0 + dt * s.x);
}`;

  const CURL_FS = `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

  // 涡度增强 + 暗流（流函数取旋度，天然不可压缩）
  const VORTICITY_FS = `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
uniform float drift;
uniform float time;
uniform vec2 scale;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}
float stream(vec2 p) {
  return noise(p + vec2(time * 0.11, -time * 0.07))
       + 0.5 * noise(p * 2.1 + vec2(7.3 - time * 0.13, time * 0.09));
}
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f = f / (length(f) + 0.0001) * curl * C;
  f.y = -f.y;
  vec2 p = vUv * scale * 2.5;
  float e = 0.02;
  vec2 flow = vec2(stream(p + vec2(0.0, e)) - stream(p - vec2(0.0, e)),
                   stream(p - vec2(e, 0.0)) - stream(p + vec2(e, 0.0))) / (2.0 * e);
  vec2 v = texture(uVelocity, vUv).xy + (f + flow * drift) * dt;
  outColor = vec4(v, 0.0, 1.0);
}`;

  const DIVERGENCE_FS = SPREAD_GLSL + `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  outColor = vec4(0.5 * (R - L + T - B) - spread(vUv).x, 0.0, 0.0, 1.0);
}`;

  const SCALE_FS = `
uniform sampler2D uTexture;
uniform float value;
void main() {
  outColor = value * texture(uTexture, vUv);
}`;

  const PRESSURE_FS = PRESSURE_GLSL + `
uniform sampler2D uDivergence;
void main() {
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((P(vL) + P(vR) + P(vT) + P(vB) - div) * 0.25, 0.0, 0.0, 1.0);
}`;

  const GRADIENT_FS = PRESSURE_GLSL + `
uniform sampler2D uVelocity;
void main() {
  vec2 v = texture(uVelocity, vUv).xy - 0.5 * vec2(P(vR) - P(vL), P(vT) - P(vB));
  outColor = vec4(v, 0.0, 1.0);
}`;

  // 字只跟着水走，不在墨还看得见的时候拉回原句。
  const GLYPH_FS = `
uniform sampler2D uVelocity;
uniform sampler2D uGlyph;
uniform vec2 simTexel;
uniform float dt;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - dt * vel * simTexel;
  outColor = texture(uGlyph, coord);
}`;

  // 墨铺在底下，字盖在上面。字的颜色来自页面本身，不在这里改。
  const DISPLAY_FS = `
uniform sampler2D uDye;
uniform sampler2D uArt;
uniform sampler2D uGlyph;
uniform float hasArt;
uniform vec4 artRect;
uniform vec3 ink;
uniform float uLive;
void main() {
  float d = max(texture(uDye, vUv).x, 0.0);
  float wash = 0.9 * (1.0 - exp(-1.25 * d));
  vec2 auv = (vUv - artRect.xy) / artRect.zw;
  vec2 inside = step(vec2(0.0), auv) * step(auv, vec2(1.0));
  float art = texture(uArt, clamp(auv, 0.0, 1.0)).a * inside.x * inside.y * hasArt;
  art *= smoothstep(0.04, 0.5, d);
  float a = 1.0 - (1.0 - wash) * (1.0 - art);
  a *= smoothstep(0.004, 0.03, d);
  vec4 g = texture(uGlyph, vUv);
  float ga = clamp(g.a, 0.0, 1.0) * clamp(uLive, 0.0, 1.0);
  outColor = vec4(g.rgb + ink * a * (1.0 - ga), ga + a * (1.0 - ga));
}`;

  function compile(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VS);

  function program(body) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + body));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  let prog;
  try {
    prog = {
      splat: program(SPLAT_FS),
      advect: program(ADVECT_FS),
      curl: program(CURL_FS),
      vorticity: program(VORTICITY_FS),
      divergence: program(DIVERGENCE_FS),
      scale: program(SCALE_FS),
      pressure: program(PRESSURE_FS),
      gradient: program(GRADIENT_FS),
      glyph: program(GLYPH_FS),
      display: program(DISPLAY_FS)
    };
  } catch (err) {
    console.warn('首屏水墨未启用：着色器编译失败', err);
    return;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  /* ---------- 渲染目标 ---------- */
  function target(w, h, fmt) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type || gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const t = {
      tex,
      fbo,
      w,
      h,
      texel: [1 / w, 1 / h],
      clear() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      free() {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
      }
    };
    t.clear();
    return t;
  }

  function pair(w, h, fmt) {
    let a = target(w, h, fmt);
    let b = target(w, h, fmt);
    return {
      texel: a.texel,
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      clear() { a.clear(); b.clear(); },
      free() { a.free(); b.free(); }
    };
  }

  function use(P, grid) {
    gl.useProgram(P.p);
    if (grid && P.u.texel) gl.uniform2f(P.u.texel, grid.texel[0], grid.texel[1]);
    return P.u;
  }

  function bind(unit, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t ? t.tex : null);
    return unit;
  }

  function blit(t) {
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- 尺寸 ---------- */
  let cssW = 0;
  let cssH = 0;
  let dpr = 0;
  let heroTop = 0;
  let scaleX = 1;
  let scaleY = 1;
  let vel = null;
  let dye = null;
  let pressure = null;
  let divergence = null;
  let curl = null;
  let glyphs = null;
  let sharp = null;
  let plate = null;
  let plateCtx = null;
  let quoteSig = '';
  let glyphsLive = false;
  const GLYPH_FMT = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const GLYPH_EDGE = 1440;

  function makeSharp(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return { tex, w, h };
  }

  function glyphDims() {
    const edge = Math.max(canvas.width, canvas.height, 1);
    const s = Math.min(1, GLYPH_EDGE / edge);
    return [Math.max(2, Math.round(canvas.width * s)), Math.max(2, Math.round(canvas.height * s))];
  }

  function allocate() {
    [vel, dye, pressure, divergence, curl, glyphs].forEach((t) => { if (t) t.free(); });
    if (sharp) gl.deleteTexture(sharp.tex);
    const short = Math.min(cssW, cssH);
    scaleX = cssW / short;
    scaleY = cssH / short;
    const simW = Math.max(2, Math.round(SIM_CELLS * scaleX));
    const simH = Math.max(2, Math.round(SIM_CELLS * scaleY));
    const dyeShort = Math.min(DYE_CELLS, Math.round(short * dpr));
    vel = pair(simW, simH, formats.rg);
    pressure = pair(simW, simH, formats.r);
    divergence = target(simW, simH, formats.r);
    curl = target(simW, simH, formats.r);
    dye = pair(Math.max(2, Math.round(dyeShort * scaleX)), Math.max(2, Math.round(dyeShort * scaleY)), formats.r);
    const dims = glyphDims();
    glyphs = pair(dims[0], dims[1], GLYPH_FMT);
    sharp = makeSharp(dims[0], dims[1]);
    quoteSig = '';
    if (glyphsLive) {
      refreshQuote();
      copySharp();
    }
  }

  function layout() {
    const rect = hero.getBoundingClientRect();
    heroTop = rect.top;
    canvas.style.top = rect.top + 'px';
    const w = document.documentElement.clientWidth;
    const h = Math.max(1, Math.round(rect.height));
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w;
    cssH = h;
    dpr = d;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    allocate();
  }

  /* ---------- 山水底图 ---------- */
  let art = null;
  let artW = 0;
  let artH = 0;
  const img = new Image();
  img.onload = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    art = { tex };
    artW = img.naturalWidth;
    artH = img.naturalHeight;
  };
  img.src = 'assets/img/shanshui.png';

  // 铺满首屏、横向居中、底边对齐
  function artRect() {
    if (!art) return [0, 0, 1, 1];
    const s = Math.max(cssW / artW, cssH / artH);
    const w = (artW * s) / cssW;
    const h = (artH * s) / cssH;
    return [(1 - w) / 2, 0, w, h];
  }

  /* ---------- 引文 ---------- */
  const quote = hero.querySelector('.q');
  const quoteText = hero.querySelector('.q__text');
  const quoteBy = hero.querySelector('.q__by');

  function quoteSignature() {
    const text = quoteText ? quoteText.textContent : '';
    const lang = quoteText ? (quoteText.getAttribute('lang') || '') : '';
    const by = quoteBy ? quoteBy.textContent : '';
    return text + '\u0000' + lang + '\u0000' + by + '\u0000' + cssW + 'x' + cssH;
  }

  function textNode(el) {
    if (!el) return null;
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) return n;
    }
    return null;
  }

  function drawBlock(ctx, el) {
    const node = textNode(el);
    if (!node) return;
    const text = node.nodeValue;
    const cs = getComputedStyle(el);
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    ctx.fillStyle = cs.color;
    if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing || '0px';
    const range = document.createRange();
    let start = 0;
    let lineTop = null;
    const commit = (end) => {
      if (end <= start) return;
      range.setStart(node, start);
      range.setEnd(node, end);
      const box = range.getBoundingClientRect();
      if (box.width < 0.5 || box.height < 0.5) return;
      ctx.fillText(text.slice(start, end), box.left, box.top - heroTop);
    };
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.height) continue;
      const top = Math.round(rect.top);
      if (lineTop == null) {
        lineTop = top;
        start = i;
      } else if (Math.abs(top - lineTop) > 2) {
        commit(i);
        lineTop = top;
        start = i;
      }
    }
    commit(text.length);
  }

  function paintPlate() {
    if (!sharp || !cssW || !cssH) return;
    if (!plate) plate = document.createElement('canvas');
    if (plate.width !== sharp.w || plate.height !== sharp.h) {
      plate.width = sharp.w;
      plate.height = sharp.h;
      plateCtx = plate.getContext('2d', { alpha: true });
    }
    const ctx = plateCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, plate.width, plate.height);
    ctx.setTransform(plate.width / cssW, 0, 0, plate.height / cssH, 0, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 1;
    drawBlock(ctx, quoteText);
    drawBlock(ctx, quoteBy);
  }

  function uploadSharp() {
    if (!sharp || !plate) return;
    gl.bindTexture(gl.TEXTURE_2D, sharp.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, plate);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  function copySharp() {
    if (!glyphs || !sharp) return;
    const U = use(prog.scale, glyphs);
    gl.uniform1i(U.uTexture, bind(0, sharp));
    gl.uniform1f(U.value, 1);
    blit(glyphs.read);
    blit(glyphs.write);
  }

  function refreshQuote() {
    if (!sharp) return;
    const sig = quoteSignature();
    if (sig === quoteSig) return;
    const hidden = quote && quote.classList.contains('is-ink');
    if (hidden) quote.classList.remove('is-ink');
    quoteSig = sig;
    paintPlate();
    if (hidden) quote.classList.add('is-ink');
    uploadSharp();
  }

  /* ---------- 模拟 ---------- */
  let simT = 0;
  let lastDrop = -1e9;
  let sources = [];
  let drops = [];
  const srcData = new Float32Array(8 * 4);

  // 涌出的水让墨团长到多大（按面积守恒估算），水流跟着这个边缘推
  function cloudRadius(age) {
    const grown = SPREAD * SPREAD_R * SPREAD_R * SPREAD_TAU * (1 - Math.exp(-age / SPREAD_TAU));
    return Math.sqrt(DROP_R * DROP_R + grown);
  }

  function pushJets(dt) {
    drops = drops.filter((d) => d.jets.some((j) => simT - d.born < j.dur));
    drops.forEach((d) => {
      const age = simT - d.born;
      const edge = cloudRadius(age);
      d.jets.forEach((j) => {
        if (age >= j.dur) return;
        const k = 1 - age / j.dur;
        const f = ((3 * j.s) / j.dur) * k * k * dt;
        const r = DROP_R + edge * 0.6;
        splat(vel, d.u + (Math.cos(j.a) * r) / scaleX, d.v + (Math.sin(j.a) * r) / scaleY, j.r,
          Math.cos(j.a) * f, Math.sin(j.a) * f, 0, VEL_CAP);
      });
    });
  }

  function spreadUniform() {
    sources = sources.filter((s) => simT - s.born < SPREAD_TAU * 6);
    srcData.fill(0);
    sources.slice(-8).forEach((s, i) => {
      const age = simT - s.born;
      srcData[i * 4] = s.u;
      srcData[i * 4 + 1] = s.v;
      srcData[i * 4 + 2] = s.amp * Math.exp(-age / SPREAD_TAU);
      srcData[i * 4 + 3] = DROP_INK * Math.exp(-age / SPREAD_INK_TAU);
    });
    return srcData;
  }

  function splat(field, u, v, radius, x, y, swirl, cap) {
    const U = use(prog.splat);
    gl.uniform1i(U.uTarget, bind(0, field.read));
    gl.uniform2f(U.point, u, v);
    gl.uniform2f(U.scale, scaleX, scaleY);
    gl.uniform1f(U.radius, radius);
    gl.uniform2f(U.value, x, y);
    gl.uniform1f(U.swirl, swirl);
    gl.uniform1f(U.cap, cap);
    blit(field.write);
    field.swap();
  }

  function simulate(dt) {
    simT += dt;
    const src = spreadUniform();
    const quiet = simT - lastDrop;
    pushJets(dt);

    let U = use(prog.curl, vel);
    gl.uniform1i(U.uVelocity, bind(0, vel.read));
    blit(curl);

    U = use(prog.vorticity, vel);
    gl.uniform1i(U.uVelocity, bind(0, vel.read));
    gl.uniform1i(U.uCurl, bind(1, curl));
    gl.uniform1f(U.curl, CURL * Math.exp(-Math.max(0, quiet - 1.2) / 3.6));
    gl.uniform1f(U.dt, dt);
    // 暗流只跟落墨后的头零点几秒，后面关掉，避免屏幕底下突然冲出一股水
    gl.uniform1f(U.drift, DRIFT * SIM_CELLS * Math.exp(-quiet / DRIFT_TAU));
    gl.uniform1f(U.time, simT);
    gl.uniform2f(U.scale, scaleX, scaleY);
    blit(vel.write);
    vel.swap();

    U = use(prog.divergence, vel);
    gl.uniform1i(U.uVelocity, bind(0, vel.read));
    gl.uniform4fv(U.uSrc, src);
    gl.uniform2f(U.scale, scaleX, scaleY);
    gl.uniform1f(U.spreadR, SPREAD_R);
    blit(divergence);

    U = use(prog.scale, pressure);
    gl.uniform1i(U.uTexture, bind(0, pressure.read));
    gl.uniform1f(U.value, 0.8);
    blit(pressure.write);
    pressure.swap();

    U = use(prog.pressure, pressure);
    gl.uniform1i(U.uDivergence, bind(1, divergence));
    for (let i = 0; i < PRESSURE_ITERS; i++) {
      gl.uniform1i(U.uPressure, bind(0, pressure.read));
      blit(pressure.write);
      pressure.swap();
    }

    U = use(prog.gradient, vel);
    gl.uniform1i(U.uPressure, bind(0, pressure.read));
    gl.uniform1i(U.uVelocity, bind(1, vel.read));
    blit(vel.write);
    vel.swap();

    U = use(prog.advect);
    gl.uniform2f(U.simTexel, vel.texel[0], vel.texel[1]);
    gl.uniform1f(U.dt, dt);
    gl.uniform4fv(U.uSrc, src);
    gl.uniform2f(U.scale, scaleX, scaleY);
    gl.uniform1f(U.spreadR, SPREAD_R);
    gl.uniform1i(U.uVelocity, bind(0, vel.read));
    gl.uniform1i(U.uSource, bind(1, vel.read));
    gl.uniform1f(U.fade, VEL_FADE);
    gl.uniform1f(U.inject, 0);
    blit(vel.write);
    vel.swap();

    gl.uniform1i(U.uVelocity, bind(0, vel.read));
    gl.uniform1i(U.uSource, bind(1, dye.read));
    gl.uniform1f(U.fade, INK_FADE + Math.max(0, quiet - FADE_FROM) * 0.9);
    gl.uniform1f(U.inject, 1);
    blit(dye.write);
    dye.swap();

    if (glyphs && sharp) {
      const G = use(prog.glyph, glyphs);
      gl.uniform2f(G.simTexel, vel.texel[0], vel.texel[1]);
      gl.uniform1f(G.dt, dt);
      gl.uniform1i(G.uVelocity, bind(0, vel.read));
      gl.uniform1i(G.uGlyph, bind(1, glyphs.read));
      blit(glyphs.write);
      glyphs.swap();
    }
  }

  // 句子先留在水里被推开，墨开始变淡时把字收掉，避免原句从还没散尽的墨里冒出来。
  function quotePresence(quiet) {
    const fadeAt = 2.4;
    const goneAt = 5;
    if (quiet <= fadeAt) return 1;
    if (quiet >= goneAt) return 0;
    const t = (quiet - fadeAt) / (goneAt - fadeAt);
    return 1 - t * t * (3 - 2 * t);
  }

  function render() {
    if (glyphsLive) refreshQuote();
    const drawing = gesture && gesture.mode === 'draw';
    const live = !glyphsLive ? 0 : (drawing ? 1 : quotePresence(simT - lastDrop));
    const U = use(prog.display);
    gl.uniform1i(U.uDye, bind(0, dye.read));
    gl.uniform1i(U.uArt, bind(1, art));
    gl.uniform1i(U.uGlyph, bind(2, glyphs ? glyphs.read : null));
    gl.uniform1f(U.hasArt, art ? 1 : 0);
    gl.uniform4fv(U.artRect, artRect());
    gl.uniform3f(U.ink, 10 / 255, 10 / 255, 11 / 255);
    gl.uniform1f(U.uLive, live);
    blit(null);
  }

  /* ---------- 落墨 ---------- */
  function drop(clientX, clientY) {
    interrupt();
    layout();
    const u = clientX / cssW;
    const v = 1 - (clientY - heroTop) / cssH;
    const at = (r, a) => [u + (Math.cos(a) * r) / scaleX, v + (Math.sin(a) * r) / scaleY];

    // 一小团浓墨，边上几块小斑让轮廓一开始就不圆
    splat(dye, u, v, DROP_R, DROP_INK, 0, 0, INK_CAP);
    for (let i = 0; i < 4; i++) {
      const [x, y] = at(DROP_R * rand(0.3, 0.9), rand(0, TAU));
      splat(dye, x, y, DROP_R * rand(0.45, 0.75), DROP_INK * rand(0.4, 0.8), 0, 0, INK_CAP);
    }

    // 几股方向随机、强弱不一的水流，跟着墨团边缘往外推，把墨拉成不对称的瓣
    const jets = [];
    const count = 3 + Math.floor(Math.random() * 4);
    const turn = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      jets.push({
        a: turn + ((i + rand(-0.35, 0.35)) * TAU) / count,
        s: JET_V * SIM_CELLS * (0.25 + 0.75 * Math.random() ** 2),
        r: DROP_R * 2 * rand(0.8, 1.4),
        dur: rand(0.55, 1.15)
      });
    }
    drops.push({ u, v, born: simT, jets });

    // 瓣头卷起来的小涡，转向随机
    for (let i = 0; i < 3; i++) {
      const [x, y] = at(DROP_R * rand(0.5, 2.5), rand(0, TAU));
      const s = (Math.random() < 0.5 ? -1 : 1) * SWIRL_V * SIM_CELLS * rand(0.5, 1);
      splat(vel, x, y, DROP_R * 1.6, 0, 0, s, VEL_CAP);
    }

    // 入水的头零点几秒，带着墨的水从这几处往外涌：墨团变大，中心渐渐变淡
    const weights = [rand(0.5, 1), rand(0.2, 0.8), rand(0.2, 0.8)];
    const sum = weights[0] + weights[1] + weights[2];
    weights.forEach((w) => {
      const [x, y] = at(DROP_R * rand(0, 1.1), rand(0, TAU));
      sources.push({ u: x, v: y, amp: (SPREAD * w) / sum, born: simT });
    });

    lastDrop = simT;
    start();
  }

  // 拖动时沿路径补一串较轻的墨，并顺着拖动方向推一把水
  function paint(clientX, clientY, from) {
    interrupt();
    layout();
    const u = clientX / cssW;
    const v = 1 - (clientY - heroTop) / cssH;
    const du = (u - from.u) * scaleX;
    const dv = (v - from.v) * scaleY;
    const len = Math.hypot(du, dv) || 1e-4;
    splat(dye, u, v, DROP_R * 0.72, DROP_INK * 0.7, 0, 0, INK_CAP);
    splat(vel, u, v, DROP_R * 1.15, (du / len) * 0.7 * SIM_CELLS, (dv / len) * 0.7 * SIM_CELLS, 0, VEL_CAP);
    sources.push({ u, v, amp: SPREAD * 0.18, born: simT });
    lastDrop = simT;
    start();
    return { u, v, x: clientX, y: clientY };
  }

  // 按住不动时墨继续往下落，不靠移动才补
  function seep(clientX, clientY) {
    interrupt();
    layout();
    const u = clientX / cssW;
    const v = 1 - (clientY - heroTop) / cssH;
    splat(dye, u, v, DROP_R * 0.8, DROP_INK * 0.48, 0, 0, INK_CAP);
    sources.push({ u, v, amp: SPREAD * 0.1, born: simT });
    lastDrop = simT;
    if (gesture) gesture.mark = { u, v, x: clientX, y: clientY };
    start();
  }

  /* ---------- 循环 ---------- */
  let raf = 0;
  let last = 0;
  let acc = 0;
  let dead = false;
  let settling = false;
  let epoch = 0;

  function frame(now) {
    if (dead) return;
    flow();
    layout();
    acc += Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    let n = 0;
    while (acc > STEP * 0.5 && n < 4) {
      simulate(STEP);
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    const drawing = gesture && gesture.mode === 'draw';
    if (!drawing && simT - lastDrop > LIFE) {
      raf = 0;
      beginSettle();
      return;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function clearField() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    sources = [];
    drops = [];
    [vel, dye, pressure, glyphs].forEach((t) => { if (t) t.clear(); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    glyphsLive = false;
    quoteSig = '';
  }

  function showQuoteNow() {
    glyphsLive = false;
    quoteSig = '';
    clearQuoteFade();
    if (quote) quote.classList.remove('is-ink');
  }

  function clearQuoteFade() {
    if (!quote) return;
    quote.classList.remove('is-return', 'is-shown');
    quote.querySelectorAll('.q__text, .q__by').forEach((el) => {
      el.style.transition = '';
      el.style.opacity = '';
    });
  }

  // 墨先自己淡完，原句再从完全透明慢慢回到纸上。
  function fadeQuoteIn() {
    if (!quote) return;
    const token = epoch;
    const nodes = [...quote.querySelectorAll('.q__text, .q__by')];
    nodes.forEach((el) => {
      el.style.transition = 'none';
      el.style.opacity = '0';
    });
    quote.classList.remove('is-ink');
    void quote.offsetWidth;
    nodes.forEach((el) => {
      el.style.transition = 'opacity 1.3s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.opacity = '1';
      const done = (ev) => {
        if (ev.propertyName !== 'opacity' || token !== epoch) return;
        el.removeEventListener('transitionend', done);
        el.style.transition = '';
        el.style.opacity = '';
      };
      el.addEventListener('transitionend', done);
    });
  }

  function beginSettle() {
    if (settling || dead) return;
    settling = true;
    const token = ++epoch;
    canvas.style.transition = 'opacity .9s ease';
    canvas.style.opacity = '0';
    let finished = false;
    const done = (ev) => {
      if (finished || token !== epoch) return;
      if (ev && ev.propertyName && ev.propertyName !== 'opacity') return;
      finished = true;
      canvas.removeEventListener('transitionend', done);
      window.clearTimeout(backup);
      if (!settling || token !== epoch) return;
      settling = false;
      clearField();
      canvas.style.transition = 'none';
      canvas.style.opacity = '1';
      void canvas.offsetWidth;
      canvas.style.transition = '';
      fadeQuoteIn();
    };
    canvas.addEventListener('transitionend', done);
    const backup = window.setTimeout(() => done(null), 1100);
  }

  function interrupt() {
    epoch++;
    if (!settling) return;
    settling = false;
    clearField();
    canvas.style.transition = 'none';
    canvas.style.opacity = '1';
    void canvas.offsetWidth;
    canvas.style.transition = '';
  }

  function start() {
    if (dead) return;
    if (glyphs && !glyphsLive) {
      if (quote) clearQuoteFade();
      refreshQuote();
      copySharp();
      glyphsLive = true;
      render();
      if (quote) quote.classList.add('is-ink');
    }
    if (raf || settling) return;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  canvas.className = 'ink';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.addEventListener('webglcontextlost', () => {
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    showQuoteNow();
    canvas.remove();
  });
  if (quote) quote.addEventListener('selectstart', (e) => e.preventDefault());
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { quoteSig = ''; });
  }
  document.body.appendChild(canvas);
  layout();

  window.addEventListener('scroll', () => { if (raf) canvas.style.top = hero.getBoundingClientRect().top + 'px'; }, { passive: true });

  const HOLD_MS = 260;
  const FLICK_DIST = 72;
  const FLICK_SPEED = 1.15;
  let gesture = null;

  function flow() {
    if (!gesture || gesture.mode !== 'draw' || !gesture.mark) return;
    const now = performance.now();
    if (now - gesture.flowAt < 100) return;
    if (Math.hypot(gesture.x - gesture.mark.x, gesture.y - gesture.mark.y) > 5) return;
    gesture.flowAt = now;
    seep(gesture.x, gesture.y);
  }

  function blocked(target) {
    return target instanceof Element && !!target.closest('a, button, input, textarea, .nav, .adm');
  }

  function insideHero(y) {
    const band = hero.getBoundingClientRect();
    return y >= band.top && y <= band.bottom;
  }

  function beginDraw() {
    if (!gesture || gesture.mode !== 'hold') return;
    gesture.mode = 'draw';
    gesture.flowAt = performance.now();
    drop(gesture.x, gesture.y);
    gesture.mark = {
      u: gesture.x / cssW,
      v: 1 - (gesture.y - heroTop) / cssH,
      x: gesture.x,
      y: gesture.y
    };
    const cap = gesture.target;
    if (cap && cap.setPointerCapture) {
      try { cap.setPointerCapture(gesture.id); } catch (err) { /* 捕获失败就继续听文档上的移动 */ }
    }
  }

  function trail(clientX, clientY) {
    if (!gesture.mark) return;
    const gap = Math.max(8, Math.min(cssW, cssH) * 0.012);
    const x0 = gesture.mark.x;
    const y0 = gesture.mark.y;
    const dx = clientX - x0;
    const dy = clientY - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < gap) return;
    const steps = Math.min(8, Math.floor(dist / gap));
    for (let i = 1; i <= steps; i++) {
      gesture.mark = paint(x0 + (dx * i) / steps, y0 + (dy * i) / steps, gesture.mark);
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (dead || gesture || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    if (blocked(e.target) || !insideHero(e.clientY)) return;
    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
      t0: performance.now(),
      mode: 'hold',
      target: e.target,
      timer: 0,
      mark: null,
      flowAt: 0
    };
    gesture.timer = window.setTimeout(beginDraw, HOLD_MS);
  });

  document.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (gesture.mode === 'hold') {
      const dist = Math.hypot(e.clientX - gesture.downX, e.clientY - gesture.downY);
      const speed = dist / Math.max(16, performance.now() - gesture.t0);
      if (dist > FLICK_DIST && speed > FLICK_SPEED) {
        window.clearTimeout(gesture.timer);
        gesture.mode = 'scroll';
        return;
      }
      gesture.x = e.clientX;
      gesture.y = e.clientY;
      return;
    }
    if (gesture.mode !== 'draw') return;
    e.preventDefault();
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    trail(e.clientX, e.clientY);
  }, { passive: false });

  function endGesture(e, cancelled) {
    if (!gesture || e.pointerId !== gesture.id) return;
    window.clearTimeout(gesture.timer);
    if (!cancelled && gesture.mode === 'hold') drop(e.clientX, e.clientY);
    gesture = null;
  }

  document.addEventListener('pointerup', (e) => endGesture(e, false));
  document.addEventListener('pointercancel', (e) => endGesture(e, true));

  // 进首页停几秒，在当时还能看见的首屏里随机落一滴。自己先点过就不再落。
  const GREET_MS = 3000;
  let greetTimer = 0;
  function greetDrop() {
    greetTimer = 0;
    if (dead || gesture || lastDrop > -1e8) return;
    const band = hero.getBoundingClientRect();
    const top = Math.max(band.top, 0);
    const bottom = Math.min(band.bottom, window.innerHeight);
    if (bottom - top < 80) return;
    layout();
    const x = cssW * (0.16 + Math.random() * 0.68);
    const y = top + (bottom - top) * (0.18 + Math.random() * 0.64);
    drop(x, y);
  }
  function armGreet() {
    if (greetTimer || dead || lastDrop > -1e8) return;
    if (document.hidden) return;
    greetTimer = window.setTimeout(greetDrop, GREET_MS);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.clearTimeout(greetTimer);
      greetTimer = 0;
      return;
    }
    armGreet();
  });
  armGreet();
})();
