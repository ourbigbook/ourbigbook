import { UserType } from './userType'

export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

export type ArticleType = {
  tagList: string[];
  createdAt: number;
  author: UserType;
  title: string;
  body: string;
  slug: string;
  topicId: string;
  updatedAt: number;
  score: number;
  liked: boolean;
  render: string;
};
