import { describe, it, expect } from "vitest";

import { generateReadableFallback, readableEdgeLabel } from "./edgeLabels";

describe("generateReadableFallback", () => {
  it("replaces snake_case underscores with spaces and title-cases words", () => {
    expect(generateReadableFallback("model_reuse")).toBe("Model reuse");
  });

  it("handles mixed separators", () => {
    expect(generateReadableFallback("extension_or-method")).toBe("Extension or method");
  });

  it("returns empty for empty input", () => {
    expect(generateReadableFallback("")).toBe("");
  });

  it("handles single-word keys", () => {
    expect(generateReadableFallback("view")).toBe("View");
  });
});

describe("readableEdgeLabel", () => {
  it("returns configured label when present", () => {
    expect(readableEdgeLabel("model_reuse", "Custom label")).toBe("Custom label");
  });

  it("falls back to generated label when configured label missing", () => {
    expect(readableEdgeLabel("model_reuse", null)).toBe("Model reuse");
    expect(readableEdgeLabel("model_reuse", undefined)).toBe("Model reuse");
  });

  it("falls back when configured label is empty string", () => {
    expect(readableEdgeLabel("model_reuse", "")).toBe("Model reuse");
  });
});
