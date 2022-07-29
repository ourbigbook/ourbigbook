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
  issueCount?: number;
  titleSourceLine: number;
  liked: boolean;
  render: string;
  score: number;
  slug: string;
  tagList: string[];
  titleRender: string;
  titleSource: string;
  topicId: string;
  topicCount?: number;
  updatedAt: number;
};
