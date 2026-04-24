/* Tunnel Runner — step 2: player sphere + 3-lane lateral control. */

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

/* DO NOT replace existing keys — they match the physical arcade cabinet wiring. */
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u'], P1_2: ['i'], P1_3: ['o'],
  P1_4: ['j'], P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'],
  P2_4: ['f'], P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};

const FRAG = `
precision mediump float;
uniform vec2 resolution;
uniform float gameTime;
uniform float playerLane;
uniform float splitAmt;
uniform float flatAmt;
uniform float seed;

float freeLaneOf(float i){
  float n = mod(i + seed, 128.0);
  return mod(mod(n * 11.0, 7.0) + mod(n * 13.0, 5.0), 3.0);
}

float playerZAt(float t){
  float tc = min(t, 120.0);
  float i = floor(tc / 10.0);
  float v = 10.0 + 1.25 * i;
  float base = 10.0 + 100.0 * i + 6.25 * i * (i - 1.0);
  return base + v * (tc - 10.0 * i) + 25.0 * max(t - 120.0, 0.0);
}

vec2 path(float z){
  float on = smoothstep(4.5, 5.5, gameTime);
  float x = sin(z * 0.15) * 2.0 * on;
  float yBase = cos(z * 0.1) * 1.5 * on;
  float tb = gameTime - 30.0;
  float bi = floor(max(tb, 0.0) / 30.0);
  float phase = mod(max(tb, 0.0), 30.0);
  float yEnv = smoothstep(0.0, 1.0, phase) * (1.0 - smoothstep(4.0, 5.0, phase));
  float burst = step(0.0, tb) * yEnv;
  float dir = mod(bi, 2.0) < 0.5 ? 1.0 : -1.0;
  float y = mix(yBase, dir * 2.5, burst);
  return vec2(x, y);
}

vec3 playerAt(float z){
  return vec3(path(z).x + playerLane * 1.2, path(z).y, z);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdEllipsoid(vec3 p, vec3 r){
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float playerSDF(vec3 p, vec3 c){
  vec3 off = vec3(0.0, splitAmt * 0.6, 0.0);
  vec3 r = vec3(0.2 + flatAmt * 0.05, 0.2 - flatAmt * 0.13, 0.2 + flatAmt * 0.05);
  float pa = sdEllipsoid(p - c - off, r);
  float pb = sdEllipsoid(p - c + off, r);
  float d = smin(pa, pb, max(splitAmt * 0.85, 0.001));
  vec3 lp = p - c;
  float def = sin(lp.x * 7.0 + gameTime * 2.3)
            * sin(lp.y * 6.0 + gameTime * 1.9)
            * sin(lp.z * 8.0 + gameTime * 2.1) * 0.035;
  def += sin(gameTime * 3.5 + lp.y * 11.0) * cos(gameTime * 2.7 + lp.x * 9.0) * 0.02;
  return d - def;
}

float tunnelDist(vec3 q){
  float a = gameTime * 0.5 + q.z * 0.08;
  float ca = cos(a), sa = sin(a);
  vec2 rq = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
  float bump = cos(rq.x * 1.3) * cos(rq.y * 1.3) * 0.2
             + cos(q.z * 1.5 + gameTime * 1.3) * cos(rq.x * 2.4) * cos(rq.y * 2.4) * 0.08;
  return 3.0 - length(q.xy) + bump;
}

float rowKind(float i){
  float n = mod(i + seed * 7.0, 128.0);
  float h = mod(mod(n * 23.0, 31.0) + mod(n * 37.0, 11.0), 10.0);
  float k = step(5.0, h) + step(7.0, h) + step(9.0, h);
  if (i < 11.0 && k > 1.5) k = mod(h, 2.0);
  if (i < 23.0 && k > 2.5) k = 0.0;
  float ne = mod(i + seed * 11.0, 128.0);
  float he = mod(mod(ne * 41.0, 17.0) + mod(ne * 43.0, 11.0), 10.0);
  if (he > 3.5) k = 4.0;
  float nd = mod(i + seed * 13.0, 128.0);
  float hd = mod(mod(nd * 47.0, 19.0) + mod(nd * 53.0, 13.0), 10.0);
  if (i >= 90.0 && hd > 8.5) k = 5.0;
  return k;
}

float obsDist(vec3 q){
  float rowIdx = floor((q.z + 2.5) / 15.0);
  float rz = mod(q.z + 2.5, 15.0) - 7.5;
  float kind = rowKind(rowIdx);
  if (kind > 4.5) {
    float slab = abs(rz) - 0.2;
    float sU = abs(q.y - 0.55) - 0.15;
    float sD = abs(q.y + 0.55) - 0.15;
    return max(slab, -min(sU, sD));
  }
  if (kind > 3.5) return 100.0;
  if (kind > 2.5) {
    float slab = abs(rz) - 0.2;
    float slit = abs(q.y) - 0.12;
    return max(slab, -slit);
  }
  if (kind > 1.5) {
    return length(vec2(q.y, rz)) - 0.28;
  }
  float freeLane = freeLaneOf(rowIdx);
  float isCol = kind;
  float isSph = 1.0 - isCol;
  float t = gameTime;
  float b = rowIdx * 0.91;
  float qy = q.y * isSph;
  float wx0 = sin(t * 2.7 + b) * 0.25 * isSph;
  float wy0 = cos(t * 2.1 + b * 1.3) * 0.15 * isSph;
  float wx1 = sin(t * 1.9 + b + 2.1) * 0.25 * isSph;
  float wy1 = cos(t * 2.3 + b * 1.7 + 1.5) * 0.15 * isSph;
  float wx2 = sin(t * 2.5 + b + 4.3) * 0.25 * isSph;
  float wy2 = cos(t * 1.7 + b * 1.1 + 3.2) * 0.15 * isSph;
  float l0 = length(vec3(q.x + 1.2 - wx0, qy - wy0, rz));
  float l1 = length(vec3(q.x       - wx1, qy - wy1, rz));
  float l2 = length(vec3(q.x - 1.2 - wx2, qy - wy2, rz));
  if (freeLane < 0.5) l0 = 100.0;
  else if (freeLane < 1.5) l1 = 100.0;
  else l2 = 100.0;
  float k = 0.35 * isSph + 0.001;
  float merged = smin(l0, smin(l1, l2, k), k);
  float d = merged - 0.5;
  d -= cos(q.x * 3.0) * cos(qy * 3.0) * cos(rz * 3.0) * 0.04 * isSph;
  return d;
}

float mapNoPlayer(vec3 p){
  vec3 q = p;
  q.xy -= path(q.z);
  return smin(tunnelDist(q), obsDist(q), 0.3);
}

float map(vec3 p){
  vec3 q = p;
  q.xy -= path(q.z);
  float pz = playerZAt(gameTime);
  float player = playerSDF(p, playerAt(pz));
  return min(smin(tunnelDist(q), obsDist(q), 0.3), player);
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.01, 0.0);
  return normalize(vec3(
    mapNoPlayer(p+e.xyy) - mapNoPlayer(p-e.xyy),
    mapNoPlayer(p+e.yxy) - mapNoPlayer(p-e.yxy),
    mapNoPlayer(p+e.yyx) - mapNoPlayer(p-e.yyx)
  ));
}

float Voronesque(vec3 p){
  vec3 i = floor(p + dot(p, vec3(0.333333)));
  p -= i - dot(i, vec3(0.166666));
  vec3 i1 = step(p.yzx, p);
  vec3 i2 = max(i1, 1.0 - i1.zxy);
  i1 = min(i1, 1.0 - i1.zxy);
  vec3 p1 = p - i1 + 0.166666;
  vec3 p2 = p - i2 + 0.333333;
  vec3 p3 = p - 0.5;
  vec3 rnd = vec3(7.0, 157.0, 113.0);
  vec4 v = max(0.5 - vec4(dot(p, p), dot(p1, p1), dot(p2, p2), dot(p3, p3)), 0.0);
  vec4 d = vec4(dot(i, rnd), dot(i + i1, rnd), dot(i + i2, rnd), dot(i + 1.0, rnd));
  d = fract(sin(d) * 262144.0) * v * 2.0;
  v.x = max(d.x, d.y);
  v.y = max(d.z, d.w);
  v.z = max(min(d.x, d.y), min(d.z, d.w));
  v.w = min(v.x, v.y);
  return max(v.x, v.y) - max(v.z, v.w);
}

float softShadow(vec3 ro, vec3 rd, float mx){
  float res = 1.0;
  float t = 0.05;
  for (int i = 0; i < 24; i++) {
    if (t >= mx) break;
    float h = mapNoPlayer(ro + rd * t);
    if (h < 0.001) { res = 0.0; break; }
    res = min(res, 12.0 * h / t);
    t += h;
  }
  return clamp(res, 0.0, 1.0);
}

float lightContrib(vec3 p, vec3 n, vec3 lpos){
  vec3 ld = lpos - p;
  float dist = length(ld);
  ld /= dist;
  float diff = max(dot(n, ld), 0.0);
  float atten = 1.0 / (1.0 + dist * 0.15 + dist * dist * 0.025);
  float sh = softShadow(p + n * 0.05, ld, dist - 0.5);
  float cone = max(dot(normalize(p - lpos), vec3(0.0, 0.0, 1.0)), 0.0);
  cone = pow(cone, 1.5 - flatAmt * 0.8);
  return diff * atten * sh * cone;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

  float tt = playerZAt(gameTime);
  float cz = tt - 3.0;
  vec3 ro = vec3(path(cz).x, path(cz).y + 0.8, cz);
  vec3 ta = vec3(path(tt + 5.0), tt + 5.0);

  vec3 f = normalize(ta - ro);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  vec3 rd = normalize(uv.x * r + uv.y * u + 1.5 * f);

  float t = 0.0;
  float hit = 0.0;
  float minPD = 100.0;
  vec3 plc = playerAt(playerZAt(gameTime));
  float plDepth = max(dot(plc - ro, f), 0.01);
  vec2 uvPlayer = 1.5 * vec2(dot(plc - ro, r), dot(plc - ro, u)) / plDepth;
  for (int i = 0; i < 128; i++) {
    vec3 pp = ro + rd * t;
    minPD = min(minPD, playerSDF(pp, plc));
    float d = map(pp);
    if (d < 0.01) { hit = 1.0; break; }
    t += d * 0.8;
    if (t > 120.0) break;
  }

  vec3 p = ro + rd * t;
  vec3 q = p; q.xy -= path(q.z);
  float tunnelD = tunnelDist(q);
  float playerD = playerSDF(p, playerAt(tt));

  float isPlayer = step(playerD, 0.05) * hit;
  float isObs = step(0.05, tunnelD) * (1.0 - isPlayer) * hit;

  float ring = 0.5 + 0.5 * cos(p.z * 0.5);
  vec3 tunnelCol = mix(vec3(0.08, 0.02, 0.22), vec3(0.2, 0.75, 0.95), ring);
  float qShift = 0.5 + 0.5 * sin(p.z * 0.3 + gameTime * 0.6);
  vec3 obsCol    = mix(vec3(0.2, 0.9, 0.65), vec3(0.55, 0.25, 0.9), qShift);
  vec3 playerCol = vec3(1.0, 0.92, 0.7);
  vec3 col = mix(tunnelCol, obsCol, isObs);
  col = mix(col, playerCol, isPlayer);

  vec3 lp = playerAt(tt);
  if (hit > 0.5 && isPlayer < 0.5) {
    vec3 n = calcNormal(p);
    float vc = Voronesque(p * 2.5);
    vec2 eps = vec2(0.025, 0.0);
    vec3 gr = (vec3(
      Voronesque((p - eps.xyy) * 2.5),
      Voronesque((p - eps.yxy) * 2.5),
      Voronesque((p - eps.yyx) * 2.5)
    ) - vc) / eps.x;
    gr -= n * dot(n, gr);
    n = normalize(n + gr * 0.08);
    vec3 off = vec3(0.0, splitAmt * 0.6, 0.0);
    float cA = lightContrib(p, n, lp + off);
    float cB = lightContrib(p, n, lp - off);
    col *= (0.45 + 0.75 * vc) * (0.08 + 1.3 * (1.0 - flatAmt * 0.4) * (cA + cB));
  }

  if (isPlayer > 0.5) {
    vec3 pc = playerAt(tt);
    vec3 rel = p - pc;
    float ra = gameTime * 1.9;
    float rb = gameTime * 1.3;
    float ca = cos(ra), sa = sin(ra);
    float cb = cos(rb), sb = sin(rb);
    vec3 rr = vec3(ca * rel.x - sa * rel.z, rel.y, sa * rel.x + ca * rel.z);
    rr = vec3(rr.x, cb * rr.y - sb * rr.z, sb * rr.y + cb * rr.z);
    vec3 nd = normalize(rel);
    float wob = 1.0 + 0.22 * sin(gameTime * 6.5 + rel.x * 4.0 + rel.y * 3.0);
    vec3 flow1 = vec3(sin(gameTime * 0.9) * 2.0, cos(gameTime * 1.2) * 1.6, gameTime * 2.4);
    vec3 flow2 = vec3(cos(gameTime * 1.4) * 1.8, sin(gameTime * 1.1) * 2.0, -gameTime * 1.7);
    float n1 = Voronesque(rr * 9.0 * wob + flow1);
    float n2 = Voronesque(rr * 22.0 + flow2);
    float frac = clamp(n1 * 0.7 + n2 * 0.45, 0.0, 1.0);
    vec2 sDir = uv - uvPlayer;
    float sAng = atan(sDir.y, sDir.x);
    float rays = 0.5 + 0.5 * sin(sAng * 7.0 + gameTime * 2.0);
    rays *= 0.5 + 0.5 * sin(sAng * 3.0 - gameTime * 1.2);
    rays = pow(max(rays, 0.0), 2.0);
    float fres = pow(1.0 - abs(dot(nd, rd)), 2.2);
    float puls = 0.72 + 0.15 * sin(gameTime * 4.5);
    vec3 core = mix(vec3(0.75, 0.66, 0.42), vec3(0.92, 0.42, 0.18), frac);
    vec3 rayCol = vec3(1.0, 0.85, 0.5);
    vec3 rimCol = vec3(0.8, 0.52, 1.05);
    float rayFade = 1.0 - smoothstep(0.05, 0.35, splitAmt);
    vec3 base = core * puls;
    base += rayCol * rays * 0.32 * rayFade;
    base += rimCol * fres * 0.55;
    col = base;
  }

  col = mix(tunnelCol * 0.05, col, hit);

  float fog = 1.0 / (1.0 + t * t * 0.002);
  col *= fog;

  float glow = exp(-max(minPD, 0.0) * 8.5);
  float glowPuls = 0.85 + 0.15 * sin(gameTime * 3.2);
  col += vec3(0.8, 0.5, 1.0) * glow * glowPuls * 0.32;

  vec2 hDir = uv - uvPlayer;
  float ang = atan(hDir.y, hDir.x);
  float rayHalo = 0.5 + 0.5 * sin(ang * 7.0 + gameTime * 2.0);
  rayHalo *= 0.5 + 0.5 * sin(ang * 3.0 - gameTime * 1.2);
  rayHalo = pow(max(rayHalo, 0.0), 2.0);
  float rayFall = exp(-max(minPD, 0.0) * 3.2);
  float haloFade = 1.0 - smoothstep(0.05, 0.35, splitAmt);
  col += vec3(1.0, 0.85, 0.55) * rayHalo * rayFall * 0.45 * haloFade;

  gl_FragColor = vec4(col, 1.0);
}
`;

