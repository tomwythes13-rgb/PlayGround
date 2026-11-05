/* Tom Taylor Car Chase — main game */
import {
  WORLD, CITY, HIGHWAY_Y, GOAL,
  generateWorld, drawWorld, drawGoalMarker,
  onPaved, circleHitsSolid, pointInSolid,
} from "./world.js";
import { GameAudio } from "./audio.js";

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
const minimap = document.getElementById("minimap");
const mctx = minimap.getContext("2d");

const els = {
  hud: document.getElementById("hud"),
  touch: document.getElementById("touch"),
  title: document.getElementById("screen-title"),
  end: document.getElementById("screen-end"),
  objective: document.getElementById("objective"),
  sub: document.getElementById("sub-objective"),
  stars: document.getElementById("stars"),
  distance: document.getElementById("distance"),
  speed: document.getElementById("speed"),
  carHealth: document.getElementById("car-health"),
  playerHealth: document.getElementById("player-health"),
  vehiclePanel: document.getElementById("vehicle-panel"),
  prompt: document.getElementById("prompt"),
  promptKey: document.getElementById("prompt-key"),
  promptText: document.getElementById("prompt-text"),
  bust: document.getElementById("bust-meter"),
  bustFill: document.querySelector("#bust-meter i"),
  toast: document.getElementById("toast"),
  toastTitle: document.getElementById("toast-title"),
  toastSub: document.getElementById("toast-sub"),
  heatVig: document.getElementById("heat-vignette"),
  dmgVig: document.getElementById("damage-vignette"),
  sound: document.getElementById("sound"),
  btnAction: document.getElementById("btn-action"),
  btnGas: document.getElementById("btn-gas"),
  btnBrake: document.getElementById("btn-brake"),
  btnDrift: document.getElementById("btn-drift"),
  joystick: document.getElementById("joystick"),
  stick: document.getElementById("stick"),
  endKicker: document.getElementById("end-kicker"),
  endTitle: document.getElementById("end-title"),
  endCopy: document.getElementById("end-copy"),
  statTime: document.getElementById("stat-time"),
  statSpeed: document.getElementById("stat-speed"),
  statCops: document.getElementById("stat-cops"),
  statStars: document.getElementById("stat-stars"),
  startBtn: document.getElementById("start"),
  restartBtn: document.getElementById("restart"),
};

const audio = new GameAudio();
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

const TYPES = {
  sedan: { len: 48, wid: 22, max: 432, accel: 305, grip: 8.6, turn: 2.55 },
  sports: { len: 46, wid: 21, max: 498, accel: 405, grip: 9.4, turn: 2.75 },
  pickup: { len: 53, wid: 24, max: 408, accel: 295, grip: 8.0, turn: 2.4 },
  van: { len: 57, wid: 24, max: 388, accel: 265, grip: 7.6, turn: 2.2 },
  police: { len: 51, wid: 23, max: 455, accel: 360, grip: 8.9, turn: 2.65 },
};
const TYPE_POOL = ["sedan", "sedan", "sedan", "sports", "pickup", "van"];

const state = {
  mode: "title",
  world: generateWorld(20261105),
  player: null,
  vehicles: [],
  cops: [],
  particles: [],
  skids: [],
  camera: { x: 1508, y: 2314, zoom: 1 },
  view: { w: 1280, h: 720, dpr: 1 },
  heat: 0,
  wanted: 0,
  maxStars: 0,
  spawnTimer: 2.5,
  elapsed: 0,
  topSpeed: 0,
  copsWrecked: 0,
  bust: 0,
  shake: 0,
  endTimer: 0,
  pendingEnd: null,
  lastHud: {},
  toastTimer: null,
  time: 0,
  nearestRide: null,
  isTouch: false,
};

let nextId = 1;

/* ------------------------------------------------------------------ */
/* Scene setup                                                         */
/* ------------------------------------------------------------------ */
function vehicle(type, x, y, angle, color, opts = {}) {
  const t = TYPES[type] || TYPES.sedan;
  return {
    id: nextId++,
    type, t,
    x, y, angle,
    vx: 0, vy: 0,
    len: t.len, wid: t.wid,
    max: t.max, accel: t.accel, grip: t.grip, turn: t.turn,
    baseMax: t.max,
    color,
    health: opts.cop ? 108 : 168,
    maxHealth: opts.cop ? 108 : 168,
    driver: opts.cop ? "cop" : "none",
    isCop: !!opts.cop,
    isPlayerCar: false,
    wreck: false,
    hitCd: 0,
    wallHitCd: 0,
    stuck: 0,
    reverseT: 0,
    trackPrev: null,
    dustT: 0,
    smokeT: 0,
    phase: Math.random() * TAU,
  };
}

function randomType() {
  return TYPE_POOL[Math.floor(Math.random() * TYPE_POOL.length)];
}
function randomColor() {
  const arr = ["#bd3b2c", "#2f6d93", "#d6a13f", "#3d7254", "#8d9096", "#1f2a36", "#b2542a", "#e0d9cc", "#633f74", "#2f4a5c"];
  return arr[Math.floor(Math.random() * arr.length)];
}

function resetScene() {
  const world = state.world;
  nextId = 1;
  state.vehicles = [];
  state.cops = [];
  state.particles = [];
  state.skids = [];
  state.heat = 0;
  state.wanted = 0;
  state.maxStars = 0;
  state.spawnTimer = 2.5;
  state.elapsed = 0;
  state.topSpeed = 0;
  state.copsWrecked = 0;
  state.bust = 0;
  state.shake = 0;
  state.endTimer = 0;
  state.pendingEnd = null;
  state.time = 0;
  state.nearestRide = null;

  state.player = {
    x: world.spawn.x, y: world.spawn.y,
    angle: -Math.PI / 2,
    health: 100,
    maxHealth: 100,
    invuln: 0,
    walk: 0,
    car: null,
  };

  // Guaranteed rides around the spawn
  for (const sc of world.spawnCars) {
    state.vehicles.push(vehicle(sc.type, sc.x, sc.y, sc.angle, sc.color));
  }
  // Street & lot traffic
  for (const spot of world.parkingSpots) {
    if (Math.hypot(spot.x - world.spawn.x, spot.y - world.spawn.y) < 74) continue;
    const type = randomType();
    state.vehicles.push(vehicle(type, spot.x, spot.y, spot.angle, randomColor()));
  }

  state.camera.x = world.spawn.x;
  state.camera.y = world.spawn.y - 40;
  state.camera.zoom = getBaseZoom();
  updateHud(true);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
const keys = new Set();
const touchInput = { x: 0, y: 0, gas: false, brake: false, drift: false, active: false };

function isTouchDevice() {
  return matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || innerWidth < 820;
}

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  const first = !e.repeat;
  keys.add(e.code);
  if (!first) return;
  if (e.code === "Enter") {
    if (state.mode === "title") startGame();
    else if (state.mode === "complete" || state.mode === "wasted" || state.mode === "busted") startGame();
  }
  if (e.code === "KeyE") doAction();
  if (e.code === "KeyR" && state.mode !== "playing" && state.mode !== "title") startGame();
  if (e.code === "KeyM") toggleSound();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

const ARROW_KEYS = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};
const has = (arr) => arr.some((k) => keys.has(k));

function setupTouch() {
  state.isTouch = isTouchDevice();
  if (state.isTouch) document.body.classList.add("touch");

  const joyRect = () => els.joystick.getBoundingClientRect();
  let joyId = null;

  const setJoy = (e) => {
    const r = joyRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width * 0.37;
    let dx = (e.clientX - cx) / max;
    let dy = (e.clientY - cy) / max;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    touchInput.x = dx;
    touchInput.y = dy;
    touchInput.active = true;
    els.stick.style.transform = `translate(${dx * r.width * 0.28}px, ${dy * r.width * 0.28}px)`;
  };
  const clearJoy = () => {
    joyId = null;
    touchInput.x = 0;
    touchInput.y = 0;
    touchInput.active = false;
    els.stick.style.transform = "translate(0px, 0px)";
  };

  els.joystick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    audio.init();
    joyId = e.pointerId;
    try { els.joystick.setPointerCapture(e.pointerId); } catch {}
    setJoy(e);
  });
  els.joystick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyId) return;
    e.preventDefault();
    setJoy(e);
  });
  els.joystick.addEventListener("pointerup", (e) => { if (e.pointerId === joyId) clearJoy(); });
  els.joystick.addEventListener("pointercancel", clearJoy);
  els.joystick.addEventListener("lostpointercapture", clearJoy);

  const bindHold = (el, prop) => {
    const on = (e) => {
      e.preventDefault();
      audio.init();
      touchInput[prop] = true;
      el.classList.add("held");
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const off = (e) => {
      e.preventDefault();
      touchInput[prop] = false;
      el.classList.remove("held");
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("lostpointercapture", off);
  };
  bindHold(els.btnGas, "gas");
  bindHold(els.btnBrake, "brake");
  bindHold(els.btnDrift, "drift");
  els.btnAction.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    audio.init();
    doAction();
  });
}

