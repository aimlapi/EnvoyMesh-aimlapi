/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nTestProvider } from "../../src/context/I18nContext.js";
import { partialNodeService } from "../helpers/node-service-mock.js";

const updateNodeConfig = vi.fn();
const updateHumanProfile = vi.fn();
const getHumanProfile = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () =>
    partialNodeService({
      updateNodeConfig,
      updateHumanProfile,
      getHumanProfile,
      startNode: vi.fn(async () => {}),
      runCapabilityDiscovery: vi.fn(async () => {}),
      runSetupSponsorFriend: vi.fn(async () => ({ ok: true, skipped: true, reason: "test" })),
    }),
  useModelProviderUiScope: () => "cloud-only",
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    isConnected: true,
    nodeConfig: null,
    refreshNodeConfig: vi.fn(async () => {}),
    refreshHumanProfile: vi.fn(async () => {}),
  }),
}));

vi.mock("../../src/lib/geolocation-adapter.js", () => ({
  getCurrentPosition: vi.fn(async () => {
    throw new Error("denied");
  }),
}));

async function renderAtAiStep() {
  const { SetupView } = await import("../../src/components/views/SetupView.js");
  render(
    <I18nTestProvider>
      <SetupView />
    </I18nTestProvider>,
  );
  const [displayName, username] = screen.getAllByRole("textbox");
  fireEvent.change(displayName!, { target: { value: "Ada" } });
  fireEvent.change(username!, { target: { value: "ada_l" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const topic of ["music", "tech", "art"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(topic, "i") }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("radio", { name: /Configure now/ }));
}

describe("SetupView first-run AI provider default", () => {
  beforeEach(() => {
    updateNodeConfig.mockReset().mockResolvedValue(undefined);
    updateHumanProfile.mockReset().mockResolvedValue(undefined);
    getHumanProfile
      .mockReset()
      .mockResolvedValue({ ownerId: "envoy:owner:ada", displayName: "Ada", username: "ada_l" });
  });
  afterEach(() => cleanup());

  it("pre-selects AI/ML API with its endpoint, a catalog model and a key link", async () => {
    await renderAtAiStep();
    expect((screen.getByLabelText("Provider") as HTMLSelectElement).value).toBe("aimlapi");
    expect((document.getElementById("setup-model-endpoint") as HTMLInputElement).value).toBe(
      "https://api.aimlapi.com/v1",
    );
    expect((document.getElementById("setup-model-name") as HTMLSelectElement).value).toBe(
      "openai/gpt-4o-mini",
    );
    const link = screen.getByRole("link", { name: "Get an API key" });
    expect(link.getAttribute("href")).toBe("https://aimlapi.com/app/keys");
  });

  it("saves the AI/ML API preset with the user's key", async () => {
    await renderAtAiStep();
    fireEvent.change(document.getElementById("setup-model-api-key")!, {
      target: { value: "user-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(updateNodeConfig).toHaveBeenCalled());
    expect(updateNodeConfig.mock.calls[0]![0].modelProviders).toEqual({
      presetId: "aimlapi",
      mode: "openai-compatible",
      endpoint: "https://api.aimlapi.com/v1",
      modelName: "openai/gpt-4o-mini",
      apiKey: "user-key",
    });
  });

  it("other presets stay selectable and drop the AI/ML API endpoint", async () => {
    await renderAtAiStep();
    expect(screen.getByRole("link", { name: "Get an API key" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "minimax-cn" } });
    expect((document.getElementById("setup-model-endpoint") as HTMLInputElement).value).toBe(
      "https://api.minimaxi.com/v1",
    );
    expect(screen.queryByRole("link", { name: "Get an API key" })).toBeNull();
  });
});
