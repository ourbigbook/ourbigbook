import { UserType } from 'front/types/UserType'

export interface Issues {
  issues: IssueType[];
}

export type IssueType = {
  author: UserType;
  createdAt: number;
  id: string;
  number: number;
  render: string;
  score: number;
  botySource: string;
  titleSource: string;
  updatedAt: number;
};
