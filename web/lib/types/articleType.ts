import { User } from './userType'

export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

export type ArticleType = {
  tagList: string[];
  createdAt: number;
  author: User;
  title: string;
  body: string;
  slug: string;
  topicId: string;
  updatedAt: number;
  score: number;
  liked: boolean;
  render: string;
};
