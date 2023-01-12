import { readFileSync } from "node:fs";
import { parse } from "../src";

const file = process.argv.slice(2)[0];

const contents = readFileSync(`fixtures/${file}.md`, { encoding: "utf-8" });
parse(contents, {});
