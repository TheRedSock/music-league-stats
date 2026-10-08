import { describe, expect, it } from "vitest";
import { detailPage } from "@/lib/detail-pagination";

describe("detail pagination", () => {
  const rows = Array.from({ length: 61 }, (_, id) => ({ title: id % 2 ? "Björk" : "Other", id }));
  it("clamps invalid and out-of-range pages and keeps search before pagination", () => {
    expect(detailPage(rows,"",NaN)).toMatchObject({ page:1,pageCount:3,total:61 });
    expect(detailPage(rows,"",999).rows).toHaveLength(11);
    expect(detailPage(rows,"BJÖRK",2)).toMatchObject({ page:2,pageCount:2,total:30 });
    expect(detailPage(rows,"BJÖRK",2).rows).toHaveLength(5);
    expect(detailPage(rows,"no match",999)).toEqual({ rows:[],page:1,pageCount:1,total:0 });
  });
});
