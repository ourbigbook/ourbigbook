export type UserType = {
  username: string;
  displayName: string;
  bio: string;
  id: number;
  image: string;
  effectiveImage: string;
  following: boolean;
  score: number;
  followerCount: number;
  createdAt: number;
  email?: string;
  ip?: string;
};
