import { ArticleType } from 'front/types/ArticleType'
import { UserType } from 'front/types/UserType'

export interface Issues {
  issues: IssueType[];
}

export type IssueType = {
  article?: ArticleType;
  author: UserType;
  botySource: string;
  commentCount: number;
  createdAt: number;
  followerCount: number;
  id: string;
  number: number;
  render: string;
  score: number;
  titleSource: string;
  updatedAt: number;
};
