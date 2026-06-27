import assert from "node:assert/strict";
import { McpSessionRegistry, type McpSessionCloseReason } from "./mcp-session-registry.js";

class FakeTransport {
  closeCalls = 0;

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

let now = 1_000;
const removed: Array<{ sessionId: string; reason: McpSessionCloseReason; activeSessionCount: number }> = [];
const registry = new McpSessionRegistry<FakeTransport>({
  idleTtlMs: 100,
  now: () => now,
  onRemoved: ({ sessionId, reason, activeSessionCount }) => {
    removed.push({ sessionId, reason, activeSessionCount });
  },
});

const idleTransport = new FakeTransport();
const activeTransport = new FakeTransport();
registry.register("idle", idleTransport);
registry.register("active", activeTransport);

now += 75;
const activeEntry = registry.beginRequest("active");
assert.ok(activeEntry);
assert.equal(activeEntry.inFlightRequests, 1);

now += 50;
assert.equal(await registry.closeIdle(), 1);
assert.equal(registry.size, 1);
assert.equal(idleTransport.closeCalls, 1);
assert.equal(activeTransport.closeCalls, 0);
assert.deepEqual(removed, [{ sessionId: "idle", reason: "idle_expired", activeSessionCount: 1 }]);

now += 500;
assert.equal(await registry.closeIdle(), 0);
assert.equal(registry.size, 1);
assert.equal(activeTransport.closeCalls, 0);

registry.endRequest("active");
now += 100;
assert.equal(await registry.closeIdle(), 1);
assert.equal(registry.size, 0);
assert.equal(activeTransport.closeCalls, 1);
assert.deepEqual(removed.at(-1), {
  sessionId: "active",
  reason: "idle_expired",
  activeSessionCount: 0,
});

const shutdownTransport = new FakeTransport();
registry.register("shutdown", shutdownTransport);
assert.equal(await registry.closeAll(), 1);
assert.equal(shutdownTransport.closeCalls, 1);
assert.deepEqual(removed.at(-1), {
  sessionId: "shutdown",
  reason: "server_shutdown",
  activeSessionCount: 0,
});

const closedTransport = new FakeTransport();
registry.register("closed", closedTransport);
assert.ok(registry.remove("closed", "transport_closed"));
assert.equal(closedTransport.closeCalls, 0);
assert.equal(registry.size, 0);
assert.deepEqual(removed.at(-1), {
  sessionId: "closed",
  reason: "transport_closed",
  activeSessionCount: 0,
});

assert.throws(
  () => new McpSessionRegistry<FakeTransport>({ idleTtlMs: 0 }),
  /MCP session idle TTL must be greater than zero/,
);
