import ArticleActions from './ArticleActions';
import { Link } from 'react-router-dom';
import React from 'react';
import { formatDate } from '../../';

const ArticleMeta = props => {
  const article = props.article;
  return (
    <div className="article-meta">
      <Link to={`/@${article.author.username}`}>
        <img className="user-img" src={article.author.image} alt={article.author.username} />
        {article.author.username}
      </Link>
      <div className="info">
        {formatDate(article.createdAt)}
      </div>
      <ArticleActions canModify={props.canModify} article={article} />
    </div>
  );
};

export default ArticleMeta;
