// The avatar: position, WASD movement and wall/furniture collision.
// x/y/w/h is her FEET hitbox, so she can stand in front of things naturally.
const Player = {
  x: 915,
  y: 300,
  w: 15,
  h: 7,
  speed: 62,        // apartment pixels per second
  spriteHeight: 48, // how tall she's drawn, in apartment pixels
  facing: "down",
  moving: false,
  walkTime: 0,

  update(dt, solids) {
    let dx = 0;
    let dy = 0;
    if (Input.isDown("w")) dy -= 1;
    if (Input.isDown("s")) dy += 1;
    if (Input.isDown("a")) dx -= 1;
    if (Input.isDown("d")) dx += 1;

    // Same speed diagonally as straight
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    this.moving = dx !== 0 || dy !== 0;
    this.walkTime = this.moving ? this.walkTime + dt : 0;

    // Left/right wins on diagonals so you see her side profile
    if (dy < 0) this.facing = "up";
    if (dy > 0) this.facing = "down";
    if (dx < 0) this.facing = "left";
    if (dx > 0) this.facing = "right";

    // Move one axis at a time so she slides along walls instead of sticking
    this.x += dx * this.speed * dt;
    for (const s of solids) {
      if (overlaps(this, s)) {
        if (dx > 0) this.x = s.x - this.w;
        if (dx < 0) this.x = s.x + s.w;
      }
    }

    this.y += dy * this.speed * dt;
    for (const s of solids) {
      if (overlaps(this, s)) {
        if (dy > 0) this.y = s.y - this.h;
        if (dy < 0) this.y = s.y + s.h;
      }
    }
  },

  draw(ctx) {
    const sprite = Assets.get("avatar-" + this.facing);
    if (!sprite) return;

    const scale = this.spriteHeight / sprite.height;
    const sw = sprite.width * scale;
    const sh = this.spriteHeight;

    // Little hop while walking
    const bob = this.moving ? Math.abs(Math.sin(this.walkTime * 12)) * 1.7 : 0;

    // Soft shadow under her feet
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2, this.y + this.h - 2, sw * 0.32, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(sprite, this.x + this.w / 2 - sw / 2, this.y + this.h - sh - bob, sw, sh);
  },
};

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