/* ------------------------------------------------------------------ */
/* Start / end                                                         */
/* ------------------------------------------------------------------ */
function startGame() {
  audio.init();
  resetScene();
  state.mode = "playing";
  els.title.classList.add("hidden");
  els.end.classList.add("hidden");
  els.hud.hidden = false;
  els.touch.hidden = !state.isTouch;
  document.body.classList.remove("on-foot");
  showToast("GRAB A RIDE", "Steal a car and head east out of the city", "hot", 2600);
  updateHud(true);
  last = performance.now();
}

function triggerEnd(kind) {
  if (state.mode !== "playing") return;
  state.mode = "ending";
  state.pendingEnd = kind;
  state.endTimer = 1.5;
  audio.setSiren(false);
  audio.setEngine(false, 0);
  els.touch.hidden = true;
  els.prompt.hidden = true;
  els.bust.hidden = true;
  if (kind === "complete") {
    audio.sting("win");
    celebrate(GOAL.x, GOAL.y);
    state.shake = 8;
  } else {
    audio.sting("lose");
    if (kind === "wasted") {
      explode(state.player.x, state.player.y, true);
      state.shake = 24;
    }
  }
}

function showEnd(kind) {
  state.mode = kind;
  els.end.classList.remove("hidden");
  els.end.hidden = false;
  els.hud.hidden = true;
  els.touch.hidden = true;
  els.endTitle.classList.toggle("fail", kind !== "complete");
  if (kind === "complete") {
    els.endKicker.textContent = "MISSION COMPLETE";
    els.endTitle.textContent = "HOME FREE";
    els.endCopy.textContent = "You made it to the house. The desert swallows the sirens behind you. Tom Taylor owes you a cold one.";
  } else if (kind === "wasted") {
    els.endKicker.textContent = "MISSION FAILED";
    els.endTitle.textContent = "WASTED";
    els.endCopy.textContent = "The ride is scrap and so are you. The city always wins when you stop moving.";
  } else {
    els.endKicker.textContent = "MISSION FAILED";
    els.endTitle.textContent = "BUSTED";
    els.endCopy.textContent = "They boxed you in on foot. Next time, keep the engine running and never look back.";
  }
  els.statTime.textContent = formatTime(state.elapsed);
  els.statSpeed.textContent = Math.round(state.topSpeed);
  els.statCops.textContent = state.copsWrecked;
  els.statStars.textContent = state.maxStars;
  audio.stopAll();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Action: steal / exit                                                */
/* ------------------------------------------------------------------ */
function playerPoint() {
  return state.player.car || state.player;
}

function findNearestRide() {
  const p = state.player;
  let best = null;
  let bestD = 108;
  for (const v of state.vehicles) {
    if (v.wreck || v.driver !== "none" || v.isCop) continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function doAction() {
  if (state.mode !== "playing") return;
  const p = state.player;
  if (p.car) {
    const speed = Math.hypot(p.car.vx, p.car.vy);
    if (speed > 175) {
      showToast("TOO FAST", "Slow down before you bail out", "cold", 1400);
      return;
    }
    const car = p.car;
    const side = p.car.wid / 2 + 17;
    const candidates = [
      { x: car.x - Math.sin(car.angle) * side, y: car.y + Math.cos(car.angle) * side },
      { x: car.x + Math.sin(car.angle) * side, y: car.y - Math.cos(car.angle) * side },
      { x: car.x - Math.cos(car.angle) * (car.len / 2 + 20), y: car.y - Math.sin(car.angle) * (car.len / 2 + 20) },
    ];
    let spot = candidates[0];
    for (const c of candidates) {
      if (!circleHitsSolid(state.world, c.x, c.y, 12)) { spot = c; break; }
    }
    car.driver = "none";
    car.isPlayerCar = false;
    p.car = null;
    p.x = spot.x;
    p.y = spot.y;
    p.angle = car.angle;
    p.vx = 0; p.vy = 0;
    audio.blip("steal");
    showToast("ON FOOT", "Find another ride or keep running", "cold", 1400);
    return;
  }

  const ride = findNearestRide();
  if (!ride) return;
  p.car = ride;
  ride.driver = "player";
  ride.isPlayerCar = true;
  ride.hitCd = 0;
  p.x = ride.x;
  p.y = ride.y;
  p.angle = ride.angle;
  state.heat = Math.max(state.heat, 2);
  state.wanted = Math.min(5, Math.floor(state.heat));
  state.maxStars = Math.max(state.maxStars, state.wanted);
  state.spawnTimer = Math.min(state.spawnTimer, 1.6);
  if (state.cops.length < 2) {
    spawnCop();
    spawnCop();
  }
  audio.blip("steal");
  state.shake = 4;
  showToast("RIDE STOLEN", "Every cop in the county saw that", "hot", 2200);
  updateHud(true);
}

/* ------------------------------------------------------------------ */
/* Vehicle physics                                                     */
/* ------------------------------------------------------------------ */
function updateVehicle(v, dt, world, controls) {
  const throttle = clamp(controls.throttle || 0, -1, 1);
  const steer = clamp(controls.steer || 0, -1, 1);
  const handbrake = !!controls.handbrake;

  if (v.wreck) {
    v.vx *= Math.exp(-3.2 * dt);
    v.vy *= Math.exp(-3.2 * dt);
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.hitCd = Math.max(0, v.hitCd - dt);
    v.wallHitCd = Math.max(0, v.wallHitCd - dt);
    return;
  }

  const paved = onPaved(world, v.x, v.y);
  const surfaceMax = v.max * (paved ? 1 : 0.7);
  const surfaceAccel = v.accel * (paved ? 1 : 0.58);

  const fwdX = Math.cos(v.angle);
  const fwdY = Math.sin(v.angle);
  const rightX = -fwdY;
  const rightY = fwdX;

  let vF = v.vx * fwdX + v.vy * fwdY;
  let vR = v.vx * rightX + v.vy * rightY;

  if (throttle > 0) {
    if (vF > surfaceMax) vF -= (vF - surfaceMax) * 1.8 * dt;
    else vF += surfaceAccel * throttle * dt;
  } else if (throttle < 0) {
    if (vF > 25) vF -= surfaceMax * 1.35 * dt;
    else vF += surfaceAccel * 0.5 * throttle * dt;
  }

  // rolling resistance
  const drag = paved ? 0.5 : 1.15;
  vF -= vF * drag * dt;
  if (!throttle) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (paved ? 26 : 60) * dt);
  if (handbrake) vF -= vF * 1.5 * dt;
  vF = clamp(vF, -surfaceMax * 0.36, surfaceMax);

  const speedRatio = Math.min(1, Math.abs(vF) / 140);
  if (Math.abs(vF) > 5) {
    const gripMul = handbrake ? 1.32 : 1;
    v.angle += steer * v.turn * gripMul * dt * speedRatio * (vF < 0 ? -1 : 1);
  }

  const grip = handbrake ? 2.3 : v.grip;
  vR *= Math.exp(-grip * dt);

  v.vx = fwdX * vF + rightX * vR;
  v.vy = fwdY * vF + rightY * vR;
  v.x += v.vx * dt;
  v.y += v.vy * dt;

  // world bounds
  const pad = 28;
  if (v.x < pad) { v.x = pad; v.vx = Math.abs(v.vx) * 0.3; }
  if (v.x > WORLD.w - pad) { v.x = WORLD.w - pad; v.vx = -Math.abs(v.vx) * 0.3; }
  if (v.y < pad) { v.y = pad; v.vy = Math.abs(v.vy) * 0.3; }
  if (v.y > WORLD.h - pad) { v.y = WORLD.h - pad; v.vy = -Math.abs(v.vy) * 0.3; }

  v.hitCd = Math.max(0, v.hitCd - dt);
  v.wallHitCd = Math.max(0, v.wallHitCd - dt);
}

function playerControls() {
  let steer = 0;
  let throttle = 0;
  if (has(ARROW_KEYS.left)) steer -= 1;
  if (has(ARROW_KEYS.right)) steer += 1;
  if (has(ARROW_KEYS.up)) throttle += 1;
  if (has(ARROW_KEYS.down)) throttle -= 1;
  if (touchInput.active) {
    steer += touchInput.x;
    if (touchInput.y < -0.38) throttle = Math.max(throttle, 0.9);
    if (touchInput.y > 0.45) throttle = -1;
  }
  if (touchInput.gas) throttle = 1;
  if (touchInput.brake) throttle = -1;
  return {
    steer: clamp(steer, -1, 1),
    throttle: clamp(throttle, -1, 1),
    handbrake: keys.has("Space") || touchInput.drift || touchInput.brake,
  };
}

function updatePlayer(dt) {
  const p = state.player;
  if (p.car) {
    updateVehicle(p.car, dt, state.world, playerControls());
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    const speed = Math.hypot(p.car.vx, p.car.vy);
    state.topSpeed = Math.max(state.topSpeed, speed * 0.32);
    p.invuln = Math.max(0, p.invuln - dt);
    return;
  }

  let mx = 0;
  let my = 0;
  if (has(ARROW_KEYS.left)) mx -= 1;
  if (has(ARROW_KEYS.right)) mx += 1;
  if (has(ARROW_KEYS.up)) my -= 1;
  if (has(ARROW_KEYS.down)) my += 1;
  if (touchInput.active) { mx += touchInput.x; my += touchInput.y; }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  p.invuln = Math.max(0, p.invuln - dt);
  if (len > 0.12) {
    const speed = 218;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.walk += dt * 11;
  }
  p.x = clamp(p.x, 18, WORLD.w - 18);
  p.y = clamp(p.y, 18, WORLD.h - 18);

  // Building collision
  for (let i = 0; i < 2; i++) {
    const s = circleHitsSolid(state.world, p.x, p.y, 11);
    if (!s) break;
    const nx = clamp(p.x, s.x, s.x + s.w);
    const ny = clamp(p.y, s.y, s.y + s.h);
    let dx = p.x - nx, dy = p.y - ny;
    let d = Math.hypot(dx, dy);
    if (d < 0.01) {
      const left = p.x - s.x, right = s.x + s.w - p.x, top = p.y - s.y, bottom = s.y + s.h - p.y;
      const m = Math.min(left, right, top, bottom);
      dx = m === left ? -1 : m === right ? 1 : 0;
      dy = m === top ? -1 : m === bottom ? 1 : 0;
      d = 0;
    }
    const inv = d > 0 ? 1 / d : 1;
    const push = 11 - d;
    p.x += dx * inv * push;
    p.y += dy * inv * push;
  }
}

/* ------------------------------------------------------------------ */
/* Police                                                              */
/* ------------------------------------------------------------------ */
function spawnCop(forceAhead = false) {
  const p = playerPoint();
  const heading = p.angle || 0;
  const world = state.world;
  const car = state.player.car;
  const onHighway = !!car && p.x > 3150 && p.x < WORLD.w - 500 && Math.abs(p.y - HIGHWAY_Y) < 165;

  for (let attempt = 0; attempt < 22; attempt++) {
    let x, y, ang;
    if (onHighway) {
      // Road units: spawn along the highway so the chase never dies out here.
      const ahead = forceAhead || Math.random() < 0.5;
      const dir = ahead ? 1 : -1;
      x = p.x + dir * (760 + Math.random() * 480);
      y = HIGHWAY_Y + (Math.random() < 0.5 ? -34 : 34);
      if (x < 3250 || x > 12100) continue;
      ang = dir > 0 ? Math.PI : 0;
      if (Math.random() < 0.35) ang += Math.PI; // some take the opposite lane
      if (circleHitsSolid(world, x, y, 44)) continue;
    } else {
      const ahead = forceAhead || (state.wanted >= 4 && Math.random() < 0.24);
      const base = ahead ? heading : heading + Math.PI;
      const spread = ahead ? 0.35 : 1.15;
      ang = base + (Math.random() * 2 - 1) * spread + (Math.random() < 0.2 ? Math.PI : 0);
      const d = ahead ? 1350 : 1050 + Math.random() * 450;
      x = p.x + Math.cos(ang) * d;
      y = p.y + Math.sin(ang) * d;
      if (x < 90 || x > WORLD.w - 90 || y < 90 || y > WORLD.h - 90) continue;
      if (circleHitsSolid(world, x, y, 46)) continue;
      if (Math.hypot(x - p.x, y - p.y) < 720) continue;
    }
    let blocked = false;
    for (const c of state.cops) {
      if (Math.hypot(c.x - x, c.y - y) < 110) { blocked = true; break; }
    }
    if (blocked) continue;
    const cop = vehicle("police", x, y, Math.atan2(p.y - y, p.x - x), "#e9e7df", { cop: true });
    cop.baseMax = 440 + Math.random() * 12;
    cop.max = cop.baseMax;
    cop.health = 106;
    cop.maxHealth = 106;
    state.vehicles.push(cop);
    state.cops.push(cop);
    return cop;
  }
  return null;
}

function updateCops(dt) {
  const p = playerPoint();
  const pOnFoot = !state.player.car;
  for (const cop of state.cops) {
    if (cop.wreck) continue;
    // Rubber-band the pursuit so the pack stays in the fight.
    const chaseD = Math.hypot(cop.x - p.x, cop.y - p.y);
    const catchUp = chaseD > 850 ? Math.min(95, (chaseD - 850) * 0.055) : 0;
    cop.max = cop.baseMax + state.wanted * 7 + catchUp;

    const aim = p.car ? { x: p.x + p.car.vx * 0.22, y: p.y + p.car.vy * 0.22 } : p;
    let dx = aim.x - cop.x;
    let dy = aim.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    const desired = Math.atan2(dy, dx);
    let diff = wrapAngle(desired - cop.angle);

    // Building avoidance feelers
    const feel = (a, len) => pointInSolid(state.world, cop.x + Math.cos(a) * len, cop.y + Math.sin(a) * len);
    if (feel(cop.angle, 120)) {
      const leftFree = !feel(cop.angle + 0.75, 110);
      const rightFree = !feel(cop.angle - 0.75, 110);
      if (leftFree && !rightFree) diff += 0.9;
      else if (rightFree && !leftFree) diff -= 0.9;
      else if (leftFree) diff += 0.6;
      else if (rightFree) diff -= 0.6;
      else diff += (cop.id % 2 ? 1 : -1) * 1.1;
    }

    let steer = clamp(diff * 1.9, -1, 1);
    let throttle = 1;

    if (Math.abs(diff) > 1.35) throttle = 0.62;
    if (d < 125 && Math.abs(diff) > 1.0) throttle = -0.35;

    if (pOnFoot) {
      if (d < 210) throttle = 0.45;
      if (d < 120) throttle = 0;
      if (d < 80) throttle = -0.2;
    }

    // Don't rear-end other cops
    for (const other of state.cops) {
      if (other === cop || other.wreck) continue;
      const od = Math.hypot(other.x - cop.x, other.y - cop.y);
      if (od < 90) { throttle = Math.min(throttle, 0.5); break; }
    }

    // Stuck against a wall? Reverse out.
    const speed = Math.hypot(cop.vx, cop.vy);
    if (cop.reverseT > 0) {
      cop.reverseT -= dt;
      throttle = -1;
      steer = -steer;
    } else if (speed < 24 && throttle > 0) {
      cop.stuck += dt;
      if (cop.stuck > 1.05) {
        cop.stuck = 0;
        cop.reverseT = 0.85;
        throttle = -1;
        steer = -steer;
      }
    } else {
      cop.stuck = Math.max(0, cop.stuck - dt * 0.8);
    }

    updateVehicle(cop, dt, state.world, { throttle, steer, handbrake: false });
  }
  state.cops = state.cops.filter((c) => !c.wreck);
}

/* ------------------------------------------------------------------ */
/* Collisions                                                          */
/* ------------------------------------------------------------------ */
function resolveVehicleWorld(v) {
  if (v.wreck) return;
  const speed = Math.hypot(v.vx, v.vy);
  let hitSomething = false;
  for (const off of [-0.32, 0, 0.32]) {
    const ox = v.x + Math.cos(v.angle) * off * v.len;
    const oy = v.y + Math.sin(v.angle) * off * v.len;
    const r = v.wid * 0.63;
    const s = circleHitsSolid(state.world, ox, oy, r);
    if (!s) continue;
    let nx = clamp(ox, s.x, s.x + s.w);
    let ny = clamp(oy, s.y, s.y + s.h);
    let dx = ox - nx, dy = oy - ny;
    let d = Math.hypot(dx, dy);
    if (d < 0.01) {
      const left = ox - s.x, right = s.x + s.w - ox, top = oy - s.y, bottom = s.y + s.h - oy;
      const m = Math.min(left, right, top, bottom);
      dx = m === left ? -1 : m === right ? 1 : 0;
      dy = m === top ? -1 : m === bottom ? 1 : 0;
      d = 0;
    }
    const inv = d > 0 ? 1 / d : 1;
    const push = r - d;
    v.x += dx * inv * push;
    v.y += dy * inv * push;
    const vn = v.vx * (dx * inv) + v.vy * (dy * inv);
    if (vn < 0) {
      v.vx -= dx * inv * vn * 1.15;
      v.vy -= dy * inv * vn * 1.15;
    }
    hitSomething = true;
    if (speed > 195 && v.wallHitCd <= 0) {
      v.wallHitCd = 0.32;
      if (v.isPlayerCar) {
        v.health -= Math.min(18, (speed - 170) * 0.055);
        state.shake = Math.max(state.shake, 4 + speed * 0.012);
        audio.crash(0.6);
        emitSparks(ox, oy, 5);
      } else if (v.isCop) {
        v.health -= Math.min(12, (speed - 170) * 0.04);
      }
    }
  }
  if (hitSomething) {
    v.vx *= 0.94;
    v.vy *= 0.94;
  }
}

function vehicleCircles(v) {
  const out = [];
  const cos = Math.cos(v.angle);
  const sin = Math.sin(v.angle);
  const r = v.wid * 0.68;
  for (const off of [-0.3, 0, 0.3]) {
    out.push({ x: v.x + cos * off * v.len, y: v.y + sin * off * v.len, r });
  }
  return out;
}

function resolveCarCars() {
  const cars = state.vehicles;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const broad = (a.len + b.len) * 0.62;
      if (Math.abs(a.x - b.x) > broad || Math.abs(a.y - b.y) > broad) continue;
      if (a.wreck && b.wreck) continue;
      const ca = vehicleCircles(a);
      const cb = vehicleCircles(b);
      let collided = false;
      let contactX = 0, contactY = 0;
      for (const p1 of ca) {
        for (const p2 of cb) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const rr = p1.r + p2.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const overlap = rr - d;
          const aw = a.wreck ? 0.1 : b.wreck ? 1 : 0.5;
          const bw = b.wreck ? 0.1 : a.wreck ? 1 : 0.5;
          a.x -= nx * overlap * aw;
          a.y -= ny * overlap * aw;
          b.x += nx * overlap * bw;
          b.y += ny * overlap * bw;

          const rvx = a.vx - b.vx;
          const rvy = a.vy - b.vy;
          const rel = rvx * nx + rvy * ny;
          if (rel > 0) {
            const imp = rel * 0.52;
            if (!a.wreck) { a.vx -= nx * imp; a.vy -= ny * imp; }
            if (!b.wreck) { b.vx += nx * imp; b.vy += ny * imp; }
          }
          collided = true;
          contactX = (p1.x + p2.x) / 2;
          contactY = (p1.y + p2.y) / 2;
        }
      }
      if (!collided) continue;

      const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
      const aPlayer = a.isPlayerCar;
      const bPlayer = b.isPlayerCar;
      const aCop = a.isCop;
      const bCop = b.isCop;

      if (a.hitCd <= 0 && b.hitCd <= 0 && relSpeed > 70) {
        if ((aPlayer && bCop) || (bPlayer && aCop)) {
          const playerV = aPlayer ? a : b;
          const copV = aPlayer ? b : a;
          playerV.health -= 5.5 + relSpeed * 0.022;
          copV.health -= 8.5 + relSpeed * 0.03;
          a.hitCd = 0.38;
          b.hitCd = 0.38;
          state.shake = Math.max(state.shake, 4 + relSpeed * 0.02);
          audio.crash(Math.min(1, relSpeed / 260));
          emitSparks(contactX, contactY, 8);
          state.heat = Math.min(5.6, state.heat + 0.055);
        } else if ((aPlayer || bPlayer) && relSpeed > 150) {
          const playerV = aPlayer ? a : b;
          playerV.health -= 2.5;
          a.hitCd = 0.3;
          b.hitCd = 0.3;
          state.shake = Math.max(state.shake, 3);
          emitSparks(contactX, contactY, 4);
        }
      }
    }
  }
}

