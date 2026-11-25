import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getModelProviderPreset } from "@envoymesh/api";
import { buildModelProviders } from "../src/index.js";

function aimlapiConfig(endpoint?: string) {
  const preset = getModelProviderPreset("aimlapi")!;
  return {
    mode: preset.mode,
    presetId: preset.id,
    endpoint: endpoint ?? preset.defaultEndpoint,
    modelName: preset.models[0],
    apiKey: "test-aimlapi-key",
  };
}

function okCompletion(): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "pong" } }], usage: {} }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const servers: Server[] = [];
async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe("AI/ML API preset through buildModelProviders", () => {
  it("sends the bearer key to https://api.aimlapi.com/v1/chat/completions", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url.toString(), headers: (init?.headers ?? {}) as Record<string, string> });
      return okCompletion();
    });
    const [provider] = buildModelProviders(aimlapiConfig(), true);
    const res = await provider!.complete({ taskType: "chat", prompt: "ping", sensitivity: "public" });
    expect(res.text).toBe("pong");
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).host).toBe("api.aimlapi.com");
    expect(calls[0]!.url).toBe("https://api.aimlapi.com/v1/chat/completions");
    expect(calls[0]!.headers.authorization).toBe("Bearer test-aimlapi-key");
  });

  it("does not forward the key to another host on a cross-origin redirect (different port = different origin)", async () => {
    let foreignAuth: IncomingHttpHeaders["authorization"] | "unset" = "unset";
    const foreign = await listen((req, res) => {
      foreignAuth = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "pong" } }] }));
    });
    let originAuth: string | undefined;
    const origin = await listen((req, res) => {
      originAuth = req.headers.authorization;
      res.writeHead(307, { location: `${foreign}/v1/chat/completions` });
      res.end();
    });

    const [provider] = buildModelProviders(aimlapiConfig(`${origin}/v1`), true);
    await provider!.complete({ taskType: "chat", prompt: "ping", sensitivity: "public" });
    expect(originAuth).toBe("Bearer test-aimlapi-key");
    expect(foreignAuth).toBeUndefined();
  });
});
