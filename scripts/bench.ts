// @ts-ignore
import benchmark from "benchmark";
import { readFileSync } from "node:fs";
import { parse as wasm } from "markdown-wasm";
import { parse } from "../src";
import { Parser, HtmlRenderer } from "commonmark";
const reader = new Parser();
const writer = new HtmlRenderer();

// @ts-ignore
const suite = new benchmark.Suite();

const file = process.argv.slice(2)[0];

const contents = readFileSync(`fixtures/${file}.md`, { encoding: "utf-8" });

suite
  .add("ultramark", () => {
    parse(contents, {});
  })
  .add("wasm", () => {
    wasm(contents, {});
  })
  .add("commonmark.js", () => {
    writer.render(reader.parse(contents))
  })
  .on("cycle", (event) => {
    console.log(String(event.target));
  });
suite.run();
