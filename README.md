# PrettySmart

A cozy study game: walk around your apartment, sit at your desk, and study your classes with books, flashcards, and quizzes.

## Architecture

Full notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
Browser game (HTML canvas + JS)  →  C# Web API (ASP.NET Core 10)  →  Supabase (Postgres + Auth)
```

- **Frontend** — vanilla JS + canvas (`index.html`, `style.css`, `js/`, `assets/`).
- **Backend** — `server/PrettySmart.Api`, an ASP.NET Core minimal API. It serves the game and owns the game logic.
  - Verifies Supabase access tokens (ES256 JWTs) using the project's public signing keys via OpenID discovery.
  - Talks to Supabase's REST API *as the signed-in user*, so Postgres Row Level Security still protects every row and the server holds no admin keys.
  - Ownership (`user_id`) is always taken from the verified token, never from the request body.
- **Tests** — `server/PrettySmart.Api.Tests` (xUnit + `WebApplicationFactory`) cover auth, validation, error mapping, and the Supabase calls.

## Editing the pet shop

Pet names, types, prices, descriptions, personality and care level live in
`server/PrettySmart.Api/Shop/catalog.json`. Save the file and refresh the game; no restart needed.
If an edit has a mistake, the server keeps using the last working version and prints what's wrong.

## Database setup

Run the scripts in `server/sql/` once, in order, in the Supabase SQL Editor.

## Run it

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download).

```sh
cd server/PrettySmart.Api
dotnet run
```

Then open http://localhost:5173. (Opening `index.html` directly won't work any more — the game needs the API.)

Run the tests:

```sh
cd server
dotnet test
```

## API

| Method | Path                 | Description                 |
|--------|----------------------|-----------------------------|
| GET    | `/api/health`        | Health check (no auth)      |
| GET    | `/api/classes`       | Your classes, sorted by name |
| POST   | `/api/classes`       | Create a class `{ "name" }` |
| DELETE | `/api/classes/{id}`  | Delete one of your classes  |
| GET    | `/api/quiz/chapters?classId=` | Chapters with question counts and % correct on the last 30 answers |
| GET    | `/api/quiz/questions?classId=&chapterId=` | Shuffled questions (answers are never sent to the browser) |
| POST   | `/api/quiz/answers`  | Grade an answer `{ questionId, answer }`, record it, award points |
| GET    | `/api/quiz/points`   | Your total points |
| GET    | `/api/coins`         | Your coin balance |
| GET    | `/api/shop/items`    | Pet shop catalog: name, kind, price, description |
| GET    | `/api/shop/items/{id}` | One item's profile |
| GET    | `/api/shop/check/{id}` | Can you buy it? Requirement checklist + reason |
| POST   | `/api/shop/buy`      | Buy `{ itemId }` (price from the catalog, balance checked in the database) |
| GET    | `/api/me`            | Your coins, pets and inventory |
| PATCH  | `/api/pets/{id}`     | Name a pet `{ nickname }` |
| POST   | `/api/ai/generate`   | Pasted text → draft quiz questions/flashcards `{ text, multipleChoice, typeIn, flashcards }` (OpenAI) |
| POST   | `/api/ai/save`       | Save reviewed drafts into a class/chapter |

## Controls

WASD to walk, E at the desk to study, Esc to close menus, H to toggle hitboxes.