const config = {
  type: Phaser.WEBGL,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-root',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: { create, update },
};

new Phaser.Game(config);

const STORAGE_KEY = 'tunnel-runner-scores';
const MAX_SCORES = 10;

function create() {
  const uniforms = {
    resolution: { type: '2f', value: { x: 0, y: 0 } },
    time: { type: '1f', value: 0 },
    gameTime: { type: '1f', value: 0 },
    playerLane: { type: '1f', value: 0 },
    splitAmt: { type: '1f', value: 0 },
    flatAmt: { type: '1f', value: 0 },
    seed: { type: '1f', value: 0 },
  };
  const baseShader = new Phaser.Display.BaseShader('bg', FRAG, undefined, uniforms);
  this.shader = this.add.shader(baseShader, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);

  this.keys = this.input.keyboard.addKeys({
    L: CABINET_KEYS.P1_L[0],
    R: CABINET_KEYS.P1_R[0],
    U: CABINET_KEYS.P1_U[0],
    D: CABINET_KEYS.P1_D[0],
    S: CABINET_KEYS.START1[0],
    A1: CABINET_KEYS.P1_1[0],
    A2: CABINET_KEYS.P1_2[0],
    A3: CABINET_KEYS.P1_3[0],
  });
  this.lane = 0;
  this.smoothLane = 0;
  this.gameTime = 0;
  this.splitAmount = 0;
  this.flatAmount = 0;
  this.seed = Math.floor(Math.random() * 128);
  this.state = 'menu';
  this.initials = [0, 0, 0, 0];
  this.slot = 0;
  this.scores = [];
  this.timer = this.add.text(GAME_WIDTH - 16, 16, '0.0', {
    fontFamily: 'monospace', fontSize: '22px', color: '#fff',
  }).setOrigin(1, 0);

  this.store = window.platanusArcadeStorage;
  if (this.store) {
    this.store.get(STORAGE_KEY).then((r) => {
      if (r && r.found && Array.isArray(r.value)) {
        this.scores = r.value
          .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
          .slice(0, MAX_SCORES);
      }
    });
  }

  showMenu(this);
}

