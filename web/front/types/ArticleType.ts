import { UserType } from 'front/types/UserType'

export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

export type ArticleType = {
  author: UserType,
  body: string;
  createdAt: number;
  file: {
    titleSource: string,
    bodySource: string,
  };
  id: number;
  liked: boolean;
  render: string;
  score: number;
  slug: string;
  tagList: string[];
  titleRender: string;
  topicId: string;
  updatedAt: number;
};