function resolvePlayerOnFoot() {
  const p = state.player;
  if (p.car) return;
  for (const v of state.vehicles) {
    if (v === p.car) continue;
    const cos = Math.cos(v.angle);
    const sin = Math.sin(v.angle);
    const closest = clamp((p.x - v.x) * cos + (p.y - v.y) * sin, -v.len * 0.45, v.len * 0.45);
    const cx = v.x + cos * closest;
    const cy = v.y + sin * closest;
    const d = Math.hypot(p.x - cx, p.y - cy);
    const rr = v.wid * 0.7 + 9;
    if (d >= rr) continue;
    const speed = Math.hypot(v.vx, v.vy);
    const nx = d > 0.01 ? (p.x - cx) / d : cos;
    const ny = d > 0.01 ? (p.y - cy) / d : sin;
    p.x += nx * (rr - d);
    p.y += ny * (rr - d);
    if (speed > 80 && p.invuln <= 0) {
      p.invuln = 1.1;
      p.health -= v.isCop ? 11 : 7;
      state.shake = Math.max(state.shake, 9);
      audio.crash(0.5);
      emitSparks(p.x, p.y, 5);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Damage / wrecks                                                     */
/* ------------------------------------------------------------------ */
function wreckCop(cop) {
  if (cop.wreck) return;
  cop.wreck = true;
  cop.isCop = false;
  cop.driver = "none";
  cop.vx *= 0.18;
  cop.vy *= 0.18;
  state.copsWrecked++;
  state.heat = Math.min(5.5, state.heat + 0.42);
  explode(cop.x, cop.y, false);
  audio.blip("wreck");
  audio.setSiren(false);
  state.shake = Math.max(state.shake, 12);
  showToast("COP WRECKED", "Heat rising — keep moving", "hot", 1500);
}

function wreckPlayerCar() {
  const car = state.player.car;
  if (!car) return;
  car.wreck = true;
  car.isPlayerCar = false;
  car.driver = "none";
  car.health = 0;
  car.vx *= 0.15;
  car.vy *= 0.15;
  explode(car.x, car.y, true);
  state.shake = Math.max(state.shake, 22);
  audio.crash(1);
  state.player.car = null;
  state.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.wid / 2 + 16);
  state.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.wid / 2 + 16);
  state.player.health -= 22;
  state.player.invuln = 1.2;
  if (state.player.health <= 0) {
    triggerEnd("wasted");
    return;
  }
  showToast("RIDE TOTALED", "Get out and steal another one. Now.", "hot", 2400);
}

function checkWrecksAndBust(dt) {
  for (const cop of state.cops) {
    if (cop.health <= 0 && !cop.wreck) wreckCop(cop);
  }
  state.cops = state.cops.filter((c) => !c.wreck);

  if (state.player.car && state.player.car.health <= 0) {
    wreckPlayerCar();
    if (state.mode !== "playing") return;
  }

  // Busted while on foot
  if (!state.player.car && state.wanted > 0 && state.mode === "playing") {
    let near = false;
    for (const c of state.cops) {
      if (c.wreck) continue;
      if (Math.hypot(c.x - state.player.x, c.y - state.player.y) < 92) { near = true; break; }
    }
    state.bust = near ? state.bust + dt : Math.max(0, state.bust - dt * 2.1);
    if (state.bust >= 1.45) {
      triggerEnd("busted");
      return;
    }
  } else {
    state.bust = Math.max(0, state.bust - dt * 2);
  }

  // Player health
  if (state.player.health <= 0 && state.mode === "playing") {
    triggerEnd("wasted");
  }
}

/* ------------------------------------------------------------------ */
/* Wanted level                                                        */
/* ------------------------------------------------------------------ */
function updateWanted(dt) {
  state.wanted = clamp(Math.floor(state.heat + 0.0001), 0, 5);
  state.maxStars = Math.max(state.maxStars, state.wanted);
  if (state.wanted <= 0) return;
  state.spawnTimer -= dt;
  const maxCops = Math.min(7, 2 + state.wanted);
  if (state.cops.length < maxCops && state.spawnTimer <= 0) {
    const spawned = spawnCop();
    state.spawnTimer = spawned ? Math.max(1.7, 4.1 - state.wanted * 0.4) : 0.8;
  }
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */
function emitSparks(x, y, count = 6, color = "#ffb347") {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const sp = 60 + Math.random() * 180;
    state.particles.push({
      type: "spark", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.25 + Math.random() * 0.35, max: 0.6,
      size: 1.6 + Math.random() * 2.4, color,
    });
  }
}

function emitDust(x, y, angle, count = 2) {
  for (let i = 0; i < count; i++) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.3;
    const sp = 20 + Math.random() * 70;
    state.particles.push({
      type: "dust", x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 12,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.55, max: 1.05,
      size: 5 + Math.random() * 9, color: "rgba(212,180,128,1)",
    });
  }
}

