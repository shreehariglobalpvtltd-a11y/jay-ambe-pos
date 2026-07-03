/* Jay Ambe POS — generates jayambe.ico (32x32, green square + white "JA")
   Run once:  node make-icon.js   → writes jayambe.ico in this folder. */
'use strict';
var fs = require('fs');

var W = 32, H = 32;
// 5x7 pixel font for J and A
var GLYPHS = {
  J: ['11111',
      '00100',
      '00100',
      '00100',
      '00100',
      '10100',
      '01100'],
  A: ['01110',
      '10001',
      '10001',
      '11111',
      '10001',
      '10001',
      '10001']
};
var BG = [0x57, 0x7a, 0x07, 0xff];   // BGRA — #077a57
var FG = [0xff, 0xff, 0xff, 0xff];   // white

// pixel grid, default green
var px = [];
for (var y = 0; y < H; y++) { px[y] = []; for (var x = 0; x < W; x++) px[y][x] = BG; }

// draw "JA" scaled 2x, centered: total width = (5+1+5)*2 = 22 → x offset 5; height 14 → y offset 9
function draw(glyph, ox, oy) {
  var g = GLYPHS[glyph];
  for (var gy = 0; gy < 7; gy++) for (var gx = 0; gx < 5; gx++) {
    if (g[gy][gx] === '1') {
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var X = ox + gx * 2 + dx, Y = oy + gy * 2 + dy;
        if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y][X] = FG;
      }
    }
  }
}
draw('J', 5, 9);
draw('A', 17, 9);

// corner rounding: knock out 3px triangle corners to transparent
function clearPx(x, y) { px[y][x] = [0, 0, 0, 0]; }
[[0,0],[1,0],[2,0],[0,1],[1,1],[0,2]].forEach(function (c) {
  clearPx(c[0], c[1]); clearPx(W - 1 - c[0], c[1]);
  clearPx(c[0], H - 1 - c[1]); clearPx(W - 1 - c[0], H - 1 - c[1]);
});

// ---- build ICO (single image, BMP format, 32bpp, bottom-up) ----
var xorSize = W * H * 4, andSize = (W / 8) * H;      // AND mask: 4 bytes per row * 32
var bmpSize = 40 + xorSize + andSize;
var buf = Buffer.alloc(6 + 16 + bmpSize);
var o = 0;
buf.writeUInt16LE(0, o); o += 2;            // reserved
buf.writeUInt16LE(1, o); o += 2;            // type: icon
buf.writeUInt16LE(1, o); o += 2;            // count
buf.writeUInt8(W, o++); buf.writeUInt8(H, o++);
buf.writeUInt8(0, o++); buf.writeUInt8(0, o++);
buf.writeUInt16LE(1, o); o += 2;            // planes
buf.writeUInt16LE(32, o); o += 2;           // bpp
buf.writeUInt32LE(bmpSize, o); o += 4;      // image size
buf.writeUInt32LE(22, o); o += 4;           // offset
// BITMAPINFOHEADER
buf.writeUInt32LE(40, o); o += 4;
buf.writeInt32LE(W, o); o += 4;
buf.writeInt32LE(H * 2, o); o += 4;         // XOR + AND height
buf.writeUInt16LE(1, o); o += 2;
buf.writeUInt16LE(32, o); o += 2;
buf.writeUInt32LE(0, o); o += 4;            // no compression
buf.writeUInt32LE(xorSize + andSize, o); o += 4;
o += 16;                                     // resolutions/colors = 0
// XOR data (bottom-up BGRA)
for (var yy = H - 1; yy >= 0; yy--) for (var xx = 0; xx < W; xx++) {
  var p = px[yy][xx];
  buf.writeUInt8(p[0], o++); buf.writeUInt8(p[1], o++);
  buf.writeUInt8(p[2], o++); buf.writeUInt8(p[3], o++);
}
// AND mask (1 = transparent) bottom-up
for (var y2 = H - 1; y2 >= 0; y2--) {
  for (var b = 0; b < W / 8; b++) {
    var byte = 0;
    for (var bit = 0; bit < 8; bit++) {
      var alpha = px[y2][b * 8 + bit][3];
      if (alpha === 0) byte |= (0x80 >> bit);
    }
    buf.writeUInt8(byte, o++);
  }
}
fs.writeFileSync(__dirname + '/jayambe.ico', buf);
console.log('OK: jayambe.ico written (' + buf.length + ' bytes)');
