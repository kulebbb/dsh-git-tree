import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isDevSpec } from "../lib/update.js";

test("compareVersions: numeric ordering", () => {
  assert.equal(compareVersions("0.3.1", "0.4.0"), -1);
  assert.equal(compareVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareVersions("0.3.1", "0.3.1"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("2.0.0", "10.0.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("compareVersions: prerelease sorts below its release", () => {
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
  assert.equal(compareVersions("1.0.0-beta.10", "1.0.0-beta.9"), -1);
});

test("compareVersions: empty and junk inputs degrade to 0", () => {
  assert.equal(compareVersions("", "0.0.1"), -1);
  assert.equal(compareVersions("abc", "0.0.0"), 0);
});

test("isDevSpec: link:/file: specs are dev installs", () => {
  assert.equal(isDevSpec("link:/Users/x/checkout"), true);
  assert.equal(isDevSpec("file:../plugin"), true);
  assert.equal(isDevSpec("file:./plugin"), true);
});

test("isDevSpec: registry/github/plain specs are not dev installs", () => {
  assert.equal(isDevSpec("^0.3.1"), false);
  assert.equal(isDevSpec("0.3.1"), false);
  assert.equal(isDevSpec("github:kulebbb/dsh-git-tree"), false);
  assert.equal(isDevSpec(undefined), false);
  assert.equal(isDevSpec(null), false);
});
