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

float freeLaneOf(float i){
  float n = mod(i, 128.0);
  return mod(mod(n * 11.0, 7.0) + mod(n * 13.0, 5.0), 3.0);
}

float playerZAt(float t){
  return 10.0 + 16.0 * t + 0.0125 * t * t;
}

vec2 path(float z){
  return vec2(sin(z*0.15)*2.0, cos(z*0.1)*1.5);
}

vec3 playerAt(float z){
  return vec3(path(z).x + playerLane * 1.2, path(z).y, z);
}

float map(vec3 p){
  vec3 q = p;
  q.xy -= path(q.z);
  float tunnel = 3.0 - length(q.xy);

  float rowIdx = floor((q.z + 2.5) / 15.0);
  float rz = mod(q.z + 2.5, 15.0) - 7.5;
  float freeLane = freeLaneOf(rowIdx);
  float r = 0.55;
  vec3 c0 = vec3(q.x + 1.2, q.y, rz);
  vec3 c1 = vec3(q.x,       q.y, rz);
  vec3 c2 = vec3(q.x - 1.2, q.y, rz);
  if (freeLane < 0.5) c0.y += 100.0;
  else if (freeLane < 1.5) c1.y += 100.0;
  else c2.y += 100.0;
  float obs = min(length(c0), min(length(c1), length(c2))) - r;

  float pz = playerZAt(gameTime);
  float player = length(p - playerAt(pz)) - 0.4;

  return min(tunnel, min(obs, player));
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
  for (int i = 0; i < 128; i++) {
    float d = map(ro + rd * t);
    if (d < 0.01) { hit = 1.0; break; }
    t += d * 0.95;
    if (t > 120.0) break;
  }

  vec3 p = ro + rd * t;
  vec3 q = p; q.xy -= path(q.z);
  float tunnelD = 3.0 - length(q.xy);
  float playerD = length(p - playerAt(tt)) - 0.4;

  float isPlayer = step(playerD, 0.05) * hit;
  float isObs = step(0.05, tunnelD) * (1.0 - isPlayer) * hit;

  float ring = 0.5 + 0.5 * cos(p.z * 0.5);
  vec3 tunnelCol = mix(vec3(0.05, 0.35, 0.12), vec3(0.15, 0.95, 0.35), ring);
  vec3 obsCol    = vec3(0.6, 1.0, 0.3);
  vec3 playerCol = vec3(0.3, 0.8, 1.0);
  vec3 col = mix(tunnelCol, obsCol, isObs);
  col = mix(col, playerCol, isPlayer);
  col = mix(tunnelCol, col, hit);

  float fog = 1.0 / (1.0 + t * t * 0.002);
  col *= fog;

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
  };
  const baseShader = new Phaser.Display.BaseShader('bg', FRAG, undefined, uniforms);
  this.shader = this.add.shader(baseShader, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);

  this.keys = this.input.keyboard.addKeys({
    L: CABINET_KEYS.P1_L[0],
    R: CABINET_KEYS.P1_R[0],
    U: CABINET_KEYS.P1_U[0],
    D: CABINET_KEYS.P1_D[0],
    S: CABINET_KEYS.START1[0],
  });
  this.lane = 0;
  this.smoothLane = 0;
  this.gameTime = 0;
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
  addText(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, 'TIME: ' + scene.finalScore.toFixed(1), 24, '#fff');
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
    const line = (i + 1).toString().padStart(2, ' ') + '.  ' + e.name + '   ' + e.score.toFixed(1);
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
    this.smoothLane += (this.lane - this.smoothLane) * 0.2;

    const t = this.gameTime;
    const pz = 10 + 16 * t + 0.0125 * t * t;
    const rowIdx = Math.floor((pz + 2.5) / 15);
    const dz = pz - (15 * rowIdx + 5);
    if (Math.abs(dz) < 0.95) {
      const n = rowIdx % 128;
      const freeLane = (((n * 11) % 7) + ((n * 13) % 5)) % 3;
      const plx = this.smoothLane * 1.2;
      for (let j = 0; j < 3; j++) {
        if (j === freeLane) continue;
        const dx = plx - (j - 1) * 1.2;
        if (dx * dx + dz * dz < 0.9025) {
          this.finalScore = this.gameTime;
          this.initials = [0, 0, 0, 0];
          this.slot = 0;
          this.state = 'nameEntry';
          showNameEntry(this);
          break;
        }
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
      this.state = 'menu';
      showMenu(this);
    }
  }

  this.timer.setText(this.gameTime.toFixed(1));
  this.shader.setUniform('gameTime.value', this.gameTime);
  this.shader.setUniform('playerLane.value', this.smoothLane);
}
