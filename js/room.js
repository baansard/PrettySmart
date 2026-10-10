// The apartment: background art plus invisible blocks she can't walk through.
// All numbers are pixel coordinates in newbackground(daytime).png (1821 x 864).
const Room = {
  width: 1821,
  height: 864,

  // The middle of the bedroom — the camera centers here.
  focus: { x: 924, y: 270 },

  // The floor she can walk on (everything outside this is wall)
  floor: { x: 797, y: 170, w: 254, h: 242 },

  // Furniture hitboxes. Press H in-game to see them drawn in red.
  furniture: [
    { name: "desk",       x: 797,  y: 160, w: 72, h: 30 },
    { name: "chair",      x: 820,  y: 190, w: 26, h: 14 },
    { name: "deskplant",  x: 797,  y: 190, w: 20, h: 25 },
    { name: "bed",        x: 797,  y: 218, w: 62, h: 105 },
    { name: "lamp",       x: 797,  y: 330, w: 16, h: 36 },
    { name: "beanbag",    x: 815,  y: 335, w: 54, h: 38 },
    { name: "plant",      x: 797,  y: 372, w: 30, h: 40 },
    { name: "fireplace",  x: 827,  y: 385, w: 58, h: 27 },
    { name: "bookshelf",  x: 1010, y: 150, w: 41, h: 72 },
    { name: "nightstand", x: 1015, y: 222, w: 36, h: 40 },
    { name: "mirror",     x: 1000, y: 250, w: 22, h: 40 },
    { name: "vanity",     x: 1018, y: 265, w: 33, h: 115 },
    { name: "sidetable",  x: 1015, y: 380, w: 36, h: 32 },
    { name: "backpack",   x: 980,  y: 397, w: 27, h: 15 },
  ],

  // Everything solid: the walls around the floor plus furniture.
  getSolids() {
    const f = this.floor;
    return [
      { x: f.x, y: f.y - 50, w: f.w, h: 50 },   // top wall
      { x: f.x, y: f.y + f.h, w: f.w, h: 50 },  // bottom wall
      { x: f.x - 50, y: f.y, w: 50, h: f.h },   // left wall
      { x: f.x + f.w, y: f.y, w: 50, h: f.h },  // right wall
      ...this.furniture,
    ];
  },

  draw(ctx) {
    const hour = new Date().getHours();
    const key = (hour >= 6 && hour < 20) ? "apartment-day" : "apartment-night";
    const bg = Assets.get(key);
    if (bg) ctx.drawImage(bg, 0, 0, this.width, this.height);
  },

  drawHitboxes(ctx) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    for (const s of this.getSolids()) ctx.strokeRect(s.x, s.y, s.w, s.h);
  },
};
