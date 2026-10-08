// Pet Shop overlay — opened by the sidebar button, closed by Esc or clicking outside.
const PetShop = {
  open: false,
  fishPage: 0,

  FISH: [
    "dwarfgourami", "pandacorydora", "orangeplaty", "femalecherrybarb", "guppy",
    "neontetra", "fantailgoldfish", "commonbetta", "classicangelfish",
    "rummynosetetra", "discus", "plecostomus",
  ],
  FISH_PER_PAGE: 4,

  // Per-fish scale multipliers — 1.0 is default size, lower = smaller.
  _FISH_SCALE: {
    femalecherrybarb: 0.75,
  },

  // All positions are fractions of the drawn menu rect so they scale with window size.
  // Adjust these if items need nudging after visual testing.
  _L: {
    xStart:    0.23,   // left edge of usable shelf (after label tags)
    xFishEnd:  0.84,   // right edge for fish slots (leaves room for arrow)
    fishY:     0.46,   // shelf surface — fish bottoms align here
    catY:      0.665,  // shelf surface — cat bottom aligns here
    foodY:     0.850,  // shelf surface — food bottoms align here
    fishH:     0.155,  // fish item height as fraction of menu height
    catH:      0.195,  // cat item height
    foodH:     0.155,  // food item height
    arrowX:    0.865,  // arrow button left edge
    arrowY:    0.355,  // arrow button top edge
    arrowSize: 0.058,  // arrow button width & height
  },

  toggle() { this.open = !this.open; },
  close()  { this.open = false; },

  _rect(canvas) {
    const img = Assets.get("petshopmenu");
    if (!img) return null;
    const maxW = Math.min(canvas.width * 0.97, 1200);
    const scale = maxW / img.width;
    const w = img.width  * scale;
    const h = img.height * scale;
    return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
  },

  _arrowBtn(r) {
    const l = this._L;
    const s = r.w * l.arrowSize;
    return { x: r.x + r.w * l.arrowX, y: r.y + r.h * l.arrowY, w: s, h: s };
  },

  handleClick(cx, cy, canvas) {
    if (!this.open) return;
    const r = this._rect(canvas);
    if (!r) return;

    // Click outside closes
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) {
      this.close();
      return;
    }

    // Arrow cycles fish pages
    const btn = this._arrowBtn(r);
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      const pages = Math.ceil(this.FISH.length / this.FISH_PER_PAGE);
      this.fishPage = (this.fishPage + 1) % pages;
    }
  },

  draw(ctx, canvas) {
    if (!this.open) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = Assets.get("petshopmenu");
    if (!img) return;
    const r = this._rect(canvas);
    if (!r) return;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);

    this._drawFishShelf(ctx, r);
    this._drawCatShelf(ctx, r);
    this._drawFoodShelf(ctx, r);
  },

  _drawFishShelf(ctx, r) {
    const l = this._L;
    const shelfY  = r.y + r.h * l.fishY;
    const xStart  = r.x + r.w * l.xStart;
    const xEnd    = r.x + r.w * l.xFishEnd;
    const itemH   = r.h * l.fishH;
    const slotW   = (xEnd - xStart) / this.FISH_PER_PAGE;

    const pageStart = this.fishPage * this.FISH_PER_PAGE;
    this.FISH.slice(pageStart, pageStart + this.FISH_PER_PAGE).forEach((name, i) => {
      const fish = Assets.get("fish_" + name);
      if (!fish) return;
      const mult = this._FISH_SCALE[name] ?? 1;
      const h = itemH * mult;
      const scale = h / fish.height;
      const iw = fish.width * scale;
      ctx.drawImage(fish, xStart + slotW * i + (slotW - iw) / 2, shelfY - h, iw, h);
    });

    // Arrow button
    const btn   = this._arrowBtn(r);
    const pages = Math.ceil(this.FISH.length / this.FISH_PER_PAGE);
    ctx.fillStyle = pages > 1 ? "rgba(224,96,144,0.92)" : "rgba(160,160,160,0.4)";
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(btn.h * 0.68)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("›", btn.x + btn.w / 2, btn.y + btn.h / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  },

  _drawCatShelf(ctx, r) {
    const l    = this._L;
    const img  = Assets.get("catfront");
    if (!img) return;
    const itemH = r.h * l.catH;
    const scale = itemH / img.height;
    const iw    = img.width * scale;
    ctx.drawImage(img, r.x + r.w * l.xStart + 10, r.y + r.h * l.catY - itemH, iw, itemH);
  },

  _drawFoodShelf(ctx, r) {
    const l      = this._L;
    const shelfY = r.y + r.h * l.foodY;
    const itemH  = r.h * l.foodH;
    let x = r.x + r.w * l.xStart;
    const gap = r.w * 0.045;

    for (const key of ["drycatfood", "fishfoodflakes"]) {
      const img = Assets.get(key);
      if (!img) continue;
      const scale = itemH / img.height;
      const iw = img.width * scale;
      ctx.drawImage(img, x, shelfY - itemH, iw, itemH);
      x += iw + gap;
    }
  },
};
