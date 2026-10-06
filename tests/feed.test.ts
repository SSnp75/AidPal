import { describe, it, expect } from "vitest";
import { rankByEngagement } from "@/lib/feed";
import type { SamplePost } from "@/lib/sampleFeed";

function makePost(
  id: string,
  reactions: { like: number; love: number; dislike: number },
  comments: number
): SamplePost {
  return {
    id,
    authorName: "Test",
    handle: "test",
    timeAgo: "1h",
    body: "",
    hashtags: [],
    likes: reactions.like,
    comments,
    reposts: 0,
    isReal: true,
    groupId: "g1",
    reactions,
    myReaction: null,
    bookmarked: false,
  };
}

describe("rankByEngagement", () => {
  it("orders by like + love + comments descending", () => {
    const low = makePost("low", { like: 1, love: 0, dislike: 0 }, 0); // score 1
    const high = makePost("high", { like: 2, love: 3, dislike: 0 }, 4); // score 9
    const mid = makePost("mid", { like: 1, love: 1, dislike: 0 }, 1); // score 3

    const ranked = rankByEngagement([low, high, mid]);
    expect(ranked.map((p) => p.id)).toEqual(["high", "mid", "low"]);
  });

  it("ignores dislikes (two posts differing only in dislike rank equal/stable)", () => {
    const a = makePost("a", { like: 2, love: 0, dislike: 0 }, 1); // score 3
    const b = makePost("b", { like: 2, love: 0, dislike: 99 }, 1); // score 3 (dislikes ignored)

    const ranked = rankByEngagement([a, b]);
    // Equal scores → stable order preserved.
    expect(ranked.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const posts = [
      makePost("x", { like: 0, love: 0, dislike: 0 }, 0),
      makePost("y", { like: 5, love: 0, dislike: 0 }, 0),
    ];
    const original = posts.map((p) => p.id);
    rankByEngagement(posts);
    expect(posts.map((p) => p.id)).toEqual(original);
  });
});
