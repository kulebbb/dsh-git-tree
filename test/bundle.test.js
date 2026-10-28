import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

// Packaging contract: DSH's plugin manager only installs a profile layer when
// the package declares dsh.bundle, and the profile loader skips bundles whose
// patch file is missing. These checks are deliberately structural (no YAML
// parser) — they guard the four resources the installed package must ship.
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("manifest: declares a bundle patch pointing at a shipped file", () => {
  assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh?.client?.platform, "web");
  assert.equal(manifest.icon, "./icon.svg");
  assert.equal(statSync(new URL("../cordis.patch.yml", import.meta.url)).isFile(), true);
});

test("patch: inserts this package as a loader row", () => {
  const patch = read("cordis.patch.yml");
  // Exactly one insert block, with the row nested under it at the shipped indentation.
  assert.equal((patch.match(/^- insert:[ \t]*$/gm) ?? []).length, 1, "exactly one top-level insert block");
  assert.match(patch, /^ {4}- id: git-tree$/m, "row id at insert-item indentation");
  const name = manifest.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(patch, new RegExp(`^ {6}name: (['"])${name}\\1$`, "m"), "row name at property indentation");
});

test("manifest: ships every installed resource", () => {
  const files = manifest.files ?? [];
  for (const entry of ["lib", "cordis.patch.yml", "icon.svg", "locale/*.json"]) assert.ok(files.includes(entry), `files is missing ${entry}`);
  const exports = manifest.exports ?? {};
  for (const key of [".", "./client", "./locale/*.json", "./icon"]) assert.ok(key in exports, `exports is missing ${key}`);
  // The client bundle is the browser half; a manifest that exports it must ship it.
  assert.equal(statSync(new URL("../lib/client.js", import.meta.url)).isFile(), true);
});

test("locale: display metadata for the plugin page", () => {
  for (const lang of ["en", "zh"]) {
    const dict = JSON.parse(read(`locale/${lang}.json`));
    assert.equal(typeof dict.meta?.title, "string", `${lang} meta.title`);
    assert.ok(dict.meta.title.length > 0, `${lang} meta.title is empty`);
    assert.equal(typeof dict.meta?.description, "string", `${lang} meta.description`);
    assert.ok(dict.meta.description.length > 0, `${lang} meta.description is empty`);
  }
});

test("icon: a small in-package SVG", () => {
  const file = new URL("../icon.svg", import.meta.url);
  const text = readFileSync(file, "utf8");
  assert.ok(text.startsWith("<svg"), "icon must be an SVG document");
  assert.ok(statSync(file).size < 256 * 1024, "icon must stay under the 256 KiB limit");
});
