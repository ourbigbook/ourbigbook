export type UserType = {
  admin?: string;
  bio: string;
  createdAt: string;
  displayName: string;
  effectiveImage: string;
  email?: string;
  followerCount: number;
  following: boolean;
  id: number;
  image: string;
  ip?: string;
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
