import { ArticleType } from 'front/types/articleType'
import { CommentType } from 'front/types/commentType'
import { UserType } from 'front/types/userType'

export interface ArticlePageProps {
  article: ArticleType;
  comments?: CommentType[];
  loggedInUser?: UserType;
  loggedInUserVersionSlug?: string;
  topicArticleCount: number;
}
