import { describe, expect, it } from "vitest";

import { toFileUrl } from "../src/renderer/utils/fileUrl";

describe("toFileUrl", () => {
  it("wraps unix paths in the preview protocol", () => {
    expect(toFileUrl("/tmp/hello world/#1?.png")).toBe(
      "stickersmith-media://preview?path=%2Ftmp%2Fhello%20world%2F%231%3F.png",
    );
  });

  it("wraps windows paths in the preview protocol", () => {
    expect(toFileUrl("C:\\Users\\me\\My File.png")).toBe(
      "stickersmith-media://preview?path=C%3A%5CUsers%5Cme%5CMy%20File.png",
    );
  });
});
