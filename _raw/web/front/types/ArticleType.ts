import { UserType } from 'front/types/UserType'

export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

export type ArticleLinkType = {
  slug: string;
  titleRender: string;
}

export type ArticleType = {
  author: UserType,
  body: string;
  createdAt: number;
  depth: number;
  file: {
    titleSource: string,
    bodySource: string,
  };
  h1Render: string;
  h2Render: string;
  id: number;
  issueCount?: number;
  liked: boolean;
  likedBy?: UserType;
  likedByDate?: number;
  list?: boolean;
  followed?: boolean;
  followerCount?: number;
  render: string;
  score: number;
  slug: string;
  tagList: string[];
  taggedArticles?: ArticleLinkType[];
  titleRender: string;
  titleSource: string;
  titleSourceLine: number;
  topicCount?: number;
  topicId: string;
  updatedAt: number;
};