function emitSmoke(x, y, dark = true) {
  const a = Math.random() * TAU;
  state.particles.push({
    type: "smoke", x, y,
    vx: Math.cos(a) * 24, vy: Math.sin(a) * 24 - 14,
    life: 0.9 + Math.random() * 0.9, max: 1.8,
    size: 9 + Math.random() * 12, color: dark ? "rgba(40,36,32,1)" : "rgba(190,180,165,1)",
  });
}

function explode(x, y, big = false) {
  const n = big ? 34 : 22;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 60 + Math.random() * (big ? 330 : 220);
    state.particles.push({
      type: i % 3 === 0 ? "smoke" : "spark",
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.9, max: 1.3,
      size: (i % 3 === 0 ? 12 : 2) + Math.random() * 8,
      color: i % 3 === 0 ? "rgba(60,50,42,1)" : (Math.random() > 0.5 ? "#ffb347" : "#ff6a2a"),
    });
  }
  state.particles.push({
    type: "ring", x, y, vx: 0, vy: 0,
    life: big ? 0.8 : 0.55, max: big ? 0.8 : 0.55,
    size: big ? 160 : 90, color: "#ffb347",
  });
}

function celebrate(x, y) {
  const colors = ["#ffb347", "#ff6a2a", "#f4e9d4", "#7bd8ea", "#ff4234"];
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * TAU;
    const sp = 80 + Math.random() * 380;
    state.particles.push({
      type: "confetti", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 1.1 + Math.random() * 1.4, max: 2.5,
      size: 3 + Math.random() * 4, color: colors[i % colors.length],
    });
  }
}

