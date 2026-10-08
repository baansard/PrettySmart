// Loads images from assets/ before the game starts.
const Assets = {
  images: {},

  load(name, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.images[name] = img; resolve(); };
      img.onerror = () => { console.warn("Missing image: " + src); resolve(); };
      img.src = src;
    });
  },

  get(name) {
    return this.images[name] || null;
  },
};
