import Router, { useRouter } from 'next/router'
import React from 'react'
import useSWR, { trigger } from 'swr'

import CustomLink from 'front/CustomLink'
import LoadingSpinner from 'front/LoadingSpinner'
import Maybe from 'front/Maybe'
import UserLinkWithImage from 'front/UserLinkWithImage'
import FollowUserButton, { FollowUserButtonContext } from 'front/FollowUserButton'
import { displayAndUsernameText } from 'front/user'
import Article from 'front/Article'
import ArticleInfo from 'front/ArticleInfo'
import { AppContext } from 'front'
import ArticleAPI from 'front/api/article'
import CommentAPI from 'front/api/comment'
import { ArticleType } from 'front/types/articleType'
import { CommentType } from 'front/types/commentType'
import fetcher from 'fetcher'
import routes from 'routes'

interface ArticlePageProps {
  article: ArticleType;
  comments: CommentType[];
  topicArticleCount: number;
}

const ArticlePage = ({
  article,
  comments,
  topicArticleCount,
}: ArticlePageProps) => {
  const router = useRouter();

  // Fetch user-specific data.
  // Article determines if the current user liked the article or not
  const { data: articleApi, error } = useSWR(ArticleAPI.url(article?.slug), fetcher(!router.isFallback));
  if (articleApi !== undefined) {
    article = articleApi.article
  }
  // We fetch comments so that the new posted comment will appear immediately after posted.
  // Note that we cannot calculate the exact new comment element because we need the server datetime.
  const { data: commentApi, error: commentError } = useSWR(CommentAPI.url(article?.slug), fetcher(!router.isFallback));
  if (commentApi !== undefined) {
    comments = commentApi.comments
  }

  // TODO it is not ideal to have to setup state on every parent of LikeUserButton/FollowUserButton,
  // but I just don't know how to avoid it nicely, especially considering that the
  // button shows up on both profile and article pages, and thus comes from different
  // API data, so useSWR is not a clean.
  const [following, setFollowing] = React.useState(false)
  const [followerCount, setFollowerCount] = React.useState(article?.author.followerCount)
  React.useEffect(() => {
    setFollowing(article?.author.following)
    setFollowerCount(article?.author.followerCount)
  }, [
    article?.author.following,
    article?.author.followerCount,
  ])

  if (router.isFallback) { return <LoadingSpinner />; }
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() =>
    setTitle(`${article.title} by ${displayAndUsernameText(article?.author)}`)
  )
  return (
    <>
      <div className="article-page">
        <div className="content-not-cirodown article-meta">
          <div className="article-info">
            { 'Author: ' }
            <UserLinkWithImage user={article.author} />
            {' '}
            <FollowUserButtonContext.Provider value={{
              following, setFollowing, followerCount, setFollowerCount
            }}>
              <FollowUserButton user={article.author} showUsername={false} />
            </FollowUserButtonContext.Provider>
          </div>
          <div className="article-info article-info-2">
            {topicArticleCount > 1 &&
              <CustomLink
                href={routes.topicArticlesTop(article.topicId)}
              >
                <i className="ion-ios-people" /> Top articles by other authors about the same topic ({topicArticleCount})
              </CustomLink>
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

import { getStaticPathsArticle, getStaticPropsArticle } from 'back/ArticlePage'
export const getStaticPaths = getStaticPathsArticle;
export const getStaticProps = getStaticPropsArticle(true, true);
