export type McpSessionCloseReason = "transport_closed" | "idle_expired" | "server_shutdown";

export interface McpSessionTransport {
  close(): Promise<void>;
}

export interface McpSessionEntry<TTransport extends McpSessionTransport> {
  transport: TTransport;
  createdAtMs: number;
  lastActivityAtMs: number;
  inFlightRequests: number;
}

export interface McpSessionSnapshot<TTransport extends McpSessionTransport> extends McpSessionEntry<TTransport> {
  sessionId: string;
}

export interface McpSessionRemovalEvent {
  sessionId: string;
  reason: McpSessionCloseReason;
  createdAtMs: number;
  lastActivityAtMs: number;
  inFlightRequests: number;
  idleDurationMs: number;
  activeSessionCount: number;
}

export interface McpSessionCloseErrorEvent extends McpSessionRemovalEvent {
  error: unknown;
}

export interface McpSessionRegistryOptions {
  idleTtlMs: number;
  now?: () => number;
  onRemoved?: (event: McpSessionRemovalEvent) => void;
  onCloseError?: (event: McpSessionCloseErrorEvent) => void;
}

export class McpSessionRegistry<TTransport extends McpSessionTransport> {
  private readonly sessions = new Map<string, McpSessionEntry<TTransport>>();
  private readonly now: () => number;

  constructor(private readonly options: McpSessionRegistryOptions) {
    if (!Number.isFinite(options.idleTtlMs) || options.idleTtlMs <= 0) {
      throw new Error("MCP session idle TTL must be greater than zero.");
    }
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.sessions.size;
  }

  register(sessionId: string, transport: TTransport): McpSessionEntry<TTransport> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`MCP session already exists: ${sessionId}`);
    }

    const timestamp = this.now();
    const entry: McpSessionEntry<TTransport> = {
      transport,
      createdAtMs: timestamp,
      lastActivityAtMs: timestamp,
      inFlightRequests: 0,
    };
    this.sessions.set(sessionId, entry);
    return entry;
  }

  get(sessionId: string): McpSessionEntry<TTransport> | undefined {
    return this.sessions.get(sessionId);
  }

  beginRequest(sessionId: string): McpSessionEntry<TTransport> | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;

    entry.lastActivityAtMs = this.now();
    entry.inFlightRequests += 1;
    return entry;
  }

  endRequest(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    entry.inFlightRequests = Math.max(0, entry.inFlightRequests - 1);
    entry.lastActivityAtMs = this.now();
  }

  remove(sessionId: string, reason: McpSessionCloseReason): McpSessionEntry<TTransport> | undefined {
    const snapshot = this.removeSnapshot(sessionId, reason);
    return snapshot?.entry;
  }

  async close(sessionId: string, reason: McpSessionCloseReason): Promise<boolean> {
    const snapshot = this.removeSnapshot(sessionId, reason);
    if (!snapshot) return false;

    try {
      await snapshot.entry.transport.close();
    } catch (error) {
      this.options.onCloseError?.({
        sessionId,
        reason,
        createdAtMs: snapshot.entry.createdAtMs,
        lastActivityAtMs: snapshot.entry.lastActivityAtMs,
        inFlightRequests: snapshot.entry.inFlightRequests,
        idleDurationMs: snapshot.idleDurationMs,
        activeSessionCount: snapshot.activeSessionCount,
        error,
      });
    }
    return true;
  }

  async closeIdle(): Promise<number> {
    const now = this.now();
    const staleSessionIds = Array.from(this.sessions.entries())
      .filter(([, entry]) => entry.inFlightRequests === 0 && now - entry.lastActivityAtMs >= this.options.idleTtlMs)
      .map(([sessionId]) => sessionId);

    let closed = 0;
    for (const sessionId of staleSessionIds) {
      if (await this.close(sessionId, "idle_expired")) {
        closed += 1;
      }
    }
    return closed;
  }

  async closeAll(reason: McpSessionCloseReason = "server_shutdown"): Promise<number> {
    const sessionIds = Array.from(this.sessions.keys());
    let closed = 0;
    for (const sessionId of sessionIds) {
      if (await this.close(sessionId, reason)) {
        closed += 1;
      }
    }
    return closed;
  }

  private removeSnapshot(
    sessionId: string,
    reason: McpSessionCloseReason,
  ): {
    entry: McpSessionEntry<TTransport>;
    activeSessionCount: number;
    idleDurationMs: number;
  } | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;

    this.sessions.delete(sessionId);
    const idleDurationMs = Math.max(0, this.now() - entry.lastActivityAtMs);
    this.options.onRemoved?.({
      sessionId,
      reason,
      createdAtMs: entry.createdAtMs,
      lastActivityAtMs: entry.lastActivityAtMs,
      inFlightRequests: entry.inFlightRequests,
      idleDurationMs,
      activeSessionCount: this.sessions.size,
    });
    return {
      entry,
      activeSessionCount: this.sessions.size,
      idleDurationMs,
    };
  }
}
