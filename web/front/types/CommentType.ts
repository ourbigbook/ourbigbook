import { UserType } from 'front/types/UserType'

export interface Comments {
  comments: CommentType[];
}

export type CommentType = {
  createdAt: number;
  id: string;
  body: string;
  slug: string;
  author: UserType;
  updatedAt: number;
};
