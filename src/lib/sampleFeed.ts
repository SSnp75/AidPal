/**
 * Static placeholder content for the presentational home dashboard.
 * No backend data — these drive the sample feed, trending, and suggestions.
 */

export interface SamplePost {
  id: string;
  authorName: string;
  handle: string;
  timeAgo: string;
  body: string;
  hashtags: string[];
  likes: number;
  comments: number;
  reposts: number;
}

export interface TrendingItem {
  tag: string;
  postCount: number;
}

export interface SuggestedPerson {
  name: string;
  handle: string;
}

export const samplePosts: SamplePost[] = [
  {
    id: "1",
    authorName: "Maya Rivers",
    handle: "mayarivers",
    timeAgo: "2h",
    body: "Our weekend food drive wrapped up with 1,200 meals packed. Huge thanks to everyone who showed up. This is what community looks like.",
    hashtags: ["#FoodDrive", "#CommunityFirst"],
    likes: 248,
    comments: 36,
    reposts: 42,
  },
  {
    id: "2",
    authorName: "Deon Clarke",
    handle: "deonc",
    timeAgo: "5h",
    body: "Looking for volunteers to help refurbish the youth center this Saturday. Bring a friend, bring a paintbrush. Lunch is on us!",
    hashtags: ["#Volunteer", "#YouthCenter"],
    likes: 97,
    comments: 54,
    reposts: 18,
  },
  {
    id: "3",
    authorName: "Priya Nair",
    handle: "priya",
    timeAgo: "1d",
    body: "Started a small neighborhood tool-share group so folks can borrow instead of buy. Already 30 members. Reach out if you want to start one too.",
    hashtags: ["#MutualAid", "#ShareMore"],
    likes: 512,
    comments: 88,
    reposts: 134,
  },
];

export const sampleTrending: TrendingItem[] = [
  { tag: "#CommunityFirst", postCount: 4820 },
  { tag: "#Volunteer", postCount: 3140 },
  { tag: "#MutualAid", postCount: 2675 },
  { tag: "#FoodDrive", postCount: 1902 },
  { tag: "#LocalHeroes", postCount: 1288 },
];

export const sampleSuggestions: SuggestedPerson[] = [
  { name: "Grace Owens", handle: "graceo" },
  { name: "Liam Fontaine", handle: "liamf" },
  { name: "Aisha Bello", handle: "aishab" },
];
