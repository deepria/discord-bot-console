import { describe, expect, it } from "vitest";
import {
  deriveSituation,
  type SituationInput,
} from "../../src/domain/situation";

const healthy: SituationInput = {
  hasStatus: true,
  statusError: false,
  stale: false,
  online: true,
  eventsError: false,
  deploymentFailed: false,
  deploymentVerificationIncomplete: false,
  deploymentsError: false,
  latencyMs: 42,
  latencyWarningMs: 500,
};

describe("deriveSituation", () => {
  it("keeps a healthy system quiet", () => {
    const situation = deriveSituation(healthy);
    expect(situation).toMatchObject({
      level: "healthy",
      scene: "healthy",
    });
    expect(situation.recommendedMonitor).toBeUndefined();
  });

  it("prioritizes an unavailable agent over all other signals", () => {
    expect(
      deriveSituation({
        ...healthy,
        hasStatus: false,
        statusError: true,
        online: false,
        deploymentFailed: true,
      }),
    ).toMatchObject({
      level: "unavailable",
      recommendedMonitor: "link",
    });
  });

  it("prioritizes an offline bot over stale telemetry", () => {
    expect(
      deriveSituation({ ...healthy, online: false, stale: true }),
    ).toMatchObject({
      level: "action-required",
      title: "BOT SERVICE OFFLINE",
      recommendedMonitor: "system",
    });
  });

  it("keeps elevated latency advisory without escalating the scene", () => {
    expect(deriveSituation({ ...healthy, latencyMs: 850 })).toMatchObject({
      level: "advisory",
      scene: "healthy",
      recommendedMonitor: "runtime",
    });
  });

  it("treats missing or stale deployment verification as advisory", () => {
    expect(
      deriveSituation({ ...healthy, deploymentVerificationIncomplete: true }),
    ).toMatchObject({
      level: "advisory",
      title: "DEPLOYMENT VERIFICATION INCOMPLETE",
      recommendedMonitor: "deploy",
    });
  });
});
