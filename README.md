# Travelog

A Liftoff-style travel log: log miles and places, raise a score, and climb a leaderboard.

Installing Node is only the first step. This repo now has a real Express app you can start from VS Code.

## Run it in VS Code

1. Confirm Node itself is installed (a VS Code Node *extension* is not enough). In VS Code open **Terminal → New Terminal** and run:

```bash
node -v
npm -v
```

You should see version numbers. If you get `'node' is not recognized`, install Node from [https://nodejs.org](https://nodejs.org), then **close and reopen VS Code**.

2. Open this project folder in VS Code (**File → Open Folder**).

3. Install packages, then start the server:

```bash
npm install
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser. In the terminal you can Ctrl+click (Windows) or Cmd+click (Mac) the printed link.

To stop the server, click the terminal and press **Ctrl+C**.

### Run with F5 instead

After `npm install`, open `app.js`, press **F5**, and choose **Run Travelog**. That uses `.vscode/launch.json`.

## What you can do

- **Hub** — your score, rank, and every requested stat
- **Log travel** — add miles (car, flown, train, bike, foot) and places
- **Leaderboard** — global ranking

Demo travelers (Alex, Jordan, Sam, Riley) are already on the board. Data is kept in memory while the server is running, so restarting the app resets trips.

## Scoring

- Foot 10 pts/mi, bike 6, train 3, car 2, flown 1
- First visit: county +50, monument +125, state +200
- Repeat places do not add extra place points

```bash
npm test
```
