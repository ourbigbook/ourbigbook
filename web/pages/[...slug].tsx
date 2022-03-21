import Router, { useRouter } from 'next/router'
import React from 'react'
import useSWR, { trigger } from 'swr'

import CustomLink from 'front/CustomLink'
import LoadingSpinner from 'front/LoadingSpinner'
import Maybe from 'front/Maybe'
import UserLinkWithImage from 'front/UserLinkWithImage'
import FollowUserButton from 'front/FollowUserButton'
import { displayAndUsernameText } from 'front/user'
import Article from 'front/Article'
import ArticleInfo from 'front/ArticleInfo'
import { AppContext } from 'front'
import CommentAPI from 'front/api/comment'
import { ArticleType } from 'front/types/articleType'
import { CommentType } from 'front/types/commentType'
import { UserType } from 'front/types/userType'
import fetcher from 'fetcher'
import routes from 'front/routes'

interface ArticlePageProps {
  article: ArticleType;
  comments: CommentType[];
  loggedInuser?: UserType;
  loggedInUserVersionSlug?: string;
  topicArticleCount: number;
}

const ArticlePage = ({
  article,
  comments,
  loggedInUser,
  loggedInUserVersionSlug,
  topicArticleCount,
}: ArticlePageProps) => {
  const router = useRouter();

  // We fetch comments so that the new posted comment will appear immediately after posted.
  // Note that we cannot calculate the exact new comment element because we need the server datetime.
  const { data: commentApi, error: commentError } = useSWR(CommentAPI.url(article?.slug), fetcher(!router.isFallback));
  if (commentApi !== undefined) {
    comments = commentApi.comments
  }

  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() =>
    setTitle(`${article.title} by ${displayAndUsernameText(article?.author)}`)
  )
  const showOthers = topicArticleCount > 1
  const showCreateMyOwn = article.author.username !== loggedInUser.username
  return (
    <>
      <div className="article-page">
        <div className="content-not-cirodown article-meta">
          <div className="article-info">
            { 'Author: ' }
            <UserLinkWithImage user={article.author} />
            {' '}
            <FollowUserButton user={article.author} showUsername={false} />
          </div>
          <div className="article-info article-info-2">
            { showOthers&&
              <CustomLink
                href={routes.topicArticlesTop(article.topicId)}
              >
                <i className="ion-ios-people" /> {topicArticleCount - 1} article{topicArticleCount - 1 > 1 ? 's' : ''} by other authors about "{article.title}"
              </CustomLink>
            }
            {showOthers && showCreateMyOwn && <>{' '}</> }
            {showCreateMyOwn &&
              <>
                {loggedInUserVersionSlug === undefined
                  ? <CustomLink
                      href={routes.articleNewFrom(article.slug)}
                    >
                      <i className="ion-edit" /> Create my own version
                    </CustomLink>
                  : <CustomLink
                      href={routes.articleView(loggedInUserVersionSlug)}
                    >
                      <i className="ion-eye" /> View my version
                    </CustomLink>
                }
              </>
            }
          </div>
          <ArticleInfo {...{article}}/>
        </div>
        <div className="container page">
          <Article {...{article, comments}} />
        </div>
      </div>
    </>
  );
};

export default ArticlePage;

// Server only.

import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
export const getServerSideProps = getServerSidePropsArticleHoc();
