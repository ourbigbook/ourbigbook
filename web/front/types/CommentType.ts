import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'

export interface Comments {
  comments: CommentType[];
}

export type CommentType = {
  author?: UserType;
  createdAt: string;
  id: string;
  issue?: IssueType;
  number: number;
  render: string;
  source: string;
  updatedAt: string;
};
