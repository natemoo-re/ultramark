import { parse } from "../src";
import { describe, expect, it, test } from "vitest";
import testcases from './commonmark-0.30.json';

const sections = new Map<string, Array<typeof testcases[number]>>();
for (const testcase of testcases) {
  if (sections.has(testcase.section)) {
    sections.get(testcase.section)!.push(testcase);
  } else {
    sections.set(testcase.section, [testcase]);
  }
}

for (const [section, cases] of sections.entries()) {
  describe(section, () => {
    for (const { example, markdown, html } of cases) {
      it(`${example}`, async () => {
        expect(await toHTML(markdown)).toEqual(html);
      })
    }
  })
}


async function toHTML(markdown: string) {
  return parse(markdown)
}
