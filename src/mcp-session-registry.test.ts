import assert from "node:assert/strict";
import { McpSessionRegistry, type McpSessionCloseReason } from "./mcp-session-registry.js";

class FakeTransport {
  closeCalls = 0;
  closeError?: Error;

  async close(): Promise<void> {
    this.closeCalls += 1;
    if (this.closeError) throw this.closeError;
  }
}

let now = 1_000;
const removed: Array<{
  sessionId: string;
  reason: McpSessionCloseReason;
  activeSessionCount: number;
  idleDurationMs: number;
}> = [];
const closeErrors: Array<{
  sessionId: string;
  reason: McpSessionCloseReason;
  idleDurationMs: number;
  error: unknown;
}> = [];
const registry = new McpSessionRegistry<FakeTransport>({
  idleTtlMs: 100,
  now: () => now,
  onRemoved: ({ sessionId, reason, activeSessionCount, idleDurationMs }) => {
    removed.push({ sessionId, reason, activeSessionCount, idleDurationMs });
  },
  onCloseError: ({ sessionId, reason, idleDurationMs, error }) => {
    closeErrors.push({ sessionId, reason, idleDurationMs, error });
  },
});

const idleTransport = new FakeTransport();
const activeTransport = new FakeTransport();
const idleEntry = registry.register("idle", idleTransport);
registry.register("active", activeTransport);
assert.equal(idleEntry.createdAtMs, 1_000);
assert.equal(idleEntry.lastActivityAtMs, 1_000);
assert.equal(idleEntry.inFlightRequests, 0);
assert.equal(registry.get("idle"), idleEntry);

now += 75;
const activeEntry = registry.beginRequest("active");
assert.ok(activeEntry);
assert.equal(activeEntry.inFlightRequests, 1);
assert.equal(activeEntry.lastActivityAtMs, 1_075);

now += 50;
assert.equal(await registry.closeIdle(), 1);
assert.equal(registry.size, 1);
assert.equal(idleTransport.closeCalls, 1);
assert.equal(activeTransport.closeCalls, 0);
assert.deepEqual(removed, [{
  sessionId: "idle",
  reason: "idle_expired",
  activeSessionCount: 1,
  idleDurationMs: 125,
}]);

now += 500;
assert.equal(await registry.closeIdle(), 0);
assert.equal(registry.size, 1);
assert.equal(activeTransport.closeCalls, 0);
assert.equal(registry.beginRequest("missing"), undefined);

registry.endRequest("active");
assert.equal(activeEntry.inFlightRequests, 0);
assert.equal(activeEntry.lastActivityAtMs, 1_625);
registry.endRequest("active");
assert.equal(activeEntry.inFlightRequests, 0);
now += 100;
assert.equal(await registry.closeIdle(), 1);
assert.equal(registry.size, 0);
assert.equal(activeTransport.closeCalls, 1);
assert.deepEqual(removed.at(-1), {
  sessionId: "active",
  reason: "idle_expired",
  activeSessionCount: 0,
  idleDurationMs: 100,
});

const shutdownTransport = new FakeTransport();
registry.register("shutdown", shutdownTransport);
assert.equal(await registry.closeAll(), 1);
assert.equal(shutdownTransport.closeCalls, 1);
assert.equal(await registry.closeAll(), 0);
assert.deepEqual(removed.at(-1), {
  sessionId: "shutdown",
  reason: "server_shutdown",
  activeSessionCount: 0,
  idleDurationMs: 0,
});

const closedTransport = new FakeTransport();
registry.register("closed", closedTransport);
assert.ok(registry.remove("closed", "transport_closed"));
assert.equal(registry.remove("closed", "transport_closed"), undefined);
assert.equal(closedTransport.closeCalls, 0);
assert.equal(registry.size, 0);
assert.deepEqual(removed.at(-1), {
  sessionId: "closed",
  reason: "transport_closed",
  activeSessionCount: 0,
  idleDurationMs: 0,
});

const errorTransport = new FakeTransport();
errorTransport.closeError = new Error("boom");
registry.register("close-error", errorTransport);
assert.equal(await registry.close("close-error", "server_shutdown"), true);
assert.equal(await registry.close("close-error", "server_shutdown"), false);
assert.equal(errorTransport.closeCalls, 1);
assert.equal(closeErrors.length, 1);
assert.equal(closeErrors[0]?.sessionId, "close-error");
assert.equal(closeErrors[0]?.reason, "server_shutdown");
assert.match(String(closeErrors[0]?.error), /boom/);

assert.throws(
  () => new McpSessionRegistry<FakeTransport>({ idleTtlMs: 0 }),
  /MCP session idle TTL must be greater than zero/,
);
