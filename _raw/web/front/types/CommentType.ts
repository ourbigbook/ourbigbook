import { UserType } from 'front/types/UserType'

export interface Comments {
  comments: CommentType[];
}

export type CommentType = {
  createdAt: number;
  number: number;
  id: string;
  source: string;
  render: string;
  author: UserType;
  updatedAt: number;
};
