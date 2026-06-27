import assert from "node:assert/strict";
import type { Server as HttpServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { resourceUrlFromServerUrl } from "@modelcontextprotocol/sdk/shared/auth-utils.js";
import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { SingleUserOAuthProvider } from "./oauth-provider.js";
import { createServer } from "./server.js";

const OWNER_TOKEN = "test-owner-token-that-is-long-enough";

const initializeBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "devspace-test-client",
      version: "1.0.0",
    },
  },
};

const mcpAcceptHeader = "application/json, text/event-stream";

const originalVerifyAccessToken = SingleUserOAuthProvider.prototype.verifyAccessToken;

try {
  await testAuthLogsRemainRedacted();
  await testCleanedSessionReturns404();
} finally {
  SingleUserOAuthProvider.prototype.verifyAccessToken = originalVerifyAccessToken;
}

async function testAuthLogsRemainRedacted(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "devspace-server-auth-test-"));
  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: tempDir,
    DEVSPACE_ALLOWED_ROOTS: process.cwd(),
    DEVSPACE_OAUTH_OWNER_TOKEN: OWNER_TOKEN,
    DEVSPACE_PUBLIC_BASE_URL: "https://devspace.example.com",
    DEVSPACE_LOG_LEVEL: "warn",
  });
  const resource = resourceUrlFromServerUrl(new URL(config.mcpPath, config.publicBaseUrl));
  SingleUserOAuthProvider.prototype.verifyAccessToken = async function verifyAccessToken(token: string) {
    if (token === "low-scope-token") {
      return {
        token,
        clientId: "test-client",
        scopes: ["other"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        resource,
      };
    }
    throw new InvalidTokenError("Invalid or expired access token");
  };

  try {
    const captured = await captureConsole(async () => {
      const running = createServer(config);
      const server = await listen(running.app);
      const baseUrl = baseUrlFor(server);
      try {
        const missing = await fetch(`${baseUrl}${config.mcpPath}`, {
          method: "POST",
          headers: {
            accept: mcpAcceptHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify(initializeBody),
        });
        assert.equal(missing.status, 401);

        const malformed = await fetch(`${baseUrl}${config.mcpPath}`, {
          method: "POST",
          headers: {
            accept: mcpAcceptHeader,
            authorization: "Basic abc123",
            "content-type": "application/json",
          },
          body: JSON.stringify(initializeBody),
        });
        assert.equal(malformed.status, 401);

        const invalid = await fetch(`${baseUrl}${config.mcpPath}`, {
          method: "POST",
          headers: {
            accept: mcpAcceptHeader,
            authorization: "Bearer super-secret-invalid-token",
            "content-type": "application/json",
          },
          body: JSON.stringify(initializeBody),
        });
        assert.equal(invalid.status, 401);

        const insufficientScope = await fetch(`${baseUrl}${config.mcpPath}`, {
          method: "POST",
          headers: {
            accept: mcpAcceptHeader,
            authorization: "Bearer low-scope-token",
            "content-type": "application/json",
          },
          body: JSON.stringify(initializeBody),
        });
        assert.equal(insufficientScope.status, 403);
      } finally {
        await closeHttpServer(server);
        await running.close();
      }
    });

    const authEvents = parseJsonLogLines(captured).filter((line) => line.event === "auth_denied");
    assert.deepEqual(
      authEvents.map((event) => event.reason),
      [
        "missing_bearer",
        "malformed_bearer",
        "invalid_or_expired_access_token",
        "insufficient_scope",
      ],
    );
    assert.doesNotMatch(captured, /super-secret-invalid-token/u);
    assert.doesNotMatch(captured, /low-scope-token/u);
    assert.doesNotMatch(captured, /Authorization/u);
    assert.doesNotMatch(captured, /authorization/u);
    assert.doesNotMatch(captured, new RegExp(OWNER_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testCleanedSessionReturns404(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "devspace-server-session-test-"));
  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: tempDir,
    DEVSPACE_ALLOWED_ROOTS: process.cwd(),
    DEVSPACE_OAUTH_OWNER_TOKEN: OWNER_TOKEN,
    DEVSPACE_PUBLIC_BASE_URL: "https://devspace.example.com",
    DEVSPACE_MCP_SESSION_IDLE_TTL_SECONDS: "1",
    DEVSPACE_MCP_SESSION_CLEANUP_INTERVAL_SECONDS: "1",
    DEVSPACE_LOG_LEVEL: "warn",
  });
  const resource = resourceUrlFromServerUrl(new URL(config.mcpPath, config.publicBaseUrl));
  SingleUserOAuthProvider.prototype.verifyAccessToken = async function verifyAccessToken(token: string) {
    if (token !== "good-token") {
      throw new InvalidTokenError("Invalid or expired access token");
    }
    return {
      token,
      clientId: "test-client",
      scopes: ["devspace"],
      expiresAt: Math.floor(Date.now() / 1_000) + 60,
      resource,
    };
  };

  const running = createServer(config);
  const server = await listen(running.app);
  const baseUrl = baseUrlFor(server);

  try {
    const initializeResponse = await fetch(`${baseUrl}${config.mcpPath}`, {
      method: "POST",
      headers: {
        accept: mcpAcceptHeader,
        authorization: "Bearer good-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(initializeBody),
    });
    assert.equal(initializeResponse.status, 200);

    const sessionId = initializeResponse.headers.get("mcp-session-id");
    assert.ok(sessionId);

    await delay(2_500);
    const cleanedResponse = await fetch(`${baseUrl}${config.mcpPath}`, {
      method: "POST",
      headers: {
        accept: mcpAcceptHeader,
        authorization: "Bearer good-token",
        "content-type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "ping",
      }),
    });

    assert.equal(cleanedResponse.status, 404, "session should have been evicted by idle TTL cleanup");
    const payload = await cleanedResponse.json() as {
      error?: { message?: string };
    };
    assert.equal(payload.error?.message, "Unknown MCP session");
  } finally {
    await closeHttpServer(server);
    await running.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function listen(app: ReturnType<typeof createServer>["app"]): Promise<HttpServer> {
  return await new Promise<HttpServer>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

function baseUrlFor(server: HttpServer): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function captureConsole(run: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const sink = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  console.log = sink;
  console.warn = sink;
  console.error = sink;
  try {
    await run();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  return lines.join("\n");
}

function parseJsonLogLines(output: string): Array<Record<string, string>> {
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>);
}