function addText(scene, x, y, text, size, color, bold) {
  const t = scene.add.text(x, y, text, {
    fontFamily: 'monospace', fontSize: size + 'px', color, fontStyle: bold ? 'bold' : '',
  }).setOrigin(0.5);
  (scene.overlay || (scene.overlay = [])).push(t);
  return t;
}

function pulse(scene, t) {
  scene.tweens.add({ targets: t, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
}

function clearOverlay(scene) {
  if (!scene.overlay) return;
  scene.overlay.forEach((t) => { scene.tweens.killTweensOf(t); t.destroy(); });
  scene.overlay = [];
}

function showMenu(scene) {
  clearOverlay(scene);
  addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'TUNNEL RUNNER', 48, '#7acfff', true);
  pulse(scene, addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 'PRESS START', 22, '#fff'));
}

function showNameEntry(scene) {
  clearOverlay(scene);
  addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, 'GAME OVER', 48, '#ff6666', true);
  addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, 'TIME: ' + Math.floor(scene.finalScore), 24, '#fff');
  scene.nameSlots = [];
  for (let i = 0; i < 4; i++) {
    scene.nameSlots.push(addText(scene, GAME_WIDTH / 2 + (i - 1.5) * 60, GAME_HEIGHT / 2, 'A', 56, '#fff', true));
  }
  addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, 'UP/DOWN  LEFT/RIGHT  ENTER', 16, '#aaa');
  refreshNameEntry(scene);
}

