# Travelog

Liftoff-style travel log: log miles and places, raise a score, and climb a global leaderboard.

## Stats stored in MongoDB

Every traveler document keeps these stats:

- Distance traveled
- Counties visited
- States visited
- Monuments visited
- Miles in car
- Miles flown
- Miles in train
- Miles on bike
- Miles on foot
- Score (derived from the stats above)
- Rank (global leaderboard)

Unique county, state, and monument names are stored so repeats do not inflate counts.

## Run

MongoDB should be running locally (`mongodb://127.0.0.1:27017/travelog`).

```bash
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000

Demo accounts: `alex`, `jordan`, `sam`, `riley` — password `password123`

```bash
npm test
npm run seed
```
