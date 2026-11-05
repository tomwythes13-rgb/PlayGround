/* Tom Taylor Car Chase — procedural open world (city + highway + desert) */

export const WORLD = { w: 12600, h: 5200 };
export const CITY = { x0: 420, y0: 720, x1: 3140, y1: 4040 };
export const ROAD_W = 110;
export const STEP_X = (CITY.x1 - CITY.x0) / 5;
export const STEP_Y = (CITY.y1 - CITY.y0) / 6;
export const HIGHWAY_Y = CITY.y0 + 3 * STEP_Y;
export const HIGHWAY_W = 230;
export const HOUSE = {
  x: 11440, y: 1800, w: 620, h: 320,
  yard: { x: 11080, y: 1710, x2: 12480, y2: 2265 },
  pool: { x: 12160, y: 1860, w: 240, h: 165 },
};
export const GOAL = { x: 11760, y: 2190, r: 125 };

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Deterministic random                                                */
/* ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const range = (rng, a, b) => a + rng() * (b - a);

const BUILDING_COLORS = [
  ["#5c6269", "#6d747c", "#484d53"],
  ["#6d5d4f", "#81705f", "#51453a"],
  ["#765d4c", "#8b7160", "#5a4539"],
  ["#4d5b62", "#5e6e76", "#3c474d"],
  ["#6b6253", "#7e7462", "#4f483c"],
  ["#58645c", "#6a786e", "#424b45"],
  ["#7b6f60", "#8d806e", "#5a5145"],
  ["#5a5f6c", "#6b7280", "#444954"],
  ["#80604a", "#96735a", "#5f4536"],
];

const CAR_COLORS = [
  "#bd3b2c", "#2f6d93", "#d6a13f", "#3d7254", "#8d9096",
  "#1f2a36", "#b2542a", "#e0d9cc", "#633f74", "#2f4a5c",
  "#9c2f2f", "#c9b58f", "#416a7d", "#4f5d3a",
];

/* ------------------------------------------------------------------ */
/* World generation                                                    */
/* ------------------------------------------------------------------ */
export function generateWorld(seed = 1337) {
  const rng = mulberry32(seed);
  const roads = [];
  const blocks = [];
  const buildings = [];
  const parks = [];
  const lots = [];
  const props = [];
  const parkingSpots = [];
  const intersections = [];
  const solids = [];

  // City streets
  const streetVert = [];
  const streetHoriz = [];
  for (let i = 0; i <= 5; i++) {
    const cx = CITY.x0 + i * STEP_X;
    const r = {
      x: cx - ROAD_W / 2, y: CITY.y0 - 72, w: ROAD_W, h: CITY.y1 - CITY.y0 + 144,
      dir: "v", kind: "street", cx, cy: (CITY.y0 + CITY.y1) / 2,
    };
    roads.push(r); streetVert.push(r);
  }
  for (let j = 0; j <= 6; j++) {
    const cy = CITY.y0 + j * STEP_Y;
    const r = {
      x: CITY.x0 - 72, y: cy - ROAD_W / 2, w: CITY.x1 - CITY.x0 + 144, h: ROAD_W,
      dir: "h", kind: "street", cx: (CITY.x0 + CITY.x1) / 2, cy,
    };
    roads.push(r); streetHoriz.push(r);
  }

  // Highway out to the desert
  const highway = {
    x: CITY.x1 - 110, y: HIGHWAY_Y - HIGHWAY_W / 2,
    w: 12420 - (CITY.x1 - 110), h: HIGHWAY_W, dir: "h", kind: "highway",
    cx: (CITY.x1 + 12420) / 2, cy: HIGHWAY_Y,
  };
  roads.push(highway);

  // Driveway up to the house
  const driveway = {
    x: 11600, y: 2110, w: 320, h: HIGHWAY_Y - 2110 + 75,
    dir: "v", kind: "driveway", cx: 11760, cy: 2200,
  };
  roads.push(driveway);

  // Intersections (for crosswalks)
  for (const v of streetVert) {
    for (const h of streetHoriz) {
      intersections.push({
        x: v.x + v.w / 2, y: h.y + h.h / 2,
        r: ROAD_W / 2, hw: h.w, vh: v.h,
      });
    }
  }

  // Blocks / buildings / parks / lots
  for (let j = 0; j < 6; j++) {
    for (let i = 0; i < 5; i++) {
      const bx = CITY.x0 + i * STEP_X + ROAD_W / 2;
      const by = CITY.y0 + j * STEP_Y + ROAD_W / 2;
      const bw = STEP_X - ROAD_W;
      const bh = STEP_Y - ROAD_W;
      blocks.push({ x: bx, y: by, w: bw, h: bh });
      const roll = rng();
      const nearSpawn = i === 2 && j === 3;
      const nearSpawn2 = (i === 1 || i === 2) && j === 2;

      if (!nearSpawn && !nearSpawn2 && roll < 0.1) {
        // Park
        const p = { x: bx + 14, y: by + 14, w: bw - 28, h: bh - 28, seed: rng() * 999 };
        parks.push(p);
        const count = 4 + Math.floor(rng() * 4);
        for (let n = 0; n < count; n++) {
          props.push({
            type: "tree",
            x: p.x + 34 + rng() * (p.w - 68),
            y: p.y + 34 + rng() * (p.h - 68),
            s: range(rng, 0.8, 1.3),
            seed: rng() * 999,
          });
        }
        // Path through the park
        p.path = rng() > 0.5 ? "v" : "h";
      } else if (!nearSpawn && !nearSpawn2 && roll < 0.19) {
        // Parking lot
        const lot = { x: bx + 16, y: by + 16, w: bw - 32, h: bh - 32, seed: rng() * 999 };
        lots.push(lot);
        const rows = 3;
        for (let row = 0; row < rows; row++) {
          const y = lot.y + 46 + row * ((lot.h - 92) / (rows - 1));
          for (let c = 0; c < 3; c++) {
            if (rng() < 0.7) {
              parkingSpots.push({
                x: lot.x + 55 + c * ((lot.w - 110) / 2),
                y,
                angle: rng() > 0.5 ? 0 : Math.PI,
                lot: true,
              });
            }
          }
        }
      } else {
        // Buildings: 1, 2 or 4 per block
        const inner = 20;
        const bx0 = bx + inner, by0 = by + inner;
        const bw0 = bw - inner * 2, bh0 = bh - inner * 2;
        const layout = rng();
        const gap = 16;
        const parts = [];
        if (layout < 0.32) {
          parts.push({ x: bx0, y: by0, w: bw0, h: bh0 });
        } else if (layout < 0.7) {
          if (rng() > 0.5) {
            const split = bw0 * range(rng, 0.4, 0.6);
            parts.push({ x: bx0, y: by0, w: split - gap / 2, h: bh0 });
            parts.push({ x: bx0 + split + gap / 2, y: by0, w: bw0 - split - gap / 2, h: bh0 });
          } else {
            const split = bh0 * range(rng, 0.42, 0.58);
            parts.push({ x: bx0, y: by0, w: bw0, h: split - gap / 2 });
            parts.push({ x: bx0, y: by0 + split + gap / 2, w: bw0, h: bh0 - split - gap / 2 });
          }
        } else {
          const sx = bw0 * range(rng, 0.4, 0.6);
          const sy = bh0 * range(rng, 0.4, 0.6);
          parts.push({ x: bx0, y: by0, w: sx - gap / 2, h: sy - gap / 2 });
          parts.push({ x: bx0 + sx + gap / 2, y: by0, w: bw0 - sx - gap / 2, h: sy - gap / 2 });
          parts.push({ x: bx0, y: by0 + sy + gap / 2, w: sx - gap / 2, h: bh0 - sy - gap / 2 });
          parts.push({ x: bx0 + sx + gap / 2, y: by0 + sy + gap / 2, w: bw0 - sx - gap / 2, h: bh0 - sy - gap / 2 });
        }
        for (const p of parts) {
          const inset = range(rng, 0, 7);
          const b = {
            x: p.x + inset, y: p.y + inset,
            w: Math.max(30, p.w - inset * 2), h: Math.max(30, p.h - inset * 2),
            colors: pick(rng, BUILDING_COLORS),
            seed: rng() * 9999,
            spire: rng() < 0.11,
            ac: rng() < 0.7,
          };
          buildings.push(b);
          solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: "building" });
        }
      }
    }
  }

  // City street trees / lamps around blocks
  for (const b of blocks) {
    if (rng() < 0.4) {
      const side = Math.floor(rng() * 4);
      let x, y;
      if (side === 0) { x = b.x + range(rng, 20, b.w - 20); y = b.y + 9; }
      else if (side === 1) { x = b.x + b.w - 9; y = b.y + range(rng, 20, b.h - 20); }
      else if (side === 2) { x = b.x + range(rng, 20, b.w - 20); y = b.y + b.h - 9; }
      else { x = b.x + 9; y = b.y + range(rng, 20, b.h - 20); }
      props.push({ type: "tree", x, y, s: range(rng, 0.55, 0.8), seed: rng() * 999 });
    }
  }

  // Parked cars on the streets (avoid intersections)
  for (const r of streetVert) {
    for (let j = 0; j < 6; j++) {
      if (rng() > 0.5) continue;
      const y = CITY.y0 + j * STEP_Y + ROAD_W / 2 + range(rng, 90, STEP_Y - ROAD_W - 90);
      const x = r.cx + (rng() > 0.5 ? -35 : 35);
      parkingSpots.push({ x, y, angle: rng() > 0.5 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  for (const r of streetHoriz) {
    if (r.kind !== "street") continue;
    for (let i = 0; i < 5; i++) {
      if (rng() > 0.42) continue;
      const x = CITY.x0 + i * STEP_X + ROAD_W / 2 + range(rng, 90, STEP_X - ROAD_W - 90);
      const y = r.cy + (rng() > 0.5 ? -35 : 35);
      parkingSpots.push({ x, y, angle: rng() > 0.5 ? 0 : Math.PI });
    }
  }
  // Two stranded cars on the highway shoulder
  parkingSpots.push({ x: 5480, y: HIGHWAY_Y - 86, angle: 0 });
  parkingSpots.push({ x: 8850, y: HIGHWAY_Y + 88, angle: Math.PI });

  // Desert telephone poles
  const poles = [];
  for (let x = 3460; x < 11100; x += 405) {
    const p = { type: "pole", x, y: HIGHWAY_Y - 174, s: 1, seed: 0 };
    props.push(p);
    poles.push(p);
  }
  for (let i = 0; i < poles.length - 1; i++) {
    poles[i].wireTo = poles[i + 1];
  }

  // Desert billboards
  const billboards = [
    { x: 4120, y: HIGHWAY_Y - 200, title: "TOM TAYLOR'S PLACE", sub: "ICE COLD BEER  ·  5 MI →" },
    { x: 7050, y: HIGHWAY_Y + 210, title: "LAST GAS FOR 80 MILES", sub: "YOU SHOULD HAVE STOLEN A BIGGER CAR" },
    { x: 10150, y: HIGHWAY_Y - 210, title: "NO COPS PAST THIS POINT", sub: "(THEY DIDN'T MEAN IT)" },
    { x: 3120, y: HIGHWAY_Y + 230, title: "YOU ARE LEAVING THE CITY", sub: "DESERT COUNTY LINE" },
  ];
  for (const b of billboards) {
    props.push({ type: "billboard", x: b.x, y: b.y, s: 1, seed: 0, title: b.title, sub: b.sub });
  }

  // Desert scatter
  const yard = HOUSE.yard;
  for (let n = 0; n < 290; n++) {
    const x = range(rng, 3320, WORLD.w - 70);
    const y = range(rng, 90, WORLD.h - 90);
    if (Math.abs(y - HIGHWAY_Y) < HIGHWAY_W / 2 + 46) continue;
    if (x > yard.x - 120 && x < yard.x2 + 130 && y > yard.y - 120 && y < yard.y2 + 160) continue;
    const roll = rng();
    let type;
    if (roll < 0.34) type = "cactus";
    else if (roll < 0.55) type = "rock";
    else if (roll < 0.75) type = "bush";
    else if (roll < 0.92) type = "dry";
    else type = "tumbleweed";
    props.push({ type, x, y, s: range(rng, 0.7, 1.55), seed: rng() * 999 });
  }

  // Palms around the house
  const palmSpots = [
    [11190, 1810, 1.15], [11230, 2160, 1.0], [12370, 2190, 1.18],
    [12410, 1820, 1.05], [11310, 2230, 0.85], [12240, 2240, 0.9],
  ];
  for (const [x, y, s] of palmSpots) props.push({ type: "palm", x, y, s, seed: rng() * 999 });

  // Desert dunes
  const dunes = [];
  for (let n = 0; n < 46; n++) {
    dunes.push({
      x: range(rng, 3350, WORLD.w), y: range(rng, 120, WORLD.h - 120),
      rx: range(rng, 160, 480), ry: range(rng, 45, 130), rot: range(rng, -0.4, 0.4),
    });
  }

  // House solids
  solids.push({ x: HOUSE.x, y: HOUSE.y, w: HOUSE.w, h: HOUSE.h, kind: "house" });
  solids.push({ x: HOUSE.pool.x, y: HOUSE.pool.y, w: HOUSE.pool.w, h: HOUSE.pool.h, kind: "pool" });

  // A few city-specific flavour props
  const citySigns = [
    { x: 1720, y: 2130, title: "MOTEL", sub: "VACANCY" },
    { x: 2620, y: 2620, title: "DINER", sub: "OPEN 24 HRS" },
  ];
  for (const s of citySigns) props.push({ type: "citysign", x: s.x, y: s.y, s: 1, seed: 0, title: s.title, sub: s.sub });

  return {
    w: WORLD.w, h: WORLD.h,
    roads, streetVert, streetHoriz, highway, driveway,
    blocks, buildings, parks, lots, intersections, solids, props, dunes,
    parkingSpots, carColors: CAR_COLORS,
    goal: GOAL, house: HOUSE,
    spawn: { x: 1508, y: 2314 },
    spawnCars: [
      { x: 1464, y: 2268, angle: -Math.PI / 2, type: "sports", color: "#bd3b2c" },
      { x: 1554, y: 2508, angle: Math.PI / 2, type: "sedan", color: "#2f6d93" },
      { x: 1650, y: 2360, angle: 0, type: "pickup", color: "#d6a13f" },
      { x: 1356, y: 2402, angle: Math.PI, type: "van", color: "#e0d9cc" },
    ],
    seed,
    rngSeed: seed,
  };
}

/* ------------------------------------------------------------------ */
/* World queries                                                       */
/* ------------------------------------------------------------------ */
export function onPaved(world, x, y) {
  for (const r of world.roads) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  for (const l of world.lots) {
    if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return true;
  }
  return false;
}

export function circleHitsSolid(world, x, y, r) {
  for (const s of world.solids) {
    const nx = Math.max(s.x, Math.min(x, s.x + s.w));
    const ny = Math.max(s.y, Math.min(y, s.y + s.h));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < r * r) return s;
  }
  return null;
}

export function pointInSolid(world, x, y) {
  for (const s of world.solids) {
    if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return s;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Drawing helpers                                                     */
/* ------------------------------------------------------------------ */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function noisePattern(color, colors, density = 0.5, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * density * 0.12; i++) {
    g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const s = Math.random() * 2 + 0.5;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  return c;
}

let patterns = null;
function ensurePatterns() {
  if (patterns) return patterns;
  patterns = {
    sand: noisePattern("#c8a26c", ["rgba(160,120,70,.16)", "rgba(235,205,150,.16)", "rgba(110,80,45,.12)"], 1.4),
    concrete: noisePattern("#545960", ["rgba(255,255,255,.045)", "rgba(0,0,0,.08)", "rgba(255,255,255,.02)"], 1.5),
    sidewalk: noisePattern("#5f656b", ["rgba(255,255,255,.05)", "rgba(0,0,0,.09)"], 1.4),
    asphalt: noisePattern("#2c2f33", ["rgba(255,255,255,.035)", "rgba(0,0,0,.14)", "rgba(255,255,255,.015)"], 1.8),
    asphalt2: noisePattern("#303338", ["rgba(255,255,255,.035)", "rgba(0,0,0,.12)"], 1.4),
    grass: noisePattern("#4f6644", ["rgba(180,200,130,.13)", "rgba(0,0,0,.1)", "rgba(230,240,180,.06)"], 1.4),
  };
  return patterns;
}

const hash = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function inView(view, x, y, pad = 90) {
  return x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
}
function rectInView(view, x, y, w, h, pad = 70) {
  return x + w > view.x0 - pad && x < view.x1 + pad && y + h > view.y0 - pad && y < view.y1 + pad;
}

/* ------------------------------------------------------------------ */
/* World render                                                        */
/* ------------------------------------------------------------------ */
export function drawWorld(ctx, world, view, time) {
  const p = ensurePatterns();
  const sandFill = ctx.createPattern(p.sand, "repeat");
  const concreteFill = ctx.createPattern(p.concrete, "repeat");
  const sidewalkFill = ctx.createPattern(p.sidewalk, "repeat");
  const asphaltFill = ctx.createPattern(p.asphalt, "repeat");
  const asphalt2Fill = ctx.createPattern(p.asphalt2, "repeat");
  const grassFill = ctx.createPattern(p.grass, "repeat");

  // --- Desert base ---
  ctx.fillStyle = sandFill;
  ctx.fillRect(0, 0, world.w, world.h);

  // Warm dusk wash out in the desert
  const wash = ctx.createLinearGradient(3200, 0, 12400, 0);
  wash.addColorStop(0, "rgba(210,170,110,0)");
  wash.addColorStop(0.55, "rgba(225,150,80,0.10)");
  wash.addColorStop(1, "rgba(205,105,55,0.22)");
  ctx.fillStyle = wash;
  ctx.fillRect(3200, 0, world.w - 3200, world.h);

  // Dunes
  for (const d of world.dunes) {
    if (!inView(view, d.x, d.y, d.rx)) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = "rgba(230,196,138,0.20)";
    ctx.beginPath(); ctx.ellipse(0, 0, d.rx, d.ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(140,100,55,0.13)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(4, 5, d.rx, d.ry, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.restore();
  }

  // --- City slab & blocks ---
  if (rectInView(view, CITY.x0 - 80, CITY.y0 - 80, CITY.x1 - CITY.x0 + 160, CITY.y1 - CITY.y0 + 160, 0)) {
    ctx.fillStyle = concreteFill;
    ctx.fillRect(CITY.x0 - 80, CITY.y0 - 80, CITY.x1 - CITY.x0 + 160, CITY.y1 - CITY.y0 + 160);

    // shade the city edge into the desert
    ctx.strokeStyle = "rgba(54,42,28,0.35)";
    ctx.lineWidth = 18;
    ctx.strokeRect(CITY.x0 - 80, CITY.y0 - 80, CITY.x1 - CITY.x0 + 160, CITY.y1 - CITY.y0 + 160);

    for (const b of world.blocks) {
      if (!rectInView(view, b.x, b.y, b.w, b.h)) continue;
      ctx.fillStyle = sidewalkFill;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // sidewalk expansion joints
      ctx.strokeStyle = "rgba(30,34,38,0.18)";
      ctx.lineWidth = 1.5;
      for (let x = b.x + 60; x < b.x + b.w; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); ctx.stroke();
      }
      for (let y = b.y + 60; y < b.y + b.h; y += 60) {
        ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.stroke();
      }
    }
  }

  // Parks & parking lots
  for (const pk of world.parks) {
    if (!rectInView(view, pk.x, pk.y, pk.w, pk.h)) continue;
    ctx.fillStyle = grassFill;
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.strokeStyle = "rgba(40,50,30,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = "rgba(190,180,155,0.35)";
    if (pk.path === "v") ctx.fillRect(pk.x + pk.w / 2 - 18, pk.y, 36, pk.h);
    else ctx.fillRect(pk.x, pk.y + pk.h / 2 - 18, pk.w, 36);
  }
  for (const lot of world.lots) {
    if (!rectInView(view, lot.x, lot.y, lot.w, lot.h)) continue;
    ctx.fillStyle = asphalt2Fill;
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = "rgba(240,235,215,0.24)";
    ctx.lineWidth = 2;
    const rows = 3;
    for (let row = 0; row < rows; row++) {
      const y = lot.y + 46 + row * ((lot.h - 92) / (rows - 1));
      for (let c = 0; c < 4; c++) {
        const x = lot.x + 20 + c * ((lot.w - 40) / 3);
        ctx.beginPath();
        ctx.moveTo(x, y - 27); ctx.lineTo(x, y + 27);
        ctx.stroke();
      }
    }
  }

  // --- Roads ---
  for (const r of world.roads) {
    if (!rectInView(view, r.x, r.y, r.w, r.h)) continue;
    if (r.kind === "highway") {
      // shoulder
      ctx.fillStyle = "rgba(120,94,58,0.5)";
      ctx.fillRect(r.x - 22, r.y - 20, r.w + 44, r.h + 40);
      ctx.fillStyle = asphaltFill;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawHighwayMarkings(ctx, r);
      // curb lines
      ctx.strokeStyle = "rgba(226,220,200,0.5)";
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
    } else {
      ctx.fillStyle = asphaltFill;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawStreetMarkings(ctx, r);
      ctx.strokeStyle = "rgba(28,30,33,0.65)";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }

  // Crosswalks
  for (const it of world.intersections) {
    if (!inView(view, it.x, it.y, 130)) continue;
    drawCrosswalk(ctx, it, "h");
    drawCrosswalk(ctx, it, "v");
  }

  // --- Buildings ---
  for (const b of world.buildings) {
    if (!rectInView(view, b.x, b.y, b.w, b.h, 60)) continue;
    drawBuilding(ctx, b);
  }

  // --- Props ---
  drawProps(ctx, world, view, time);

  // --- House ---
  drawHouse(ctx, world, view, time);

  // --- Desert trail of dust / road wear ---
  ctx.fillStyle = "rgba(70,50,30,0.06)";
  for (let x = 3400; x < 11100; x += 210) {
    if (!inView(view, x, HIGHWAY_Y, 120)) continue;
    ctx.fillRect(x, HIGHWAY_Y + 60 - Math.sin(x) * 18, 120, 9);
  }
}

function drawStreetMarkings(ctx, r) {
  ctx.save();
  ctx.strokeStyle = "rgba(214,177,83,0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  if (r.dir === "v") {
    ctx.moveTo(r.x + r.w / 2, r.y + 30);
    ctx.lineTo(r.x + r.w / 2, r.y + r.h - 30);
  } else {
    ctx.moveTo(r.x + 30, r.y + r.h / 2);
    ctx.lineTo(r.x + r.w - 30, r.y + r.h / 2);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // gutter lines
  ctx.strokeStyle = "rgba(20,22,25,0.35)";
  ctx.lineWidth = 2;
  if (r.dir === "v") {
    ctx.beginPath(); ctx.moveTo(r.x + 12, r.y); ctx.lineTo(r.x + 12, r.y + r.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r.x + r.w - 12, r.y); ctx.lineTo(r.x + r.w - 12, r.y + r.h); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(r.x, r.y + 12); ctx.lineTo(r.x + r.w, r.y + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h - 12); ctx.lineTo(r.x + r.w, r.y + r.h - 12); ctx.stroke();
  }
  ctx.restore();
}

function drawHighwayMarkings(ctx, r) {
  const cy = r.y + r.h / 2;
  ctx.save();
  // double center line
  ctx.strokeStyle = "rgba(226,187,85,0.75)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(r.x + 20, cy - 6); ctx.lineTo(r.x + r.w - 20, cy - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r.x + 20, cy + 6); ctx.lineTo(r.x + r.w - 20, cy + 6); ctx.stroke();
  // lane dashes
  ctx.strokeStyle = "rgba(240,238,226,0.5)";
  ctx.setLineDash([42, 42]);
  for (const off of [-58, 58]) {
    ctx.beginPath(); ctx.moveTo(r.x, cy + off); ctx.lineTo(r.x + r.w, cy + off); ctx.stroke();
  }
  ctx.setLineDash([]);
  // edge lines
  ctx.strokeStyle = "rgba(242,240,228,0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(r.x + 8, cy - r.h / 2 + 14); ctx.lineTo(r.x + r.w - 8, cy - r.h / 2 + 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r.x + 8, cy + r.h / 2 - 14); ctx.lineTo(r.x + r.w - 8, cy + r.h / 2 - 14); ctx.stroke();
  // worn tyre tracks
  ctx.strokeStyle = "rgba(0,0,0,0.09)";
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(r.x, cy - 24); ctx.lineTo(r.x + r.w, cy - 24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r.x, cy + 24); ctx.lineTo(r.x + r.w, cy + 24); ctx.stroke();
  ctx.restore();
}

function drawCrosswalk(ctx, it, dir) {
  ctx.save();
  ctx.fillStyle = "rgba(238,234,218,0.26)";
  if (dir === "h") {
    for (const [cy, yy] of [[it.y - it.r - 22, it.y - it.r - 22], [it.y + it.r - 4, it.y + it.r - 4]]) {
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(it.x - it.r + 9 + i * ((it.r * 2 - 18) / 6), yy, 9, 26);
      }
    }
  } else {
    for (const [cx, xx] of [[it.x - it.r - 22, it.x - it.r - 22], [it.x + it.r - 4, it.x + it.r - 4]]) {
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(xx, it.y - it.r + 9 + i * ((it.r * 2 - 18) / 6), 26, 9);
      }
    }
  }
  ctx.restore();
}

function drawBuilding(ctx, b) {
  const [roof, wall] = b.colors;
  ctx.save();
  // long sun shadow toward south-east
  ctx.fillStyle = "rgba(20,16,12,0.26)";
  ctx.fillRect(b.x + 20, b.y + 26, b.w, b.h);
  // extruded wall
  ctx.fillStyle = wall;
  ctx.fillRect(b.x + 9, b.y + 9, b.w, b.h);
  // roof
  const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  grad.addColorStop(0, roof);
  grad.addColorStop(1, wall);
  ctx.fillStyle = grad;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  // parapet
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  // rooftop details
  const n = 1 + Math.floor(hash(b.seed) * 3);
  for (let i = 0; i < n; i++) {
    const rx = b.x + 12 + hash(b.seed + i * 3.7) * (b.w - 44);
    const ry = b.y + 12 + hash(b.seed + i * 7.1) * (b.h - 44);
    const rw = 16 + hash(b.seed + i * 2.2) * 22;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(rx + 3, ry + 3, rw, rw * 0.7);
    ctx.fillStyle = "rgba(210,212,206,0.35)";
    ctx.fillRect(rx, ry, rw, rw * 0.7);
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, rw, rw * 0.7);
  }
  // skylight strip
  if (b.w > 120 && b.h > 100) {
    ctx.fillStyle = "rgba(140,186,196,0.24)";
    ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.16, b.w * 0.22, b.h * 0.13);
  }
  // windows on exposed wall (bottom edge)
  if (b.w > 54) {
    const cols = Math.max(2, Math.floor(b.w / 34));
    for (let i = 0; i < cols; i++) {
      if (hash(b.seed + i * 11) < 0.25) continue;
      ctx.fillStyle = i % 2 ? "rgba(255,213,140,0.32)" : "rgba(120,160,168,0.28)";
      ctx.fillRect(b.x + 10 + i * ((b.w - 20) / cols), b.y + b.h + 1, (b.w - 20) / cols - 6, 6);
    }
  }
  if (b.spire) {
    ctx.fillStyle = "rgba(40,44,48,0.55)";
    ctx.beginPath();
    ctx.arc(b.x + b.w * 0.5, b.y + b.h * 0.5, 12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(220,220,210,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w * 0.5 + 8, b.y + b.h * 0.5);
    ctx.lineTo(b.x + b.w * 0.5 + 46, b.y + b.h * 0.5 - 24);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
function drawProps(ctx, world, view, time) {
  for (const pr of world.props) {
    if (!inView(view, pr.x, pr.y, 140)) continue;
    switch (pr.type) {
      case "tree": drawTree(ctx, pr); break;
      case "palm": drawPalm(ctx, pr); break;
      case "cactus": drawCactus(ctx, pr); break;
      case "rock": drawRock(ctx, pr); break;
      case "bush": drawBush(ctx, pr); break;
      case "dry": drawDryBrush(ctx, pr); break;
      case "tumbleweed": drawTumbleweed(ctx, pr, time); break;
      case "pole": drawPole(ctx, pr); break;
      case "billboard": drawBillboard(ctx, pr); break;
      case "citysign": drawCitySign(ctx, pr); break;
    }
  }
  // telephone wires
  for (const pr of world.props) {
    if (pr.type !== "pole" || !pr.wireTo) continue;
    if (!inView(view, pr.x, pr.y, 460)) continue;
    ctx.strokeStyle = "rgba(38,30,22,0.34)";
    ctx.lineWidth = 1.6;
    const a = pr, b = pr.wireTo;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 28, b.x, b.y);
    ctx.stroke();
  }
}

function drawTree(ctx, pr) {
  const s = pr.s;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(20,16,10,0.22)";
  ctx.beginPath(); ctx.ellipse(14, 16, 26, 13, 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = "#4b3a27";
  ctx.fillRect(-2, -2, 4, 8);
  const greens = ["#3f5d39", "#4b6c41", "#557a49"];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = greens[i];
    ctx.beginPath();
    ctx.arc(-7 + i * 7, -3 - i * 3, 16 - i * 2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(210,225,160,0.22)";
  ctx.beginPath(); ctx.arc(-8, -8, 9, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawPalm(ctx, pr) {
  const s = pr.s;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(20,16,10,0.24)";
  ctx.beginPath(); ctx.ellipse(16, 21, 30, 11, 0.44, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#6f5536";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.quadraticCurveTo(3, -12, 8, -24);
  ctx.stroke();
  ctx.strokeStyle = "#3f6238";
  ctx.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.25;
    const len = 34 + (i % 2) * 8;
    ctx.beginPath();
    ctx.moveTo(8, -24);
    ctx.quadraticCurveTo(8 + Math.cos(a) * len * 0.55, -24 + Math.sin(a) * len * 0.5, 8 + Math.cos(a) * len, -26 + Math.sin(a) * len * 0.8);
    ctx.stroke();
    ctx.strokeStyle = i % 2 ? "#48703e" : "#3f6238";
  }
  ctx.fillStyle = "#5c7b45";
  ctx.beginPath(); ctx.arc(8, -24, 6, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawCactus(ctx, pr) {
  const s = pr.s;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(20,16,10,0.22)";
  ctx.beginPath(); ctx.ellipse(12, 12, 19, 8, 0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#4a6b3e";
  roundRect(ctx, -6, -22, 12, 34, 6); ctx.fill();
  ctx.fillStyle = "#436138";
  roundRect(ctx, -18, -12, 8, 16, 4); ctx.fill();
  roundRect(ctx, 10, -18, 8, 18, 4); ctx.fill();
  ctx.strokeStyle = "rgba(180,205,150,0.3)";
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 10); ctx.stroke();
  ctx.restore();
}

function drawRock(ctx, pr) {
  const s = pr.s;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(20,16,10,0.22)";
  ctx.beginPath(); ctx.ellipse(12, 10, 20, 10, 0.35, 0, TAU); ctx.fill();
  ctx.fillStyle = "#8d7a63";
  ctx.beginPath();
  ctx.moveTo(-16, 5); ctx.lineTo(-12, -10); ctx.lineTo(2, -15); ctx.lineTo(15, -6); ctx.lineTo(12, 8); ctx.lineTo(-4, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(230,210,180,0.3)";
  ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(1, -11); ctx.lineTo(7, -4); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBush(ctx, pr) {
  const s = pr.s;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(20,16,10,0.16)";
  ctx.beginPath(); ctx.ellipse(8, 8, 15, 7, 0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#566b3a";
  ctx.beginPath(); ctx.arc(-5, 0, 9, 0, TAU); ctx.arc(5, -2, 8, 0, TAU); ctx.arc(1, 5, 7, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawDryBrush(ctx, pr) {
  const s = pr.s;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.scale(s, s);
  ctx.strokeStyle = "rgba(120,95,55,0.55)";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 8 - 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTumbleweed(ctx, pr, time) {
  const s = pr.s;
  const wobble = Math.sin(time * 1.3 + pr.seed) * 4;
  ctx.save();
  ctx.translate(pr.x + wobble, pr.y);
  ctx.scale(s, s);
  ctx.strokeStyle = "rgba(115,90,55,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(3, 1, 5, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawPole(ctx, pr) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.fillStyle = "rgba(20,16,10,0.22)";
  ctx.fillRect(6, 8, 18, 5);
  ctx.fillStyle = "#6d5236";
  ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
  ctx.fillRect(-14, -2, 28, 3);
  ctx.fillStyle = "rgba(30,24,16,0.5)";
  ctx.fillRect(-12, -5, 2, 5);
  ctx.fillRect(10, -5, 2, 5);
  ctx.restore();
}

function drawBillboard(ctx, pr) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.fillStyle = "rgba(20,16,10,0.28)";
  ctx.fillRect(-92, 12, 190, 20);
  // legs
  ctx.fillStyle = "#55442f";
  ctx.fillRect(-58, 6, 7, 28);
  ctx.fillRect(52, 6, 7, 28);
  // board
  ctx.fillStyle = "#1b1712";
  ctx.fillRect(-96, -58, 192, 68);
  ctx.strokeStyle = "#d9b26a";
  ctx.lineWidth = 3;
  ctx.strokeRect(-96, -58, 192, 68);
  ctx.fillStyle = "#d9b26a";
  ctx.font = '700 19px "Barlow Condensed", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(pr.title || "", 0, -32);
  ctx.fillStyle = "rgba(244,233,212,0.65)";
  ctx.font = '600 10px "Barlow Condensed", sans-serif';
  ctx.fillText(pr.sub || "", 0, -15);
  ctx.fillStyle = "rgba(255,138,42,0.8)";
  ctx.fillRect(-96, -62, 192, 4);
  ctx.restore();
}

function drawCitySign(ctx, pr) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.fillStyle = "rgba(20,16,10,0.25)";
  ctx.fillRect(20, 8, 12, 4);
  ctx.fillStyle = "#3a2c20";
  ctx.fillRect(-2, 4, 4, 18);
  ctx.fillStyle = "#17130f";
  ctx.fillRect(-52, -34, 104, 40);
  ctx.strokeStyle = "rgba(255,138,42,0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-52, -34, 104, 40);
  ctx.fillStyle = "#ff9a3d";
  ctx.font = '700 18px "Barlow Condensed", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(pr.title, 0, -14);
  ctx.fillStyle = "rgba(244,233,212,0.55)";
  ctx.font = '600 8px "Barlow Condensed", sans-serif';
  ctx.fillText(pr.sub, 0, -3);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* The house                                                           */
/* ------------------------------------------------------------------ */
function drawHouse(ctx, world, view, time) {
  const H = HOUSE;
  const yard = H.yard;
  if (!rectInView(view, yard.x, yard.y, yard.x2 - yard.x, yard.y2 - yard.y, 100)) return;

  // yard ground
  ctx.fillStyle = "rgba(212,176,116,0.55)";
  ctx.fillRect(yard.x, yard.y, yard.x2 - yard.x, yard.y2 - yard.y);
  // gravel border
  ctx.strokeStyle = "rgba(120,92,58,0.4)";
  ctx.lineWidth = 8;
  ctx.strokeRect(yard.x, yard.y, yard.x2 - yard.x, yard.y2 - yard.y);

  // driveway
  ctx.fillStyle = "rgba(58,55,50,0.95)";
  ctx.fillRect(11600, 2110, 320, 290);
  ctx.strokeStyle = "rgba(240,235,215,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(11606, 2110); ctx.lineTo(11606, 2380); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11914, 2110); ctx.lineTo(11914, 2380); ctx.stroke();

  // pool
  const pool = H.pool;
  ctx.fillStyle = "rgba(30,50,55,0.3)";
  ctx.fillRect(pool.x + 6, pool.y + 6, pool.w, pool.h);
  ctx.fillStyle = "#3f8fa3";
  roundRect(ctx, pool.x, pool.y, pool.w, pool.h, 16); ctx.fill();
  const water = ctx.createLinearGradient(pool.x, pool.y, pool.x, pool.y + pool.h);
  water.addColorStop(0, "rgba(170,235,240,0.5)");
  water.addColorStop(0.5, "rgba(70,160,180,0.15)");
  water.addColorStop(1, "rgba(20,80,100,0.35)");
  ctx.fillStyle = water;
  roundRect(ctx, pool.x + 4, pool.y + 4, pool.w - 8, pool.h - 8, 12); ctx.fill();
  ctx.strokeStyle = "rgba(220,240,240,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const yy = pool.y + 28 + i * 38 + Math.sin(time * 1.5 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(pool.x + 18, yy);
    ctx.quadraticCurveTo(pool.x + pool.w / 2, yy + 7, pool.x + pool.w - 18, yy);
    ctx.stroke();
  }

  // fence
  drawFence(ctx, yard);

  // house shadow + body
  const hx = H.x, hy = H.y, hw = H.w, hh = H.h;
  ctx.fillStyle = "rgba(24,18,12,0.32)";
  ctx.fillRect(hx + 24, hy + 30, hw, hh);
  ctx.fillStyle = "#8f6a4c";
  ctx.fillRect(hx + 10, hy + 10, hw, hh);
  const wall = ctx.createLinearGradient(hx, hy, hx + hw, hy + hh);
  wall.addColorStop(0, "#e6d2ac");
  wall.addColorStop(0.6, "#d6bd94");
  wall.addColorStop(1, "#b99c74");
  ctx.fillStyle = wall;
  ctx.fillRect(hx, hy, hw, hh);

  // roof (flat terracotta with cream parapet)
  ctx.fillStyle = "#a55434";
  ctx.fillRect(hx + 20, hy + 18, hw - 40, hh - 36);
  ctx.strokeStyle = "rgba(244,224,190,0.55)";
  ctx.lineWidth = 5;
  ctx.strokeRect(hx + 6, hy + 6, hw - 12, hh - 12);
  ctx.strokeStyle = "rgba(90,46,26,0.25)";
  ctx.lineWidth = 2;
  for (let x = hx + 40; x < hx + hw - 30; x += 34) {
    ctx.beginPath(); ctx.moveTo(x, hy + 20); ctx.lineTo(x, hy + hh - 20); ctx.stroke();
  }
  // skylights / solar
  ctx.fillStyle = "rgba(58,88,96,0.85)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(hx + 60 + i * 56, hy + 46, 36, 22);
    ctx.fillStyle = "rgba(160,205,212,0.35)";
    ctx.fillRect(hx + 63 + i * 56, hy + 49, 30, 6);
    ctx.fillStyle = "rgba(58,88,96,0.85)";
  }
  // ac units
  ctx.fillStyle = "rgba(55,55,52,0.6)";
  ctx.fillRect(hx + hw - 96, hy + hh - 74, 34, 26);
  ctx.strokeStyle = "rgba(220,220,210,0.25)";
  ctx.strokeRect(hx + hw - 96, hy + hh - 74, 34, 26);

  // garage + front door (south wall)
  ctx.fillStyle = "#3a332c";
  ctx.fillRect(hx + 74, hy + hh - 2, 116, 18);
  ctx.strokeStyle = "rgba(230,220,200,0.22)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx + 80, hy + hh + 3 + i * 4); ctx.lineTo(hx + 184, hy + hh + 3 + i * 4); ctx.stroke(); }
  ctx.fillStyle = "#5d3a28";
  ctx.fillRect(hx + 404, hy + hh - 2, 64, 16);
  ctx.fillStyle = "rgba(255,210,130,0.5)";
  ctx.fillRect(hx + 396, hy + hh + 1, 10, 5);
  ctx.fillRect(hx + 466, hy + hh + 1, 10, 5);

  // front path lights
  for (let i = 0; i < 3; i++) {
    const lx = 11640 + i * 120;
    ctx.fillStyle = "rgba(255,200,120,0.65)";
    ctx.beginPath(); ctx.arc(lx, 2142, 4, 0, TAU); ctx.fill();
  }

  // Welcome arch over the driveway
  drawArch(ctx);

  // goal glow is drawn separately by drawGoalMarker
}

function drawFence(ctx, yard) {
  const y = yard.y2;
  ctx.save();
  ctx.strokeStyle = "rgba(90,66,44,0.85)";
  ctx.lineWidth = 3;
  // posts
  for (let x = yard.x + 10; x <= yard.x2 - 10; x += 54) {
    if (x > 11560 && x < 11960) continue; // gate
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y + 2);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(yard.x, y - 8); ctx.lineTo(11560, y - 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11960, y - 8); ctx.lineTo(yard.x2, y - 8); ctx.stroke();
  // side fences
  ctx.beginPath(); ctx.moveTo(yard.x, yard.y); ctx.lineTo(yard.x, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(yard.x2, yard.y); ctx.lineTo(yard.x2, y); ctx.stroke();
  ctx.strokeStyle = "rgba(90,66,44,0.35)";
  ctx.setLineDash([8, 10]);
  ctx.beginPath(); ctx.moveTo(yard.x, yard.y); ctx.lineTo(yard.x, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(yard.x2, yard.y); ctx.lineTo(yard.x2, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawArch(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(24,18,12,0.35)";
  ctx.fillRect(11510, 2310, 520, 16);
  ctx.fillStyle = "#4c3a28";
  ctx.fillRect(11518, 2320, 14, 56);
  ctx.fillRect(12008, 2320, 14, 56);
  ctx.fillStyle = "#17130f";
  ctx.fillRect(11500, 2286, 540, 46);
  ctx.strokeStyle = "rgba(255,138,42,0.75)";
  ctx.lineWidth = 2;
  ctx.strokeRect(11500, 2286, 540, 46);
  ctx.fillStyle = "#ff9a3d";
  ctx.font = '400 30px "Bebas Neue", Impact, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("TOM TAYLOR", 11770, 2319);
  ctx.fillStyle = "rgba(244,233,212,0.5)";
  ctx.font = '600 9px "Barlow Condensed", sans-serif';
  ctx.fillText("PRIVATE PROPERTY  ·  NO COPS", 11770, 2327);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Goal marker                                                         */
/* ------------------------------------------------------------------ */
export function drawGoalMarker(ctx, time) {
  const pulse = (Math.sin(time * 2.3) + 1) / 2;
  const r = GOAL.r + pulse * 16;
  ctx.save();
  ctx.translate(GOAL.x, GOAL.y);

  const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 190);
  glow.addColorStop(0, "rgba(255,178,60,0.34)");
  glow.addColorStop(0.5, "rgba(255,140,35,0.13)");
  glow.addColorStop(1, "rgba(255,140,35,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 190, 0, TAU); ctx.fill();

  ctx.strokeStyle = `rgba(255,170,60,${0.5 + pulse * 0.3})`;
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 18]);
  ctx.lineDashOffset = -time * 40;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255,220,150,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r - 22, 0, TAU); ctx.stroke();

  // chevrons
  ctx.fillStyle = "rgba(255,205,120,0.8)";
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + time * 0.8;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(r + 32, 0);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(10, 0); ctx.lineTo(0, 7); ctx.lineTo(3, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
