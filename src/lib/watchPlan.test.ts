import test from "node:test";
import assert from "node:assert/strict";
import { planWatchChanges } from "./watchPlan.js";

test("sin cambios devuelve un plan vacío", () => {
  const state = { "assets/theme.css": "hash-a", "sections/hero.liquid": "hash-b" };
  const hashes = { "assets/theme.css": "hash-a", "sections/hero.liquid": "hash-b" };
  assert.deepEqual(planWatchChanges(state, hashes), { changed: [], deleted: [] });
});

test("un archivo modificado entra en changed", () => {
  const state = { "assets/theme.css": "hash-viejo" };
  const hashes = { "assets/theme.css": "hash-nuevo" };
  assert.deepEqual(planWatchChanges(state, hashes), {
    changed: ["assets/theme.css"],
    deleted: [],
  });
});

test("un archivo borrado entra en deleted", () => {
  const state = { "assets/theme.css": "hash-a", "sections/hero.liquid": "hash-b" };
  const hashes = { "assets/theme.css": "hash-a" };
  assert.deepEqual(planWatchChanges(state, hashes), {
    changed: [],
    deleted: ["sections/hero.liquid"],
  });
});

test("un archivo nuevo entra en changed", () => {
  const state = { "assets/theme.css": "hash-a" };
  const hashes = { "assets/theme.css": "hash-a", "snippets/nuevo.liquid": "hash-c" };
  assert.deepEqual(planWatchChanges(state, hashes), {
    changed: ["snippets/nuevo.liquid"],
    deleted: [],
  });
});

test("--only assets/ ignora los cambios de sections/", () => {
  const state = {
    "assets/theme.css": "hash-viejo",
    "sections/hero.liquid": "hash-viejo",
    "sections/vieja.liquid": "hash-borrado",
  };
  const hashes = {
    "assets/theme.css": "hash-nuevo",
    "sections/hero.liquid": "hash-nuevo",
  };
  assert.deepEqual(planWatchChanges(state, hashes, ["assets/"]), {
    changed: ["assets/theme.css"],
    deleted: [],
  });
});

test("--only también limita las bajas", () => {
  const state = {
    "assets/viejo.css": "hash-a",
    "sections/vieja.liquid": "hash-b",
  };
  const hashes = {};
  assert.deepEqual(planWatchChanges(state, hashes, ["assets/"]), {
    changed: [],
    deleted: ["assets/viejo.css"],
  });
});
