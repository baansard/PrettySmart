// Boots the game and runs the loop: update, then draw, every frame.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let lastTime = 0;
let showHitboxes = false;

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05); // seconds, capped so tab-switching doesn't teleport her
  lastTime = time;

  if (!Study.open && !Manage.visible && !MyPets.visible) Player.update(dt, Room.getSolids());

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  Camera.apply(ctx);

  ctx.imageSmoothingEnabled = false; // crisp pixel-art background
  Room.draw(ctx);
  ctx.imageSmoothingEnabled = true;  // smooth when shrinking her sprite
  Player.draw(ctx);

  if (!Study.open && Study.isNearDesk(Player)) Study.drawPrompt(ctx);

  if (showHitboxes) {
    Room.drawHitboxes(ctx);
    ctx.strokeStyle = "lime";
    ctx.strokeRect(Player.x, Player.y, Player.w, Player.h);
  }

  PetShop.draw(ctx, canvas);

  requestAnimationFrame(loop);
}

async function start() {
  Input.init();
  Camera.resize(canvas);
  window.addEventListener("resize", () => Camera.resize(canvas));

  window.addEventListener("keydown", (e) => {
    // Typing in a text box shouldn't walk, open the desk, or toggle hitboxes (Esc still closes menus).
    if (e.key !== "Escape" && e.target.matches?.("input, textarea, select")) return;
    if (e.key.toLowerCase() === "h") showHitboxes = !showHitboxes;
    if (e.key.toLowerCase() === "e" && !Study.open && Study.isNearDesk(Player)) Study.openMenu();
    if (e.key === "Escape") {
      if (PetProfile.visible) { PetProfile.hide(); return; } // close just the profile, keep the shop open
      Study.close(); PetShop.close(); Manage.hide(); MyPets.hide();
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    PetShop.handleClick(cx, cy, canvas);
  });

  document.getElementById("pet-shop-btn").addEventListener("click", () => {
    Study.close();
    PetShop.toggle();
  });

  await Promise.all([
    ...Room.backgrounds.map(b => Assets.load("bg_" + b.file, "assets/backgrounds/" + b.file)),
    Assets.load("avatar-down",     "assets/girlcharacter/avatar-front.png"),
    Assets.load("avatar-up",       "assets/girlcharacter/avatar-back.png"),
    Assets.load("avatar-left",     "assets/girlcharacter/avatar-left.png"),
    Assets.load("avatar-right",    "assets/girlcharacter/avatar-right.png"),
    Assets.load("petshopmenu",     "assets/petshopmenu.png"),
    ...PetShop.CATS.map(id => Assets.load("cat_" + id, `assets/cat/${id}front.png`)),
    ...PetShop.SUPPLIES.map(id => Assets.load("supply_" + id, PetShop.imagePath(id))),
    ...PetShop.FISH.map(n => Assets.load("fish_" + n, `assets/fish/${n}.png`)),
  ]);
  requestAnimationFrame((t) => { lastTime = t; loop(t); });
}

// start() is called by auth.js after login
