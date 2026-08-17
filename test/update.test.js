import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isDevSpec, findProfileDir, readDependencySpec } from "../lib/update.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("findProfileDir: config dir wins", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const result = findProfileDir("/any/where/lib/index.js", profile, {});
  assert.equal(result.dir, profile);
  assert.equal(result.source, "config");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: walks up the own install path", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  const pkg = join(profile, "node_modules", "@kulebbb", "dsh-git-tree", "lib");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const ownFile = join(pkg, "index.js");
  const result = findProfileDir(ownFile, "", {});
  assert.equal(result.dir, profile);
  assert.equal(result.source, "install-path");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: DSH_HOME fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const result = findProfileDir("/unrelated/lib/index.js", "", { DSH_HOME: root });
  assert.equal(result.dir, profile);
  assert.equal(result.source, "dsh-home");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: nothing found reports reason", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const result = findProfileDir("/unrelated/lib/index.js", "", { DSH_HOME: root });
  assert.equal(result.dir, null);
  assert.match(result.reason, /no <X>\/node_modules/);
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: config dir without package.json is ignored", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const bogus = join(root, "not-a-profile");
  mkdirSync(bogus, { recursive: true });
  const result = findProfileDir("/unrelated/lib/index.js", bogus, { DSH_HOME: root });
  assert.equal(result.dir, null);
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: reads the package spec from profile package.json", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: { "@kulebbb/dsh-git-tree": "link:/tmp/checkout" }
  }));
  assert.equal(readDependencySpec(root), "link:/tmp/checkout");
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: returns null when absent or unreadable", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), "{}");
  assert.equal(readDependencySpec(root), null);
  assert.equal(readDependencySpec(join(root, "missing")), null);
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: corrupted package.json returns null", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), "{ not valid json");
  assert.equal(readDependencySpec(root), null);
  rmSync(root, { recursive: true, force: true });
});
