import { describe, expect, it } from "vitest";

import { parseAmount } from "./amount.ts";
import { InvalidAmountError } from "./errors.ts";

describe("parseAmount", () => {
  it("parses a bare number as a one-time amount", () => {
    expect(parseAmount("100")).toEqual({ value: 100, interval: "once" });
  });

  it("parses monthly and yearly suffixes", () => {
    expect(parseAmount("10/m")).toEqual({ value: 10, interval: "month" });
    expect(parseAmount("25/y")).toEqual({ value: 25, interval: "year" });
  });

  it("accepts long recurrence aliases", () => {
    expect(parseAmount("10/monthly")).toEqual({ value: 10, interval: "month" });
    expect(parseAmount("5/yr")).toEqual({ value: 5, interval: "year" });
  });

  it("parses decimal amounts", () => {
    expect(parseAmount("4.5/m")).toEqual({ value: 4.5, interval: "month" });
  });

  it("tolerates a leading $ that slipped through quoting", () => {
    expect(parseAmount("$20/y")).toEqual({ value: 20, interval: "year" });
  });

  it("returns an InvalidAmountError for non-numeric input", () => {
    const result = parseAmount("abc");
    expect(result).toBeInstanceOf(InvalidAmountError);
  });

  it("rejects zero and negative amounts", () => {
    expect(parseAmount("0")).toBeInstanceOf(InvalidAmountError);
    expect(parseAmount("-5")).toBeInstanceOf(InvalidAmountError);
  });

  it("rejects an unknown recurrence suffix", () => {
    const result = parseAmount("10/decade");
    expect(result).toBeInstanceOf(InvalidAmountError);
    if (result instanceof InvalidAmountError) {
      expect(result.message).toContain("decade");
    }
  });

  it("rejects an empty token", () => {
    expect(parseAmount("")).toBeInstanceOf(InvalidAmountError);
  });
});
