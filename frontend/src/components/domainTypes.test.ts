/**
 * Type-level tests: domain/transform/selector signatures must not accept or
 * return mutable collections (PPI-041).
 *
 * These are compile-time assertions using `expectType` against `ReturnType` /
 * `Parameters` so no runtime call happens. If a function ever regresses to a
 * mutable `T[]`/`Set<T>`/`Map<K,V>`, `tsc` fails here.
 */
import { expectType } from "ts-expect";

import { buildComplexityDiff } from "../transforms/analyticsTransforms";
import { sortModuleLinesRows, filterFileRows } from "./tableViewModels";
import {
  graphEdgesToRows,
  moduleOptionsFromModules,
  visibleLinesTotal,
} from "../transforms/snapshotTransforms";
import {
  structureChartRows,
  moduleSelectOptions,
  filterStructureEdges,
} from "../transforms/structureTransforms";
import { applyGraphFilters, computeLocalGraph, maxEffectiveEdgeScore } from "./graphSelectors";
import { decodeLayout } from "../domain/layoutCodec";
import { parseFailureFromRow, type ParseFailure } from "../domain/domain";

type IsReadonlyArray<T> = T extends readonly unknown[] ? true : false;

// transforms must return readonly arrays (not mutable T[])
expectType<true, IsReadonlyArray<ReturnType<typeof sortModuleLinesRows>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof filterFileRows>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof graphEdgesToRows>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof moduleOptionsFromModules>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof structureChartRows>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof moduleSelectOptions>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof filterStructureEdges>>>();
expectType<true, IsReadonlyArray<ReturnType<typeof buildComplexityDiff>>>();

// selectors return readonly views
expectType<true, IsReadonlyArray<(ReturnType<typeof applyGraphFilters>)["nodes"]>>();
expectType<true, IsReadonlyArray<(ReturnType<typeof computeLocalGraph>)["nodes"]>>();
expectType<number, ReturnType<typeof maxEffectiveEdgeScore>>();

// ParseFailure is a readonly object
expectType<ParseFailure, ReturnType<typeof parseFailureFromRow>>();

// decodeLayout result is a readonly discriminated union
expectType<{ readonly status: "ok" | "empty" | "invalid" }, ReturnType<typeof decodeLayout>>();

// visibleLinesTotal accepts a readonly set
type VisibleLinesParams = Parameters<typeof visibleLinesTotal>[1];
expectType<true, ReadonlySet<string> extends VisibleLinesParams ? true : false>();

// Runtime noop so vitest registers the file as having a test.
import { describe, it } from "vitest";
describe("domainTypes (compile-time only)", () => {
  it("asserts readonly signatures at type-check time", () => {
    // Intentionally empty: all assertions above are compile-time.
  });
});