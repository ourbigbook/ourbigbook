export interface ArticleList {
  articles: ArticleType[];
}

export interface Article {
  article: ArticleType;
}

export type ArticleType = {
  tagList: string[];
  createdAt: number;
  author: Author;
  title: string;
  body: string;
  slug: string;
  topicId: string;
  updatedAt: number;
  favoritesCount: number;
  favorited: boolean;
  render: string;
};

export type Author = {
  username: string;
  bio: string;
  image: string;
  following: boolean;
};
