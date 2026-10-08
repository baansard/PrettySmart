// Tracks which keys are currently held down.
const Input = {
  keys: {},

  init() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    // Drop all keys if the window loses focus so she doesn't keep walking.
    window.addEventListener("blur", () => { this.keys = {}; });
  },

  isDown(key) {
    return !!this.keys[key];
  },
};
