import { describe, it, expect } from "vitest";
import { safeNext } from "../../src/utils/safeNext";

describe("safeNext", () => {
  it("retourne / si vide", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("accepte les chemins relatifs simples", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/foo/bar")).toBe("/foo/bar");
  });

  it("rejette URLs absolues", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://example.com")).toBe("/");
  });

  it("rejette //host", () => {
    expect(safeNext("//evil.com")).toBe("/");
  });

  it("rejette CRLF", () => {
    expect(safeNext("/foo\r\n")).toBe("/");
  });

  it("normalise les backslashes", () => {
    expect(safeNext("\\/account")).toBe("/");
    expect(safeNext("/some\\path")).toBe("/some/path");
  });
});