function updateEffects(dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = p.type === "spark" ? 3 : p.type === "confetti" ? 1.2 : 1.6;
    p.vx *= Math.exp(-damp * dt);
    p.vy *= Math.exp(-damp * dt);
    if (p.type === "confetti") p.vy += 45 * dt;
    if (p.type === "dust" || p.type === "smoke") p.size += 20 * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);

  for (const s of state.skids) s.age = (s.age || 0) + dt;
  if (state.skids.length > 900) state.skids.splice(0, state.skids.length - 900);
}

function emitVehicleEffects(v, dt) {
  if (v.wreck) {
    v.smokeT -= dt;
    if (v.smokeT <= 0) {
      v.smokeT = 0.22;
      emitSmoke(v.x + (Math.random() - 0.5) * 14, v.y + (Math.random() - 0.5) * 14, true);
    }
    return;
  }
  const speed = Math.hypot(v.vx, v.vy);
  if (!v.isPlayerCar && !v.isCop) return;

  const cos = Math.cos(v.angle), sin = Math.sin(v.angle);
  const vR = -v.vx * sin + v.vy * cos;
  const drifting = v.isPlayerCar && (Math.abs(vR) > 62 || keys.has("Space") || touchInput.drift) && speed > 95;
  const offroad = !onPaved(state.world, v.x, v.y) && speed > 60;

  if (drifting) {
    const rearX = v.x - cos * v.len * 0.32;
    const rearY = v.y - sin * v.len * 0.32;
    const left = { x: rearX - sin * v.wid * 0.34, y: rearY + cos * v.wid * 0.34 };
    const right = { x: rearX + sin * v.wid * 0.34, y: rearY - cos * v.wid * 0.34 };
    const cur = [left, right];
    if (v.trackPrev) {
      for (let i = 0; i < 2; i++) {
        const a = v.trackPrev[i], b = cur[i];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 3) {
          state.skids.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, age: 0 });
        }
      }
    }
    v.trackPrev = cur;
    if (Math.random() < 0.7) emitDust(rearX, rearY, v.angle, 1);
  } else {
    v.trackPrev = null;
  }

  if (offroad) {
    v.dustT -= dt;
    if (v.dustT <= 0) {
      v.dustT = 0.05;
      emitDust(v.x - cos * v.len * 0.42, v.y - sin * v.len * 0.42, v.angle, 1);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */
function getBaseZoom() {
  const { w, h } = state.view;
  return clamp(Math.min(w / 1250, h / 760), 0.62, 1.08);
}

function updateCamera(dt) {
  const p = playerPoint();
  const car = state.player.car;
  const speed = car ? Math.hypot(car.vx, car.vy) : 0;
  const base = getBaseZoom();
  const targetZoom = base * (1 - clamp(speed / 600, 0, 1) * 0.1);
  state.camera.zoom = lerp(state.camera.zoom, targetZoom, Math.min(1, dt * 2.2));

  let tx = p.x;
  let ty = p.y;
  if (car) {
    tx += car.vx * 0.24;
    ty += car.vy * 0.24;
  }
  if (state.mode === "ending" && state.pendingEnd === "complete") {
    tx = GOAL.x;
    ty = GOAL.y;
  }
  const ease = state.mode === "playing" ? Math.min(1, dt * 3.9) : Math.min(1, dt * 2.2);
  state.camera.x = lerp(state.camera.x, tx, ease);
  state.camera.y = lerp(state.camera.y, ty, ease);

  const halfW = state.view.w / (2 * state.camera.zoom);
  const halfH = state.view.h / (2 * state.camera.zoom);
  state.camera.x = clamp(state.camera.x, halfW, WORLD.w - halfW);
  state.camera.y = clamp(state.camera.y, halfH, WORLD.h - halfH);
  state.shake = Math.max(0, state.shake - dt * 34);
}

/* ------------------------------------------------------------------ */
/* Mission check                                                       */
/* ------------------------------------------------------------------ */
function checkMission() {
  const p = playerPoint();
  if (Math.hypot(p.x - GOAL.x, p.y - GOAL.y) < GOAL.r - 12) {
    triggerEnd("complete");
    return;
  }
}

/* ------------------------------------------------------------------ */
/* Main update                                                         */
/* ------------------------------------------------------------------ */
function update(dt) {
  state.time += dt;
  if (state.mode === "title") {
    const s = state.world.spawn;
    state.camera.x = s.x + Math.sin(state.time * 0.14) * 260;
    state.camera.y = s.y - 60 + Math.cos(state.time * 0.11) * 140;
    state.camera.zoom = getBaseZoom() * 1.06;
    updateEffects(dt);
    return;
  }

  if (state.mode === "playing") {
    state.elapsed += dt;
    updatePlayer(dt);
    updateCops(dt);
    for (const v of state.vehicles) {
      if (v === state.player.car || v.isCop || v.wreck) continue;
      updateVehicle(v, dt, state.world, { throttle: 0, steer: 0 });
    }
    for (const v of state.vehicles) {
      if (!v.wreck) resolveVehicleWorld(v);
    }
    resolveCarCars();
    resolvePlayerOnFoot();
    if (state.player.car) {
      state.player.x = state.player.car.x;
      state.player.y = state.player.car.y;
      state.player.angle = state.player.car.angle;
    }
    checkWrecksAndBust(dt);
    if (state.mode !== "playing") return;
    updateWanted(dt);
    for (const v of state.vehicles) emitVehicleEffects(v, dt);
    updateEffects(dt);
    checkMission();
    if (state.mode !== "playing") return;
    updateCamera(dt);

    audio.setEngine(!!state.player.car && !state.player.car.wreck, state.player.car ? clamp(Math.hypot(state.player.car.vx, state.player.car.vy) / 480, 0, 1) : 0);
    audio.setSiren(state.cops.length > 0 && state.wanted > 0);
    updateHud(false);
    return;
  }

  if (state.mode === "ending") {
    state.endTimer -= dt;
    updateEffects(dt);
    updateCamera(dt);
    state.shake = Math.max(0, state.shake - dt * 34);
    if (state.endTimer <= 0) showEnd(state.pendingEnd);
    return;
  }

  updateEffects(dt);
  updateCamera(dt);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function shade(hex, amt) {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = clamp(Math.round(r + amt), 0, 255);
  g = clamp(Math.round(g + amt), 0, 255);
  b = clamp(Math.round(b + amt), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function drawSkids() {
  ctx.lineCap = "round";
  for (const s of state.skids) {
    const alpha = clamp(0.34 - (s.age || 0) * 0.005, 0.05, 0.34);
    ctx.strokeStyle = `rgba(22,20,17,${alpha})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const t = clamp(p.life / p.max, 0, 1);
    if (p.type === "ring") {
      ctx.strokeStyle = `rgba(255,170,70,${t * 0.8})`;
      ctx.lineWidth = 3 + (1 - t) * 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.15 - t * 0.75), 0, TAU);
      ctx.stroke();
    } else if (p.type === "confetti") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.age || p.life) * 4 + p.size);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = t;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
      ctx.restore();
    } else {
      ctx.globalAlpha = p.type === "spark" ? t : t * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.type === "spark" ? t + 0.2 : 1), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawVehicle(v) {
  if (v.wreck) {
    drawWreck(v);
    return;
  }
  const L = v.len, W = v.wid;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);

  // ground shadow
  ctx.fillStyle = "rgba(15,12,8,0.3)";
  roundRect(ctx, -L / 2 + 5, -W / 2 + 6, L, W, 8);
  ctx.fill();

  // wheels
  ctx.fillStyle = "#161514";
  const wl = 11, ww = 5;
  ctx.fillRect(-L * 0.3, -W / 2 - 2, wl, ww);
  ctx.fillRect(-L * 0.3, W / 2 - ww + 2, wl, ww);
  ctx.fillRect(L * 0.16, -W / 2 - 2, wl, ww);
  ctx.fillRect(L * 0.16, W / 2 - ww + 2, wl, ww);

  // body
  const body = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  body.addColorStop(0, shade(v.color, 34));
  body.addColorStop(0.45, v.color);
  body.addColorStop(1, shade(v.color, -38));
  ctx.fillStyle = body;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // type details
  ctx.fillStyle = "rgba(20,24,28,0.82)";
  if (v.type === "sports") {
    roundRect(ctx, -L * 0.17, -W * 0.33, L * 0.44, W * 0.66, 5); ctx.fill();
    ctx.fillStyle = "rgba(140,190,205,0.55)";
    roundRect(ctx, L * 0.08, -W * 0.28, L * 0.15, W * 0.56, 3); ctx.fill();
    ctx.fillStyle = "rgba(245,238,220,0.35)";
    ctx.fillRect(-L * 0.44, -2.5, L * 0.16, 5);
  } else if (v.type === "pickup") {
    ctx.fillStyle = "rgba(20,24,28,0.82)";
    roundRect(ctx, L * 0.03, -W * 0.35, L * 0.22, W * 0.7, 4); ctx.fill();
    ctx.fillStyle = "rgba(135,180,195,0.5)";
    roundRect(ctx, L * 0.12, -W * 0.28, L * 0.1, W * 0.56, 3); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-L * 0.44, -W * 0.36, L * 0.4, W * 0.72);
    ctx.beginPath(); ctx.moveTo(-L * 0.44, 0); ctx.lineTo(-L * 0.04, 0); ctx.stroke();
  } else if (v.type === "van") {
    roundRect(ctx, -L * 0.34, -W * 0.36, L * 0.65, W * 0.72, 5); ctx.fill();
    ctx.fillStyle = "rgba(135,180,195,0.45)";
    roundRect(ctx, L * 0.2, -W * 0.28, L * 0.09, W * 0.56, 3); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-L * 0.32, -W * 0.3); ctx.lineTo(-L * 0.32, W * 0.3); ctx.stroke();
  } else {
    roundRect(ctx, -L * 0.16, -W * 0.35, L * 0.44, W * 0.7, 5); ctx.fill();
    ctx.fillStyle = "rgba(135,180,195,0.5)";
    roundRect(ctx, L * 0.09, -W * 0.28, L * 0.13, W * 0.56, 3); ctx.fill();
  }

  // police livery + lights
  if (v.isCop) {
    ctx.fillStyle = "#202833";
    ctx.fillRect(-L * 0.22, -W / 2 + 2, L * 0.42, 3.4);
    ctx.fillRect(-L * 0.22, W / 2 - 5.4, L * 0.42, 3.4);
    ctx.fillStyle = "#e9e7df";
    ctx.fillRect(-L * 0.02, -W / 2 + 1, 6, W - 2);
    const flash = Math.sin(state.time * 14 + v.phase) > 0;
    ctx.fillStyle = flash ? "#ff3226" : "#3a6dff";
    roundRect(ctx, -3, -W * 0.3, 11, W * 0.6, 2);
    ctx.fill();
    ctx.fillStyle = flash ? "#3a6dff" : "#ff3226";
    ctx.fillRect(-3, -W * 0.28, 11, 3);
    ctx.fillRect(-3, W * 0.28 - 3, 11, 3);
  }

  // headlights & taillights
  ctx.fillStyle = "rgba(255,238,180,0.95)";
  ctx.fillRect(L / 2 - 4, -W * 0.34, 3, 4.5);
  ctx.fillRect(L / 2 - 4, W * 0.34 - 4.5, 3, 4.5);
  ctx.fillStyle = "rgba(255,60,45,0.9)";
  ctx.fillRect(-L / 2 + 1, -W * 0.34, 3, 4);
  ctx.fillRect(-L / 2 + 1, W * 0.34 - 4, 3, 4);

  if (v.isPlayerCar) {
    ctx.strokeStyle = "rgba(255,138,42,0.55)";
    ctx.lineWidth = 1.6;
    roundRect(ctx, -L / 2 - 2, -W / 2 - 2, L + 4, W + 4, 8);
    ctx.stroke();
  }
  ctx.restore();

  // siren glow (in world space)
  if (v.isCop) {
    const flash = Math.sin(state.time * 14 + v.phase) > 0;
    const gx = v.x + Math.cos(v.angle) * (v.len * 0.42);
    const gy = v.y + Math.sin(v.angle) * (v.len * 0.42);
    const halo = ctx.createRadialGradient(v.x, v.y, 2, v.x, v.y, 54);
    halo.addColorStop(0, flash ? "rgba(255,60,40,0.3)" : "rgba(70,120,255,0.3)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(v.x, v.y, 54, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? "rgba(255,70,50,0.85)" : "rgba(110,150,255,0.85)";
    ctx.beginPath(); ctx.arc(gx, gy, 3.4, 0, TAU); ctx.fill();
  }
}

function drawWreck(v) {
  const L = v.len, W = v.wid;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  ctx.fillStyle = "rgba(15,12,8,0.3)";
  roundRect(ctx, -L / 2 + 5, -W / 2 + 6, L, W, 8);
  ctx.fill();
  ctx.fillStyle = "#2c2925";
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.fillStyle = "#191715";
  roundRect(ctx, -L * 0.2, -W * 0.3, L * 0.4, W * 0.6, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,90,60,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-L * 0.45, -W * 0.2); ctx.lineTo(L * 0.1, W * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-L * 0.2, W * 0.35); ctx.lineTo(L * 0.35, -W * 0.25); ctx.stroke();
  ctx.fillStyle = "rgba(255,110,30,0.55)";
  ctx.beginPath(); ctx.arc(L * 0.1, W * 0.1, 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawPlayerOnFoot() {
  const p = state.player;
  if (p.car) return;
  if (p.invuln > 0 && Math.floor(state.time * 16) % 2 === 0) return;
  const moving = Math.hypot(touchInput.x, touchInput.y) > 0.05 || has(ARROW_KEYS.up) || has(ARROW_KEYS.down) || has(ARROW_KEYS.left) || has(ARROW_KEYS.right);
  const swing = Math.sin(p.walk) * (moving ? 1 : 0);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = "rgba(15,12,8,0.28)";
  ctx.beginPath(); ctx.ellipse(3, 5, 14, 8, 0.3, 0, TAU); ctx.fill();
  // legs
  ctx.fillStyle = "#27313b";
  ctx.fillRect(-7, -6.5 + swing * 2.4, 10, 4.5);
  ctx.fillRect(-7, 2 - swing * 2.4, 10, 4.5);
  // torso
  const jacket = ctx.createLinearGradient(-8, -8, 8, 8);
  jacket.addColorStop(0, "#f08a34");
  jacket.addColorStop(1, "#c25a1e");
  ctx.fillStyle = jacket;
  roundRect(ctx, -7, -7.5, 15, 15, 6);
  ctx.fill();
  // arms
  ctx.fillStyle = "#d9732a";
  ctx.fillRect(-1, -9.5 - swing * 1.5, 7, 4);
  ctx.fillRect(-1, 5.5 + swing * 1.5, 7, 4);
  // head
  ctx.fillStyle = "#c78a61";
  ctx.beginPath(); ctx.arc(5, 0, 5.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2a2119";
  ctx.beginPath(); ctx.arc(4, 0, 5.2, Math.PI * 0.65, Math.PI * 1.35); ctx.fill();
  ctx.restore();

  // marker dot above player
  const bob = Math.sin(state.time * 3) * 3;
  ctx.fillStyle = "rgba(255,138,42,0.9)";
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 26 + bob);
  ctx.lineTo(p.x - 5, p.y - 34 + bob);
  ctx.lineTo(p.x + 5, p.y - 34 + bob);
  ctx.closePath();
  ctx.fill();
}

function worldToScreen(x, y) {
  return {
    x: (x - state.camera.x) * state.camera.zoom + state.view.w / 2,
    y: (y - state.camera.y) * state.camera.zoom + state.view.h / 2,
  };
}

function drawMarkers() {
  if (state.mode === "title") return;
  const { w, h } = state.view;
  const zoom = state.camera.zoom;
  const s = worldToScreen(GOAL.x, GOAL.y);
  const p = playerPoint();
  const d = Math.hypot(p.x - GOAL.x, p.y - GOAL.y);
  const distText = d > 20000 ? "—" : `${(d / 2000).toFixed(1)} KM`;

  const onScreen = s.x > 70 && s.x < w - 70 && s.y > 90 && s.y < h - 70;
  if (onScreen) {
    ctx.save();
    ctx.textAlign = "center";
    const bob = Math.sin(state.time * 2.4) * 3;
    const y = s.y - 118 * zoom + bob;
    ctx.fillStyle = "rgba(255,180,60,0.95)";
    ctx.beginPath();
    ctx.moveTo(s.x, y + 10);
    ctx.lineTo(s.x - 8, y);
    ctx.lineTo(s.x, y - 10);
    ctx.lineTo(s.x + 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.font = '600 12px "Barlow Condensed", sans-serif';
    ctx.fillStyle = "rgba(244,233,212,0.92)";
    ctx.fillText("TOM TAYLOR'S HOUSE", s.x, y - 18);
    ctx.fillStyle = "rgba(255,180,70,0.85)";
    ctx.font = '700 10px "Barlow Condensed", sans-serif';
    ctx.fillText(distText, s.x, y + 25);
    ctx.restore();
    return;
  }

  // off-screen arrow
  const cx = w / 2, cy = h / 2;
  let dx = s.x - cx, dy = s.y - cy;
  const ang = Math.atan2(dy, dx);
  const marginX = 74, marginTop = 110, marginBottom = 98;
  const rx = (w / 2 - marginX) / Math.max(0.001, Math.abs(Math.cos(ang)));
  const ry = (h / 2 - (ang < 0 ? marginTop : marginBottom)) / Math.max(0.001, Math.abs(Math.sin(ang)));
  const r = Math.min(rx, ry);
  const ax = cx + Math.cos(ang) * r;
  const ay = cy + Math.sin(ang) * r;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  const pulse = 1 + Math.sin(state.time * 4) * 0.08;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "rgba(255,160,45,0.95)";
  ctx.shadowColor = "rgba(255,120,20,0.7)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-9, -12);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-9, 12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = '700 11px "Barlow Condensed", sans-serif';
  const label = "DESERT HOUSE";
  const text = `${label} · ${distText}`;
  const tw = ctx.measureText(text).width;
  // Keep the label inboard of the arrow so it never sits under the top HUD
  // or the bottom touch controls. Side arrows get a side label, vertical
  // arrows get a label above/below.
  const cosA = Math.cos(ang), sinA = Math.sin(ang);
  let lx, ly;
  if (Math.abs(cosA) >= Math.abs(sinA)) {
    const inward = cosA > 0 ? -1 : 1;
    lx = ax + inward * (tw / 2 + 34);
    ly = ay;
  } else {
    lx = ax;
    ly = ay + (sinA > 0 ? -34 : 34);
  }
  lx = clamp(lx, 70, w - 70);
  ly = clamp(ly, 40, h - 40);

  // Never let the floating label sit on top of the player's ride, especially
  // on narrow phones where the arrow and the car are close together.
  const ps = worldToScreen(p.x, p.y);
  const overlapsPlayer = Math.abs(lx - ps.x) < tw / 2 + 46 && Math.abs(ly - ps.y) < 42;
  if (!overlapsPlayer) {
    ctx.fillStyle = "rgba(10,8,6,0.62)";
    ctx.fillRect(lx - tw / 2 - 7, ly - 11, tw + 14, 17);
    ctx.fillStyle = "rgba(244,233,212,0.9)";
    ctx.fillText(text, lx, ly);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Minimap                                                             */
/* ------------------------------------------------------------------ */
function drawMinimap() {
  const size = 176;
  const R = size / 2;
  const p = playerPoint();
  const range = 2100;
  const scale = (R - 8) / range;
  const ang = p.angle || 0;

  mctx.clearRect(0, 0, size, size);
  mctx.save();
  mctx.beginPath();
  mctx.arc(R, R, R - 1, 0, TAU);
  mctx.clip();
  mctx.fillStyle = "#17130e";
  mctx.fillRect(0, 0, size, size);

  mctx.save();
  mctx.translate(R, R);
  mctx.scale(scale, scale);
  mctx.translate(-p.x, -p.y);

  // desert base
  mctx.fillStyle = "rgba(118,94,61,0.4)";
  mctx.fillRect(p.x - range, p.y - range, range * 2, range * 2);
  if (p.x + range > CITY.x0 && p.x - range < CITY.x1 && p.y + range > CITY.y0 && p.y - range < CITY.y1) {
    mctx.fillStyle = "rgba(48,52,56,0.95)";
    mctx.fillRect(CITY.x0, CITY.y0, CITY.x1 - CITY.x0, CITY.y1 - CITY.y0);
  }

  // parks and lots
  for (const pk of state.world.parks) {
    mctx.fillStyle = "rgba(72,100,55,0.65)";
    mctx.fillRect(pk.x, pk.y, pk.w, pk.h);
  }
  for (const lot of state.world.lots) {
    mctx.fillStyle = "rgba(78,78,72,0.8)";
    mctx.fillRect(lot.x, lot.y, lot.w, lot.h);
  }

  // buildings
  mctx.fillStyle = "rgba(17,16,14,0.82)";
  for (const b of state.world.buildings) {
    if (b.x + b.w < p.x - range || b.x > p.x + range || b.y + b.h < p.y - range || b.y > p.y + range) continue;
    mctx.fillRect(b.x, b.y, b.w, b.h);
  }

  // highways and streets on top for legibility
  for (const r of state.world.roads) {
    if (r.x + r.w < p.x - range || r.x > p.x + range || r.y + r.h < p.y - range || r.y > p.y + range) continue;
    if (r.kind === "highway") {
      mctx.fillStyle = "rgba(229,187,96,0.9)";
      mctx.fillRect(r.x - 35, r.y, r.w + 70, r.h);
    } else if (r.kind === "driveway") {
      mctx.fillStyle = "rgba(210,205,190,0.65)";
      mctx.fillRect(r.x, r.y, r.w, r.h);
    } else {
      mctx.fillStyle = "rgba(205,199,184,0.58)";
      mctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }

  // house
  const hx = state.world.house;
  mctx.fillStyle = "rgba(255,155,65,0.95)";
  mctx.fillRect(hx.x, hx.y, hx.w, hx.h);

  // goal
  const gd = Math.hypot(GOAL.x - p.x, GOAL.y - p.y);
  if (gd < range - 120) {
    mctx.fillStyle = "#ffb347";
    mctx.beginPath();
    mctx.arc(GOAL.x, GOAL.y, 44, 0, TAU);
    mctx.fill();
    mctx.strokeStyle = "rgba(255,200,110,0.5)";
    mctx.lineWidth = 14;
    mctx.beginPath(); mctx.arc(GOAL.x, GOAL.y, 75, 0, TAU); mctx.stroke();
  }

  // cops
  for (const c of state.cops) {
    if (c.wreck) continue;
    const a = Math.sin(state.time * 6 + c.id) > 0;
    mctx.fillStyle = a ? "#ff4b3d" : "#5b8dff";
    mctx.beginPath();
    mctx.arc(c.x, c.y, 34, 0, TAU);
    mctx.fill();
    mctx.strokeStyle = "rgba(0,0,0,0.4)";
    mctx.lineWidth = 10;
    mctx.stroke();
  }
  mctx.restore();

  // goal off-map indicator
  if (gd >= range - 120) {
    const angG = Math.atan2(GOAL.y - p.y, GOAL.x - p.x);
    const ex = R + Math.cos(angG) * (R - 15);
    const ey = R + Math.sin(angG) * (R - 15);
    mctx.save();
    mctx.translate(ex, ey);
    mctx.rotate(angG);
    mctx.fillStyle = "#ffb347";
    mctx.beginPath();
    mctx.moveTo(7, 0); mctx.lineTo(-5, -6); mctx.lineTo(-2, 0); mctx.lineTo(-5, 6);
    mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  // player arrow
  mctx.save();
  mctx.translate(R, R);
  mctx.rotate(ang);
  mctx.fillStyle = "#f8efdd";
  mctx.strokeStyle = "rgba(0,0,0,0.55)";
  mctx.lineWidth = 1.5;
  mctx.beginPath();
  mctx.moveTo(8, 0);
  mctx.lineTo(-5, -5.5);
  mctx.lineTo(-2.5, 0);
  mctx.lineTo(-5, 5.5);
  mctx.closePath();
  mctx.fill();
  mctx.stroke();
  mctx.restore();

  // subtle inner ring
  mctx.strokeStyle = "rgba(255,255,255,0.08)";
  mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.arc(R, R, R - 15, 0, TAU);
  mctx.stroke();
  mctx.restore();
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
function updateHud(force = false) {
  if (state.mode === "title") return;
  const p = state.player;
  const car = p.car;
  const target = playerPoint();
  const d = Math.hypot(target.x - GOAL.x, target.y - GOAL.y);
  const distText = d < 500 ? `${Math.round(d * 0.5)} M TO HOUSE` : `${(d / 2000).toFixed(1)} KM TO HOUSE`;
  const speed = car ? Math.hypot(car.vx, car.vy) * 0.32 : 0;

  state.nearestRide = car ? null : findNearestRide();

  let objective;
  let sub;
  if (car) {
    if (d < 520) {
      objective = "PULL INTO THE HOUSE";
      sub = "Tom Taylor is waiting. Do not miss the driveway.";
    } else {
      objective = "GET TO THE DESERT HOUSE";
      sub = "Follow the gold marker east, out of the city";
    }
  } else if (state.wanted > 0) {
    objective = "FIND ANOTHER RIDE";
    sub = "Cops are closing in on foot";
  } else {
    objective = "STEAL A CAR. ANY CAR.";
    sub = "Walk up to a parked ride and take it";
  }

  let stars = "";
  for (let i = 0; i < 5; i++) stars += `<i class="${i < state.wanted ? "on" : ""}"></i>`;
  const speedText = Math.round(speed).toString();

  if (force || state.lastHud.objective !== objective) { els.objective.textContent = objective; state.lastHud.objective = objective; }
  if (force || state.lastHud.sub !== sub) { els.sub.textContent = sub; state.lastHud.sub = sub; }
  if (force || state.lastHud.stars !== stars) { els.stars.innerHTML = stars; state.lastHud.stars = stars; }
  if (force || state.lastHud.dist !== distText) { els.distance.textContent = distText; state.lastHud.dist = distText; }
  if (force || state.lastHud.speed !== speedText) { els.speed.textContent = speedText; state.lastHud.speed = speedText; }

  const carHp = car ? clamp(car.health / car.maxHealth, 0, 1) * 100 : 0;
  const playerHp = clamp(p.health / p.maxHealth, 0, 1) * 100;
  if (force || state.lastHud.carHp !== carHp) {
    els.carHealth.style.width = `${carHp}%`;
    els.carHealth.style.background = carHp < 35 ? "linear-gradient(90deg,#ff2f22,#ff7a45)" : "linear-gradient(90deg,#ff8a2a,#ffb347)";
    state.lastHud.carHp = carHp;
  }
  if (force || state.lastHud.playerHp !== playerHp) {
    els.playerHealth.style.width = `${playerHp}%`;
    els.playerHealth.style.background = playerHp < 40 ? "linear-gradient(90deg,#ff2f22,#ff7a45)" : "linear-gradient(90deg,#7ed391,#b9e8a7)";
    state.lastHud.playerHp = playerHp;
  }

  els.vehiclePanel.classList.toggle("on-foot", !car);
  document.body.classList.toggle("on-foot", !car);

  // Prompt
  let promptVisible = false;
  let promptText = "";
  if (state.mode === "playing") {
    if (car) {
      if (speed < 170) {
        promptVisible = true;
        promptText = "Exit vehicle";
        els.promptKey.textContent = "E";
      }
    } else if (state.nearestRide) {
      promptVisible = true;
      promptText = state.nearestRide.type === "sports" ? "Steal the sports car" : "Steal this car";
      els.promptKey.textContent = "E";
    }
  }
  if (els.prompt.hidden === promptVisible) els.prompt.hidden = !promptVisible;
  if (promptVisible && state.lastHud.prompt !== promptText) {
    els.promptText.textContent = promptText;
    state.lastHud.prompt = promptText;
  }

  // action button label
  const actionLabel = car ? "EXIT" : (state.nearestRide ? "STEAL" : "GRAB");
  if (els.btnAction.textContent !== actionLabel) els.btnAction.textContent = actionLabel;

  // bust meter
  const showBust = state.bust > 0.02 && state.mode === "playing";
  if (els.bust.hidden === showBust) els.bust.hidden = !showBust;
  if (showBust) els.bustFill.style.width = `${clamp(state.bust / 1.45, 0, 1) * 100}%`;

  // vignettes
  const heatNear = state.cops.reduce((m, c) => {
    if (c.wreck) return m;
    return Math.max(m, 1 - clamp(Math.hypot(c.x - target.x, c.y - target.y) / 900, 0, 1));
  }, 0);
  const heatOp = state.wanted > 0 ? 0.12 + heatNear * 0.22 : 0.04;
  const dmgOp = p.health < 55 ? (1 - p.health / 55) * 0.55 : 0;
  if (state.lastHud.heatOp !== heatOp) { els.heatVig.style.opacity = heatOp.toFixed(2); state.lastHud.heatOp = heatOp; }
  if (state.lastHud.dmgOp !== dmgOp) { els.dmgVig.style.opacity = dmgOp.toFixed(2); state.lastHud.dmgOp = dmgOp; }
}

function showToast(title, sub, tone = "hot", duration = 2200) {
  els.toastTitle.textContent = title;
  els.toastSub.textContent = sub || "";
  els.toastTitle.className = `toast-title ${tone}`;
  els.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), duration);
}

/* ------------------------------------------------------------------ */
/* Render loop                                                         */
/* ------------------------------------------------------------------ */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  state.view = { w, h, dpr };
  state.camera.zoom = getBaseZoom();
}

function render() {
  const { w, h, dpr } = state.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#161210";
  ctx.fillRect(0, 0, w, h);

  const shake = state.shake;
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;

  ctx.save();
  ctx.translate(w / 2 + sx, h / 2 + sy);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  const halfW = w / (2 * state.camera.zoom);
  const halfH = h / (2 * state.camera.zoom);
  const view = {
    x0: state.camera.x - halfW - 40,
    y0: state.camera.y - halfH - 40,
    x1: state.camera.x + halfW + 40,
    y1: state.camera.y + halfH + 40,
  };

  drawWorld(ctx, state.world, view, state.time);
  drawSkids();
  drawGoalMarker(ctx, state.time);

  const vlist = state.vehicles
    .filter((v) => v.x + v.len > view.x0 && v.x - v.len < view.x1 && v.y + v.len > view.y0 && v.y - v.len < view.y1)
    .sort((a, b) => a.y - b.y);
  for (const v of vlist) drawVehicle(v);
  drawPlayerOnFoot();
  drawParticles();

  ctx.restore();

  drawMarkers();
  drawMinimap();

  // low-speed letterbox? no.
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.045, Math.max(0.0001, (now - last) / 1000));
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
function toggleSound() {
  audio.init();
  audio.setMuted(!audio.muted);
  els.sound.classList.toggle("muted", audio.muted);
  els.sound.setAttribute("aria-label", audio.muted ? "Unmute sound" : "Mute sound");
}

els.sound.addEventListener("click", (e) => { e.stopPropagation(); toggleSound(); });
els.startBtn.addEventListener("click", () => startGame());
els.restartBtn.addEventListener("click", () => startGame());
canvas.addEventListener("pointerdown", () => audio.init());
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 220));
document.addEventListener("visibilitychange", () => { last = performance.now(); });
window.addEventListener("contextmenu", (e) => e.preventDefault());

setupTouch();
resize();
resetScene();
state.mode = "title";

// Debug / QA handle (also handy for tinkering in the console)
window.__ttcc = {
  state, startGame, triggerEnd, showEnd, spawnCop, doAction,
  teleport(x, y) {
    const p = playerPoint();
    p.x = x; p.y = y;
    if (state.player.car) {
      state.player.car.x = x; state.player.car.y = y;
      state.player.car.vx = 0; state.player.car.vy = 0;
    }
    state.camera.x = x; state.camera.y = y;
  },
  giveCar() {
    if (state.player.car) return;
    const v = state.vehicles.find((c) => !c.wreck && !c.isCop);
    if (!v) return;
    state.player.x = v.x; state.player.y = v.y;
    state.player.car = v; v.driver = "player"; v.isPlayerCar = true;
    state.heat = Math.max(state.heat, 2);
  },
};

requestAnimationFrame(frame);
