import { parse } from "../src";
import { describe, expect, it } from "vitest";
import { tests } from 'commonmark-spec'

const sections = new Map<string, Array<typeof tests[number]>>();
for (const test of tests) {
  console.log(test);
  if (sections.has(test.section)) {
    sections.get(test.section)!.push(test);
  } else {
    sections.set(test.section, [test]);
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
