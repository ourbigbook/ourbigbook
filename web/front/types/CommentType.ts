import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'

export interface Comments {
  comments: CommentType[];
}

export type CommentType = {
  issue?: IssueType;
  createdAt: number;
  number: number;
  id: string;
  source: string;
  render: string;
  author?: UserType;
  updatedAt: number;
};
