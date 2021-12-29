import Head from 'next/head'
import React from 'react'
import useSWR  from 'swr'
import { useRouter } from 'next/router'

import ArticleList from 'components/ArticleList'
import CustomLink from 'components/CustomLink'
import LoadingSpinner from 'components/LoadingSpinner'
import LogoutButton from 'components/LogoutButton'
import Maybe from 'components/Maybe'
import routes from 'routes'
import useMin from 'front/api/useMin'
import { AppContext, slugFromArray} from 'lib'

export const TopicPage = ({articles, articlesCount, what}) => {
  const router = useRouter();
  const topicId = slugFromArray(router.query.id)
  useMin(
    { articleIds: articles.map(article => article.id) },
    { articles }
  )
  let paginationUrlFunc
  switch (what) {
    case 'top':
    case 'top-followed':
      paginationUrlFunc = (page) => routes.topicArticlesTop(topicId, page)
      break
    case 'latest':
    case 'latest-followed':
      paginationUrlFunc = (page) => routes.topicArticlesLatest(topicId, page)
      break
  }
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() => { setTitle(topicId) }, [topicId])
  if (router.isFallback) { return <LoadingSpinner />; }
  return (
    <div className="topic-page content-not-cirodown">
      <div className="tab-list">
        <CustomLink
          className={`tab-item${what === 'top' ? ' active' : ''}`}
          href={routes.topicArticlesTop(topicId)}
        >
          Top articles
        </CustomLink>
        <CustomLink
          className={`tab-item${what === 'latest' ? ' active' : ''}`}
          href={routes.topicArticlesLatest(topicId)}
        >
          Latest articles
        </CustomLink>
        {false && <>
          { /* Maybe one day, but initially, best article == best user. */ }
          <CustomLink
            href={routes.topicUsersView(topicId)}
            className={`tab-item${what === 'users' ? ' active' : ''}`}
          >
            Top Authors (TODO implement)
          </CustomLink>
        </>}
      </div>
      <ArticleList {...{
        articles,
        articlesCount,
        paginationUrlFunc,
        showAuthor: true,
        what,
      }}/>
    </div>
  );
};

export default TopicPage
