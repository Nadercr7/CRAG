// Layout of the inspection line: one place for every position, shared by the static art (art.mjs)
// and the live runtime (live.js gets this object as JSON). World units are about 1 px, x runs
// along the belt (left to right on the page), y toward the viewer, z up.
import * as k from "../vendor/iso-kit.mjs";

export const W = 1000;
export const H = 500;
export const AZIMUTH = 62;
export const ELEVATION = 30;

export const BELT_Y = 117; // centre line of the belt
export const BELT_TOP = 8; // belt surface height
export const BELT = { x: 154, y: 100, w: 656, d: 34, r: 6 };
export const TABLE = { x: -26, y: -8, w: 868, d: 206, r: 9 };

export const CAB_W = 116;
export const CAB_Y = 14; // back of the wall cabinets
export const CAB_FRONT = 78; // their front face
export const CAB_TOP = 104;
export const WIN = { dx: 7, w: 76, z0: 36, z1: 94 }; // window in each cabinet face (x offset, width, bottom, top)
export const ARM_DX = 106; // the tool hangs this far right of the cabinet's left edge

// Wall cabinets, left to right: the five stations that stand behind the belt.
export const STATIONS = ["gauge", "gate", "press", "scale", "output"].map((id, i) => {
  const x0 = 134 + i * 130;
  return { id, x0, toolX: x0 + ARM_DX };
});

export const FEEDER = { x: 2, y: 82, w: 102, d: 70, r: 3 }; // intake block at the start of the belt
export const FEEDER_TOP = 80;
export const FEEDER_FRONT = FEEDER.y + FEEDER.d;
export const FUNNEL = { cx: 53, cy: BELT_Y, z0: 80, neck: 9, neckTo: 94, rim: 140, rTop: 38, top: 148 };

// Search drawer: slides out of the feeder's right face onto the belt start.
export const DRAWER = { y0: 92, y1: 142, floor: 9, open: 40, len: 66, wall: 11 };
export const STACK = { w: 30, d: 22, sheet: 1.3, count: 20 };

// Return rail for the ticket (a loop round the back of the line to the funnel).
export const RAIL = { z: 164, back: 31, left: -10, front: BELT_Y, fromX: 322 };

export const DROP = { x: 296, y: 150 }; // where slips that failed the gauge fall off the belt
export const SLIP = { w: 26, d: 18, t: 1.3 };
export const STRIP = { w: 22, d: 4, t: 1.6 };

export const BIN = { x: 512, y: 148, w: 62, d: 40, h: 20, r: 3 }; // dropped-sentence bin, in front of the press

export const PROJECTION = k.fitProjection(
  [
    ...k.boxCorners(TABLE, -26, 0),
    ...k.boxCorners({ x: 0, y: CAB_Y, w: 780, d: 64 }, 0, CAB_TOP + 34),
    [FUNNEL.cx, FUNNEL.cy, RAIL.z + 12],
    [RAIL.left, RAIL.back, RAIL.z + 8],
    [FUNNEL.cx - FUNNEL.rTop, FUNNEL.cy + FUNNEL.rTop, FUNNEL.top],
  ],
  W,
  H,
  { pad: 18, azimuth: AZIMUTH, elevation: ELEVATION },
);
export const P = PROJECTION;

export const layout = {
  W, H, BELT_Y, BELT_TOP, BELT, CAB_W, CAB_Y, CAB_FRONT, CAB_TOP, WIN, ARM_DX, STATIONS, FEEDER, FEEDER_TOP, FEEDER_FRONT,
  FUNNEL, DRAWER, STACK, RAIL, DROP, SLIP, STRIP, BIN, P,
};
