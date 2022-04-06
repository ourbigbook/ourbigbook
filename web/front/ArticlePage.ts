import { ArticleType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { UserType } from 'front/types/UserType'

export interface ArticlePageProps {
  article: ArticleType;
  comments?: CommentType[];
  loggedInUser?: UserType;
  loggedInUserVersionSlug?: string;
  topicArticleCount: number;
}
