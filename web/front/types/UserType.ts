export type UserType = {
  admin?: string;
  bio: string;
  commentCount: number;
  createdAt: string;
  displayName: string;
  discussionCount: number;
  effectiveImage: string;
  email?: string;
  followerCount: number;
  following: boolean;
  id: number;
  image: string;
  ip?: string;
  locked: boolean,
  nextAnnounceAllowedAt?: string;
  password?: string;
  score: number;
  scoreDelta?: number;
  username: string;

  // For logged in user only.
  emailNotifications?: boolean;
  emailNotificationsForArticleAnnouncement?: boolean;
  hideArticleDates?: boolean;
  maxArticles?: number;
  maxArticleSize?: number;
  maxIssuesPerHour?: number;
  maxIssuesPerMinute?: number;
  nestedSetNeedsUpdate?: boolean;
  verified?: boolean;
};
