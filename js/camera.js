// Fits the whole apartment picture on screen, centered, with pink edges around it.
const Camera = {
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

    this.zoom = Math.min(canvas.width / Room.width, canvas.height / Room.height);
    this.offsetX = (canvas.width - Room.width * this.zoom) / 2;
    this.offsetY = (canvas.height - Room.height * this.zoom) / 2;
  },

  apply(ctx) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.offsetX, this.offsetY);
  },
};
