import { expect, test } from "bun:test"
import { commitMessageIncludesMarker } from "./task"

test("commitMessageIncludesMarker accepts the normal review marker", () => {
  const commitBody = "feat: complete T001 PRD#F001\n\nCode Review: ✅\n"

  expect(commitMessageIncludesMarker(commitBody, "Code Review: ✅")).toBe(true)
})

test("commitMessageIncludesMarker accepts the Windows mojibake review marker", () => {
  const commitBody = "feat: complete T001 PRD#F001\n\nCode Review: âœ…\n"

  expect(commitMessageIncludesMarker(commitBody, "Code Review: ✅")).toBe(true)
})
