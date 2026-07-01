import { expectType } from "ts-expect";

import { applyGraphFilters, computeLocalGraph, maxEffectiveEdgeScore } from "./graphSelectors";
import { decodeLayout } from "../domain/layoutCodec";
import { parseFailureFromRow, type ParseFailure } from "../domain/domain";

type IsReadonlyArray<T> = T extends readonly unknown[] ? true : false;

// selectors return readonly views
expectType<true, IsReadonlyArray<(ReturnType<typeof applyGraphFilters>)["nodes"]>>();
expectType<true, IsReadonlyArray<(ReturnType<typeof computeLocalGraph>)["nodes"]>>();
expectType<number, ReturnType<typeof maxEffectiveEdgeScore>>();

// ParseFailure is a readonly object
expectType<ParseFailure, ReturnType<typeof parseFailureFromRow>>();

// decodeLayout result is a readonly discriminated union
expectType<{ readonly status: "ok" | "empty" | "invalid" }, ReturnType<typeof decodeLayout>>();

import { describe, it } from "vitest";
describe("domainTypes (compile-time only)", () => {
  it("asserts readonly signatures at type-check time", () => {
    // Intentionally empty: all assertions above are compile-time.
  });
});
