const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("events");
const { app } = require("../app");
const store = require("../lib/store");

describe("http", () => {
  let server;
  let base;

  before(async () => {
    store.reset();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
  });

  it("saves a named trip from the log form and shows one You on the board", async () => {
    const posted = await fetch(`${base}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
      body: new URLSearchParams({
        tripName: "Coast highway",
        milesInCar: "120",
        milesOnFoot: "4",
        states: "California",
        counties: "Los Angeles",
        monuments: "Griffith Observatory"
      })
    });
    assert.equal(posted.status, 302);
    assert.equal(posted.headers.get("location"), "/hub");

    const hub = await fetch(`${base}/hub`);
    const hubHtml = await hub.text();
    assert.match(hubHtml, /Coast highway/);
    assert.doesNotMatch(hubHtml, /Untitled trip/);

    const board = await fetch(`${base}/leaderboard`);
    const boardHtml = await board.text();
    const youRows = boardHtml.match(/@you/g) || [];
    assert.equal(youRows.length, 1);
  });
});
