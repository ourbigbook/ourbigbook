import { ArticleType } from 'front/types/ArticleType'
import { UserType } from 'front/types/UserType'

export interface Issues {
  issues: IssueType[];
}

export type IssueType = {
  article?: ArticleType;
  author: UserType;
  bodySource: string;
  commentCount: number;
  createdAt: string;
  followerCount: number;
  id: string;
  number: number;
  render: string;
  score: number;
  titleRender: string;
  titleSource: string;
  updatedAt: string;
};
