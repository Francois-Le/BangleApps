#!/usr/bin/env node
/* Generates dial.bin: the seconds dial (frame + 60 ticks) and the 60 pointer images, so the
   watch doesn't have to compute them at startup. Run: node tools/make-dial.js
   Format (all multi-byte values little endian):
     dial image: Espruino image string (75x75, 1 bpp)
     then 60 pointers: [x:int8, y:int8, y2:int8, len:uint8, image (len bytes, colour 0 transparent)]
   x, y, y2 are relative to the dial centre. */
const fs = require("fs");
const S = 75, C = 37;

// Same maths as the app used before: ticks for 0..7 s, the rest are exact mirror/rotations
function tickPixels(s, rIn, rOut, thick) {
  s = (s+60)%60;
  var q = Math.floor(s/15), r = s%15, base = r<=7 ? r : 15-r;
  var k = Math.tan(base*Math.PI/30), pts = [];
  for (var y=rIn; y<=rOut; y++) {
    var x = Math.round(y*k);
    for (var o=-thick; o<=thick; o++) {
      var px = x+o, py = -y;
      if (r>7) { var t = px; px = -py; py = -t; }
      for (var i=0; i<q; i++) { var u = px; px = -py; py = u; }
      pts.push(px, py);
    }
  }
  return pts;
}

// 1 bpp bitmap helpers (msb first, rows packed continuously like Espruino's ArrayBuffer graphics)
function bitmap(w, h) { return {w, h, px: new Uint8Array(w*h)}; }
function set(b, x, y) { if (x>=0 && y>=0 && x<b.w && y<b.h) b.px[y*b.w+x] = 1; }
function image(b, transparent) {
  const bits = b.w*b.h, out = Buffer.alloc(3 + (transparent?1:0) + Math.ceil(bits/8));
  out[0] = b.w; out[1] = b.h; out[2] = 1 | (transparent ? 128 : 0);
  let o = 3; if (transparent) out[o++] = 0;
  for (let i=0; i<bits; i++) if (b.px[i]) out[o + (i>>3)] |= 0x80 >> (i&7);
  return out;
}

const dial = bitmap(S, S);
// exact frame pixels as drawn by Espruino (fillRect with r:11 / r:10), exported from the watch
const FRAME = JSON.parse(fs.readFileSync(__dirname + "/dial-frame.json"));
for (let y=0; y<S; y++) for (let x=0; x<S; x++) {
  const on = FRAME[y*S+x];
  if (on) dial.px[y*S+x] = 1;
}
for (let s=0; s<60; s++) {
  const p = s%5==0 ? tickPixels(s, 26, 34, 1) : tickPixels(s, 30, 34, 0);
  for (let i=0; i<p.length; i+=2) set(dial, C+p[i], C+p[i+1]);
}
const parts = [image(dial, false)];
for (let s=0; s<60; s++) {
  const p = tickPixels(s, 19, 34, 1);
  let x1=99, y1=99, x2=-99, y2=-99;
  for (let i=0; i<p.length; i+=2) { x1=Math.min(x1,p[i]); x2=Math.max(x2,p[i]); y1=Math.min(y1,p[i+1]); y2=Math.max(y2,p[i+1]); }
  const b = bitmap(x2-x1+1, y2-y1+1);
  for (let i=0; i<p.length; i+=2) set(b, p[i]-x1, p[i+1]-y1);
  const img = image(b, true);
  parts.push(Buffer.from([x1&255, y1&255, y2&255, img.length]), img);
}
const out = Buffer.concat(parts);
fs.writeFileSync(__dirname + "/../dial.bin", out);
console.log("dial.bin", out.length, "bytes");