function refreshNameEntry(scene) {
  scene.nameSlots.forEach((t, i) => {
    t.setText(String.fromCharCode(65 + scene.initials[i]));
    t.setColor(i === scene.slot ? '#ffff00' : '#fff');
  });
}

function initialsStr(scene) {
  return scene.initials.map((i) => String.fromCharCode(65 + i)).join('');
}

function showConfirm(scene) {
  clearOverlay(scene);
  addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'SAVE AS ' + initialsStr(scene) + '?', 32, '#7acfff', true);
  pulse(scene, addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 'PRESS ENTER', 22, '#fff'));
}

function showLeaderboard(scene, highlightIdx) {
  clearOverlay(scene);
  addText(scene, GAME_WIDTH / 2, 40, 'HIGH SCORES', 30, '#7acfff', true);
  scene.scores.forEach((e, i) => {
    const line = (i + 1).toString().padStart(2, ' ') + '.  ' + e.name + '   ' + Math.floor(e.score);
    addText(scene, GAME_WIDTH / 2, 90 + i * 28, line, 20, i === highlightIdx ? '#ffff00' : '#fff');
  });
  pulse(scene, addText(scene, GAME_WIDTH / 2, GAME_HEIGHT - 30, 'PRESS ENTER TO CONTINUE', 18, '#aaa'));
}

