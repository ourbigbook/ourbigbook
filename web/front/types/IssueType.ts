import { UserType } from 'front/types/UserType'

export interface Issues {
  issues: IssueType[];
}

export type IssueType = {
  createdAt: number;
  number: number;
  id: string;
  source: string;
  render: string;
  author: UserType;
  updatedAt: number;
};
