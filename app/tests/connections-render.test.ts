import { test } from "node:test";
import assert from "node:assert/strict";
import { createDrawQueue, type FrameClock } from "../src/components/connections-render";

const unexpectedError = (error: unknown) => assert.fail(String(error));

function frameClock() {
  let next = 0;
  const callbacks = new Map<number, () => void>();
  const clock: FrameClock = {
    request(callback) { callbacks.set(++next, callback); return next; },
    cancel(id) { callbacks.delete(id); },
  };
  return {
    clock,
    get pending() { return callbacks.size; },
    async frame() {
      const ready = [...callbacks.values()]; callbacks.clear();
      await Promise.all(ready.map((callback) => callback()));
    },
  };
}

test("motion updates coalesce into the next frame and read the latest positions", async () => {
  const frames = frameClock(), painted: number[] = [];
  let position = 0;
  const queue = createDrawQueue(async () => { painted.push(position); }, unexpectedError, frames.clock);
  for (let i = 1; i <= 100; i++) { position = i; queue.request(); }
  assert.equal(frames.pending, 1);
  await frames.frame();
  assert.deepEqual(painted, [100]);
  assert.equal(frames.pending, 0);
});

test("a slow draw cannot overlap another draw or accumulate stale frames", async () => {
  const frames = frameClock(), painted: number[] = [];
  let position = 1, active = 0, peak = 0, finish!: () => void;
  const queue = createDrawQueue(async () => {
    active++; peak = Math.max(peak, active); painted.push(position);
    if (painted.length === 1) await new Promise<void>((resolve) => { finish = resolve; });
    active--;
  }, unexpectedError, frames.clock);
  queue.request();
  const first = frames.frame();
  for (let i = 2; i <= 100; i++) { position = i; queue.request(); }
  assert.equal(frames.pending, 0, "wait for the current asynchronous draw before scheduling");
  assert.deepEqual(painted, [1]);
  finish(); await first;
  assert.equal(frames.pending, 1);
  await frames.frame();
  assert.deepEqual(painted, [1, 100]);
  assert.equal(peak, 1);
  assert.equal(frames.pending, 0);
});

test("disposing cancels queued work and prevents a running draw from restarting", async () => {
  const frames = frameClock();
  let draws = 0, finish!: () => void;
  const queue = createDrawQueue(async () => {
    draws++;
    await new Promise<void>((resolve) => { finish = resolve; });
  }, unexpectedError, frames.clock);
  queue.request();
  const first = frames.frame();
  queue.request(); queue.cancel(); queue.request();
  finish(); await first;
  assert.equal(frames.pending, 0);
  await frames.frame();
  assert.equal(draws, 1);
  const untouched = createDrawQueue(async () => { assert.fail("disposed frame ran"); }, unexpectedError, frames.clock);
  untouched.request(); untouched.cancel(); await frames.frame();
});

test("draw errors reach the owner and do not block a later update", async () => {
  const frames = frameClock(), errors: unknown[] = [];
  let draws = 0;
  const error = new Error("draw failed");
  const queue = createDrawQueue(async () => { if (++draws === 1) throw error; }, (e) => errors.push(e), frames.clock);
  queue.request(); await frames.frame();
  assert.deepEqual(errors, [error]);
  queue.request(); await frames.frame();
  assert.equal(draws, 2);
});
