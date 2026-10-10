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

  // Cat ids — each has a picture at assets/cat/<id>front.png ("cat" is Carmy).
  CATS: ["cat", "bingus", "felix", "sphynx"],
  CATS_PER_PAGE: 4,
  catPage: 0,

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
    arrowY:    0.355,  // fish arrow button top edge
    catArrowY: 0.560,  // cat arrow button top edge
    arrowSize: 0.058,  // arrow button width & height
  },

  // Where each item was last drawn (screen coords), so clicks can open its profile.
  _hits: [],

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

  _arrowBtn(r, top = this._L.arrowY) {
    const l = this._L;
    const s = r.w * l.arrowSize;
    return { x: r.x + r.w * l.arrowX, y: r.y + r.h * top, w: s, h: s };
  },

  _inside(px, py, b) { return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; },

  handleClick(cx, cy, canvas) {
    if (!this.open) return;
    const r = this._rect(canvas);
    if (!r) return;

    // Click outside closes
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) {
      this.close();
      return;
    }

    // Arrows cycle pages
    if (this._inside(cx, cy, this._arrowBtn(r))) {
      this.fishPage = (this.fishPage + 1) % Math.ceil(this.FISH.length / this.FISH_PER_PAGE);
      return;
    }
    const catPages = Math.ceil(this.CATS.length / this.CATS_PER_PAGE);
    if (catPages > 1 && this._inside(cx, cy, this._arrowBtn(r, this._L.catArrowY))) {
      this.catPage = (this.catPage + 1) % catPages;
      return;
    }

    // Clicking an item opens its profile
    const hit = this._hits.find(h => this._inside(cx, cy, h));
    if (hit) PetProfile.show(hit.id);
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

    this._hits = [];
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
      const fx = xStart + slotW * i + (slotW - iw) / 2;
      ctx.drawImage(fish, fx, shelfY - h, iw, h);
      this._hits.push({ id: name, x: fx, y: shelfY - h, w: iw, h });
    });

    this._drawArrow(ctx, this._arrowBtn(r), Math.ceil(this.FISH.length / this.FISH_PER_PAGE) > 1);
  },

  _drawArrow(ctx, btn, enabled) {
    ctx.fillStyle = enabled ? "rgba(224,96,144,0.92)" : "rgba(160,160,160,0.4)";
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
    const l      = this._L;
    const shelfY = r.y + r.h * l.catY;
    const xStart = r.x + r.w * l.xStart;
    const itemH  = r.h * l.catH;
    const slotW  = (r.x + r.w * l.xFishEnd - xStart) / this.CATS_PER_PAGE;

    const pageStart = this.catPage * this.CATS_PER_PAGE;
    this.CATS.slice(pageStart, pageStart + this.CATS_PER_PAGE).forEach((id, i) => {
      const img = Assets.get("cat_" + id);
      if (!img) return;
      const iw = img.width * (itemH / img.height);
      const x  = xStart + slotW * i + (slotW - iw) / 2;
      ctx.drawImage(img, x, shelfY - itemH, iw, itemH);
      this._hits.push({ id, x, y: shelfY - itemH, w: iw, h: itemH });
    });

    // Only show the cat arrow once there are more cats than fit on the shelf
    if (this.CATS.length > this.CATS_PER_PAGE) this._drawArrow(ctx, this._arrowBtn(r, l.catArrowY), true);
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
      this._hits.push({ id: key, x, y: shelfY - itemH, w: iw, h: itemH });
      x += iw + gap;
    }
  },
};
