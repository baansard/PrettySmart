// Fills the whole screen with the background (no borders), zoomed in on the bedroom.
const Camera = {
  // How far to zoom in past "just fills the screen". 1 = show as much street as possible.
  extraZoom: 1.2,

  zoom: 1,
  offsetX: 0,
  offsetY: 0,

  // Make the canvas match the window (sharp on retina screens too)
  resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    // Big enough to cover the screen in both directions, then zoom in a bit more.
    const cover = Math.max(canvas.width / Room.width, canvas.height / Room.height);
    this.zoom = cover * this.extraZoom;

    // Center on the bedroom, but never pan past the picture's edges.
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    this.offsetX = clamp(canvas.width / 2 - Room.focus.x * this.zoom, canvas.width - Room.width * this.zoom, 0);
    this.offsetY = clamp(canvas.height / 2 - Room.focus.y * this.zoom, canvas.height - Room.height * this.zoom, 0);
  },

  apply(ctx) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.offsetX, this.offsetY);
  },
};
