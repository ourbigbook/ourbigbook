import { UserType } from 'front/types/UserType'

export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

export type ArticleType = {
  body: string;
  createdAt: number;
  file: {
    author: UserType,
    title: string,
    body: string,
  };
  id: number;
  liked: boolean;
  render: string;
  score: number;
  slug: string;
  tagList: string[];
  title: string;
  topicId: string;
  updatedAt: number;
};
