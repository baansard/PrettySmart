// The apartment: background art plus invisible blocks she can't walk through.
// All numbers are pixel coordinates in apartment-day.jpg (1536 x 1024).
const Room = {
  width: 1536,
  height: 1024,

  // The floor she can walk on (everything outside this is wall)
  floor: { x: 570, y: 200, w: 320, h: 395 },

  // Furniture hitboxes. Press H in-game to see them drawn in red.
  furniture: [
    { name: "desk",       x: 570, y: 170, w: 100, h: 62 },
    { name: "chair",      x: 606, y: 232, w: 32,  h: 18 },
    { name: "bed",        x: 572, y: 262, w: 88,  h: 178 },
    { name: "lamp",       x: 572, y: 458, w: 24,  h: 56 },
    { name: "beanbag",    x: 600, y: 452, w: 78,  h: 68 },
    { name: "plant",      x: 572, y: 520, w: 40,  h: 75 },
    { name: "fireplace",  x: 610, y: 538, w: 84,  h: 57 },
    { name: "bookshelf",  x: 830, y: 170, w: 60,  h: 105 },
    { name: "nightstand", x: 840, y: 275, w: 50,  h: 55 },
    { name: "mirror",     x: 820, y: 330, w: 25,  h: 42 },
    { name: "vanity",     x: 840, y: 370, w: 50,  h: 160 },
    { name: "sidetable",  x: 838, y: 530, w: 52,  h: 65 },
    { name: "backpack",   x: 796, y: 565, w: 34,  h: 30 },
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