function update(_t, delta) {
  const k = this.keys;
  const JD = Phaser.Input.Keyboard.JustDown;

  if (this.state === 'menu') {
    if (JD(k.S)) {
      clearOverlay(this);
      this.state = 'playing';
    }
  } else if (this.state === 'playing') {
    this.gameTime += delta * 0.001;
    if (JD(k.L)) this.lane = Math.max(-1, this.lane - 1);
    if (JD(k.R)) this.lane = Math.min(1, this.lane + 1);
    this.splitAmount += ((k.A1.isDown ? 1 : 0) - this.splitAmount) * 0.07;
    this.flatAmount += ((k.A2.isDown ? 1 : 0) - this.flatAmount) * 0.07;
    this.smoothLane += (this.lane - this.smoothLane) * 0.2;

    const t = this.gameTime;
    const tc = Math.min(t, 120);
    const si = Math.floor(tc / 10);
    const sv = 10 + 1.25 * si;
    const sb = 10 + 100 * si + 6.25 * si * (si - 1);
    const pz = sb + sv * (tc - 10 * si) + 25 * Math.max(t - 120, 0);
    const rowIdx = Math.floor((pz + 2.5) / 15);
    const dz = pz - (15 * rowIdx + 5);
    if (Math.abs(dz) < 0.95) {
      const nk = (((rowIdx + this.seed * 7) % 128) + 128) % 128;
      const hh = ((nk * 23) % 31 + (nk * 37) % 11) % 10;
      const n = (((rowIdx + this.seed) % 128) + 128) % 128;
      let k = (hh >= 5 ? 1 : 0) + (hh >= 7 ? 1 : 0) + (hh >= 9 ? 1 : 0);
      if (rowIdx < 11 && k > 1) k = hh % 2;
      if (rowIdx < 23 && k > 2) k = 0;
      const ne = (((rowIdx + this.seed * 11) % 128) + 128) % 128;
      const he = ((ne * 41) % 17 + (ne * 43) % 11) % 10;
      if (he >= 4) k = 4;
      const nd = (((rowIdx + this.seed * 13) % 128) + 128) % 128;
      const hd = ((nd * 47) % 19 + (nd * 53) % 13) % 10;
      if (rowIdx >= 90 && hd >= 9) k = 5;
      let hit = false;
      if (k === 5) {
        hit = this.splitAmount < 0.85 || this.flatAmount < 0.85;
      } else if (k === 4) {
        hit = false;
      } else if (k === 3) {
        hit = this.flatAmount < 0.9;
      } else if (k === 2) {
        hit = this.splitAmount < 0.9;
      } else {
        const freeLane = (((n * 11) % 7) + ((n * 13) % 5)) % 3;
        const plx = this.smoothLane * 1.2;
        for (let j = 0; j < 3; j++) {
          if (j === freeLane) continue;
          const dx = plx - (j - 1) * 1.2;
          if (dx * dx + dz * dz < 0.49) { hit = true; break; }
        }
      }
      if (hit) {
        this.finalScore = this.gameTime;
        this.initials = [0, 0, 0, 0];
        this.slot = 0;
        this.state = 'nameEntry';
        showNameEntry(this);
      }
    }
  } else if (this.state === 'nameEntry') {
    let changed = false;
    if (JD(k.U)) { this.initials[this.slot] = (this.initials[this.slot] + 1) % 26; changed = true; }
    if (JD(k.D)) { this.initials[this.slot] = (this.initials[this.slot] + 25) % 26; changed = true; }
    if (JD(k.L)) { this.slot = Math.max(0, this.slot - 1); changed = true; }
    if (JD(k.R)) { this.slot = Math.min(3, this.slot + 1); changed = true; }
    if (changed) refreshNameEntry(this);
    if (JD(k.S)) {
      this.state = 'confirm';
      showConfirm(this);
    }
  } else if (this.state === 'confirm') {
    if (JD(k.S)) {
      const entry = { name: initialsStr(this), score: this.finalScore, savedAt: new Date().toISOString() };
      this.scores = this.scores
        .concat(entry)
        .sort((a, b) => b.score - a.score || (a.savedAt < b.savedAt ? 1 : -1))
        .slice(0, MAX_SCORES);
      if (this.store) this.store.set(STORAGE_KEY, this.scores);
      const idx = this.scores.findIndex((e) => e.savedAt === entry.savedAt);
      this.state = 'leaderboard';
      showLeaderboard(this, idx);
    }
  } else if (this.state === 'leaderboard') {
    if (JD(k.S)) {
      this.gameTime = 0;
      this.lane = 0;
      this.smoothLane = 0;
      this.splitAmount = 0;
      this.flatAmount = 0;
      this.seed = Math.floor(Math.random() * 128);
      this.state = 'menu';
      showMenu(this);
    }
  }

  this.timer.setText(Math.floor(this.gameTime));
  this.shader.setUniform('gameTime.value', this.gameTime);
  this.shader.setUniform('playerLane.value', this.smoothLane);
  this.shader.setUniform('splitAmt.value', this.splitAmount);
  this.shader.setUniform('flatAmt.value', this.flatAmount);
  this.shader.setUniform('seed.value', this.seed);
}
