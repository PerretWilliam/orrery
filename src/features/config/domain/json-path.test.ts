import { describe, expect, it } from "vitest";
import { extractPath, parsePath } from "./json-path";

describe("parsePath", () => {
  it.each([
    ["a", ["a"]],
    ["a.b", ["a", "b"]],
    ["a_b.c-d", ["a_b", "c-d"]],
    ["a[0]", ["a", "0"]],
    ["items[12].name", ["items", "12", "name"]],
    ["m[1][2]", ["m", "1", "2"]],
    ["a.0.b", ["a", "0", "b"]],
    ["_x", ["_x"]],
    ["a[999999]", ["a", "999999"]],
  ])("parses %s", (path, segments) => expect(parsePath(path)).toEqual(segments));

  it.each([
    "", "$.a", "a..b", "a.", ".a", "a.*", "a[*]", "a[-1]", "a[]", "a[0", "a0]", "a[0]b", "a[0].", "a[?(@.x)]", "a b", "a;b", "a()",
    "1a", "-a", "[0]", "a[1234567]", "__proto__", "a.__proto__.b", "constructor.prototype", "a[0].constructor", "__proto__[0]", "a.prototype", "a.constructor", "a\nb",
  ])("rejects %j", (path) => expect(parsePath(path)).toBeNull());

  it("accepts 256 characters and rejects 257", () => {
    expect(parsePath("a".repeat(256))).not.toBeNull();
    expect(parsePath("a".repeat(257))).toBeNull();
  });
});

describe("extractPath", () => {
  const data = {
    data: { retention: { d7: 21.5, zero: 0, nothing: null }, list: [{ n: "a" }, { n: "b" }], "0": "zero" },
    matrix: [[1, 2], [3, 4]],
    long: Array.from({ length: 15 }, (_, i) => i * 10),
  };

  it.each([
    ["data.retention.d7", 21.5],
    ["data.retention.zero", 0],
    ["data.retention.nothing", null],
    ["data.list[1].n", "b"],
    ["data.list.0.n", "a"],
    ["matrix[1][0]", 3],
    ["long[12]", 120],
    ["long.14", 140],
    ["data.0", "zero"],
    ["data.list[0].n", "a"],
  ])("reads %s", (path, expected) => expect(extractPath(data, path)).toEqual(expected));

  it.each(["data.missing", "data.list[5]", "data.retention.d7.deep", "data.list.x", "data.list.length", "data.list[0].n.length", "nope", "data.list.-1", "long[15]", "long.length", "long.0x1"])(
    "finds nothing at %s",
    (path) => expect(extractPath(data, path)).toBeUndefined(),
  );

  it("never reaches the prototype chain", () => {
    for (const path of ["toString", "data.toString", "data.hasOwnProperty", "constructor", "data.constructor.name", "__proto__", "data.list.constructor"]) {
      expect(extractPath(data, path), path).toBeUndefined();
    }
    expect(extractPath(JSON.parse('{"__proto__": {"x": 1}}'), "__proto__.x")).toBeUndefined();
  });

  it("returns undefined for invalid paths and non-container data", () => {
    expect(extractPath(data, "a..b")).toBeUndefined();
    expect(extractPath(null, "a")).toBeUndefined();
    expect(extractPath("text", "length")).toBeUndefined();
    expect(extractPath(42, "a")).toBeUndefined();
    expect(extractPath({ a: 1 }, "a[0]")).toBeUndefined();
  });
});
