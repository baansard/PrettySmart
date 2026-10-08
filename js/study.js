// Study menu: opens when the player presses E near the desk.
// States: "closed" → "classes" (pick a notebook) → "studying" (study tools)
const Study = {
  state: "closed",
  activeClass: null,

  _desk: { x: 570, y: 170, w: 100, h: 62 },
  _proximity: 80,

  isNearDesk(player) {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const cx = this._desk.x + this._desk.w / 2;
    const cy = this._desk.y + this._desk.h / 2;
    return Math.abs(px - cx) < this._proximity && Math.abs(py - cy) < this._proximity;
  },

  open() { this.state = "classes"; },

  close() {
    this.state = "closed";
    this.activeClass = null;
  },

  _menuRect(img, canvas) {
    const maxW = Math.min(canvas.width * 0.72, 680);
    const scale = maxW / img.width;
    const w = img.width * scale;
    const h = img.height * scale;
    return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
  },

  handleClick(cx, cy, canvas) {
    if (this.state === "closed") return;

    const key = this.state === "classes" ? "classoptions" : "studyoptions";
    const img = Assets.get(key);
    if (!img) return;

    const r = this._menuRect(img, canvas);

    // Click outside the menu closes it
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) {
      this.close();
      return;
    }

    if (this.state === "classes") {
      const relX = cx - r.x;
      if (relX < r.w / 3)       this.activeClass = "MIS 405";
      else if (relX < r.w * 2/3) this.activeClass = "MIS 430";
      else                        this.activeClass = "FI 302";
      this.state = "studying";
    }
  },

  // Call while camera transform is active so the prompt sits in world space above the desk.
  drawPrompt(ctx) {
    const x  = this._desk.x + this._desk.w / 2;
    const y  = this._desk.y - 18;
    const label = "Press E";

    ctx.font = "bold 13px sans-serif";
    const tw = ctx.measureText(label).width;
    const pw = tw + 16;
    const ph = 20;
    const rx = x - pw / 2;
    const ry = y - ph;

    ctx.fillStyle = "rgba(255,182,193,0.92)";
    ctx.beginPath();
    ctx.roundRect(rx, ry, pw, ph, 6);
    ctx.fill();

    ctx.fillStyle = "#5a2030";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, ry + ph / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  },

  // Call after resetting the transform — draws in screen space.
  draw(ctx, canvas) {
    if (this.state === "closed") return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const key = this.state === "classes" ? "classoptions" : "studyoptions";
    const img = Assets.get(key);
    if (!img) return;

    const r = this._menuRect(img, canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  },
};
