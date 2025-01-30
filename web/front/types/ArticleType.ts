import { UserType } from 'front/types/UserType'

export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

/** Just enough to be able to link to the article title. */
export type ArticleLinkType = {
  slug: string;
  titleRender: string;
}

/** Add some stuff to link that we need on ancestors listings:
 *  * hasScope: to decide if something need to be shown due to scope on <h1>/<title>
 *  * titleSource: to show it on <title> if needed
 */
export type ArticleAncestorType = ArticleLinkType & {
  hasScope: boolean;
  titleSource: string;
}

export type ArticleType = {
  announcedAt?: number,
  author: UserType,
  body: string;
  createdAt: string;
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
  likedByDate?: string;
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
  updatedAt: string;
};
