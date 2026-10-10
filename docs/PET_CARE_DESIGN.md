# Pet Care — Design Plan

**Status:** planned, not built yet. Written 2026-10-10.

## The idea

Pets are the reason to keep studying. Studying (quizzes) earns coins; coins buy pets, the equipment they need,
and the supplies they use up. Pets have needs that drain over **real time**, and some pets are much harder to
keep alive than others. If you don't get on and study, you can't afford to care for them, and they can get sick
and die. Lots of interacting factors is the point: it gives you many small reasons to come back.

---

## Building blocks

### 1. Item kinds

| Kind | Bought | Examples |
|---|---|---|
| **Pet** | once each (cats) or many (fish — see open questions) | Carmy, Bingus, Neon Tetra, Discus |
| **Equipment** | once, kept forever | food bowl, water bowl, water fountain, scratching post, 10-gallon tank, 20-gallon tank |
| **Supply** | in quantities, used up | dry cat food, fish food flakes |

### 2. Requirements (before you can buy a pet)

Each pet lists what you must own first. A requirement can be "one of" a group.

- **Carmy:** food bowl + (water bowl **or** water fountain) + scratching post
- **Neon Tetra:** 10-gallon tank (or bigger)
- **Discus:** 20-gallon tank

The profile card shows a checklist (owned / missing) and the **Buy** button stays locked until it's complete.
Tank size may also limit **how many** fish you can keep (open question).

### 3. Stats

Each pet has meters from **100 (great)** to **0 (critical)**:

- **hunger** — refilled by feeding (uses a supply)
- **thirst** — refilled by refilling water (cats); fish may skip this
- **happiness** — helped by toys/equipment and possibly by studying
- **cleanliness** — fish tanks get dirty (maybe later)

### 4. Pet-specific rates and equipment effects

Every pet has its own drain speed per stat. Equipment can slow a drain down.

- Carmy gets dehydrated fast, but a **fountain** halves his thirst drain (he drinks more from it).
- A scratching post slows happiness loss for cats.
- A pleco is low-maintenance; a discus is high-maintenance.

The existing "care" hearts on profile cards should be derived from (or at least match) these rates.

### 5. Care actions

| Action | Needs | Effect |
|---|---|---|
| Feed | food bowl (cats) + 1 food supply | hunger back up |
| Refill water | water bowl or fountain | thirst back up |
| (later) Clean tank | tank | cleanliness back up |

Out of food → you must earn coins (study) and buy more.

### 6. Consequences

A stat sitting at 0 escalates in stages, so it's motivating rather than crushing:

1. **Warning** — "Carmy is very thirsty"
2. **Sick** — after X hours at 0 (shown clearly; maybe a vet option)
3. **Dies** — after more neglect while sick

---

## How it works technically

### No constant ticking — calculate from timestamps

The Azure free server sleeps, so nothing runs in the background. Instead the database stores each stat's
value **and the time it was last updated**. Whenever the game asks, the C# server calculates the current value:

```
current = stored − drainPerHour × hoursSinceUpdate × (equipment multipliers)
```

…clamped to 0–100. Sickness/death are decided the same way, from how long a stat has been at 0. Every care
action saves the new values with the current time. This is how idle games work, and it's easy to unit-test
(pass in a fake "now").

### Rules live in `catalog.json`

All tuning stays hand-editable. Example shape for Carmy (final field names may change):

```json
{
  "id": "cat",
  "kind": "cat",
  "name": "Carmy",
  "price": 1850,
  "requires": ["foodbowl", ["waterbowl", "fountain"], "scratchingpost"],
  "stats": {
    "hunger":    { "drainPerHour": 2 },
    "thirst":    { "drainPerHour": 4,   "slowerWith": { "fountain": 0.5 } },
    "happiness": { "drainPerHour": 1.5, "slowerWith": { "scratchingpost": 0.7 } }
  }
}
```

Equipment and supplies become catalog entries too, e.g.:

```json
{ "id": "fountain", "kind": "equipment", "name": "Water Fountain", "price": 250, "description": "…" },
{ "id": "drycatfood", "kind": "supply", "name": "Dry Cat Food", "price": 20, "feeds": "hunger", "amount": 40 }
```

### Database (new tables, via `server/sql/003_…`)

| Table | Purpose |
|---|---|
| `purchases` | Log of every purchase: user, item id, price paid, time. Spent coins = sum of these. |
| `inventory` | What you own and how many: user, item id, quantity (equipment = 1, supplies = count). |
| `pets` | Each owned pet: user, species id, optional nickname, each stat value, `stats_updated_at`, status (healthy / sick / dead), times for sick/death. |

**Coin balance** = coins earned from quizzes − coins spent (sum of `purchases`). Always calculated by the server.

### Security fix that comes with this

Right now a logged-in user can insert rows into `quiz_answers` directly through Supabase (skipping the C#
grading), which means coins could be faked. Before money-like data matters more, change it so:

- The C# server gets a **server-only Supabase key** (service role), stored as a secret in Azure App Service
  configuration and locally in .NET user-secrets — never in JS or the repo.
- RLS lets users **read** their own `quiz_answers`, `purchases`, `inventory`, `pets`, but **not insert/update** them.
  Only the server writes, always using the user id from the verified login token.
- Buying runs as **one all-or-nothing database step** (a Postgres function) that re-checks the balance, so
  double-clicks can't spend the same coins twice.

---

## Phases

1. **Shopping & owning** — equipment + supplies in the shop, requirement checklists, Buy button, owned pets and
   inventory, coin balance = earned − spent, plus the security fix above.
2. **Stats & care** — meters on owned pets, drain over time, equipment multipliers, Feed / Refill water.
3. **Consequences & life** — warnings, sickness, death (and maybe a vet), pets visible in the apartment
   (cat walking around using its side/back/sleep sprites, fish tank), notifications of urgent needs on login.

Each phase should be playable and committed on its own.

---

## Open questions (decide before/while building)

1. **Pace:** how long can a pet survive with zero care? (~2–3 days = daily studying; ~1 week = forgiving)
2. **Death:** permanent, or a way to save a sick pet (e.g. a vet that costs coins)?
3. **Duplicates:** one of each cat? Many of the same fish? Does tank size cap how many fish?
4. **Food:** stock up in quantities and use it up when feeding? (planned: yes)
5. **Names:** can you rename pets you buy?
6. **Studying bonus:** does studying at the desk itself boost pet happiness?
7. **Art needed:** food bowl, water bowl, fountain, scratching post, tanks (sizes). Placeholders until drawn?
8. **Where pets appear:** in the apartment right away (Phase 3), or just "owned" until then?
