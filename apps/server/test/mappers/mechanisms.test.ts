import { describe, expect, it } from "vitest";
import type { MechanismRow } from "../../src/db/schema.js";
import { mechanismToRow, rowToMechanism } from "../../src/mappers/mechanisms.js";
import { makeMechanism } from "../fixtures.js";

describe("mechanism mappers", () => {
  it("mechanismToRow carries every product field and no serial id", () => {
    const m = makeMechanism();
    const row = mechanismToRow(m);
    expect(row).toEqual(m);
    expect(row).not.toHaveProperty("id");
  });

  it("rowToMechanism maps a full row, including the id, and drops unknown columns", () => {
    const row: MechanismRow & { extra: string } = { ...makeMechanism(), id: 7, extra: "x" };
    const back = rowToMechanism(row);
    expect(back).toEqual({ ...makeMechanism(), id: 7 });
    expect(back).not.toHaveProperty("extra");
  });
});
