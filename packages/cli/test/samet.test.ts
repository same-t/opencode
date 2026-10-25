import { expect, test } from "bun:test"
import { splitMessage } from "../src/samet/telegram"

test("splitMessage leaves short text intact", () => {
  expect(splitMessage("merhaba")).toEqual(["merhaba"])
})

test("splitMessage preserves every character across chunks", () => {
  const text = Array.from({ length: 200 }, (_, index) => `satır ${index} ${"x".repeat(40)}`).join("\n")
  const chunks = splitMessage(text, 500)
  expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true)
  expect(chunks.join("")).toBe(text)
})

test("splitMessage prefers a newline near the limit", () => {
  const chunks = splitMessage(`${"a".repeat(80)}\n${"b".repeat(80)}`, 100)
  expect(chunks).toEqual([`${"a".repeat(80)}\n`, "b".repeat(80)])
})
