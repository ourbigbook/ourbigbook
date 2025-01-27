import React from 'react'

import CustomLink from 'front/CustomLink'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { displayAndUsernameText } from 'front/user'
import Article from 'front/Article'
import ArticleList from 'front/ArticleList'
import {
  CreateMyOwnVersionOfThisTopic,
  DiscussionAbout,
  DiscussionIcon,
  MyHead,
  NewArticleIcon,
  SeeIcon,
  SeeMyOwnVersionOfThisTopic,
  TopicIcon,
  useEEdit,
  useEEditIssue,
} from 'front'
import { cant } from 'front/cant'
import { log } from 'front/config'
import routes from 'front/routes'
import { ArticleType, ArticleLinkType, ArticleAncestorType  } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'

import { Macro } from 'ourbigbook'

export interface ArticlePageProps extends CommonPropsType {
  ancestors?: ArticleAncestorType[];
  article: ArticleType & IssueType;
  articleInTopicByLoggedInUser?: ArticleType,
  articlesInSamePage?: ArticleType[];
  articlesInSamePageCount?: number;
  articlesInSamePageForToc?: ArticleType[];
  articlesInSamePageForTocCount?: number;
  comments?: CommentType[];
  commentsCount?: number;
  commentCountByLoggedInUser?: number;
  incomingLinks?: ArticleLinkType[];
  issueArticle?: ArticleType;
  issuesCount?: number;
  isIndex?: boolean;
  latestIssues?: IssueType[];
  otherArticlesInTopic?: (ArticleType & IssueType & TopicType)[];
  page?: number;
  synonymLinks?: ArticleLinkType[];
  tagged?: ArticleLinkType[];
  topIssues?: IssueType[];
}

const ArticlePageHoc = (isIssue=false) => {
  return function ArticlePage({
    ancestors,
    article,
    articleInTopicByLoggedInUser,
    articlesInSamePage,
    articlesInSamePageCount,
    articlesInSamePageForToc,
    articlesInSamePageForTocCount,
    commentCountByLoggedInUser,
    comments,
    commentsCount,
    incomingLinks,
    issueArticle,
    issuesCount,
    latestIssues,
    loggedInUser,
    otherArticlesInTopic,
    page,
    synonymLinks,
    tagged,
    topIssues,
  }: ArticlePageProps) {
    let t0
    if (log.perf) {
      t0 = performance.now()
    }
    const author = article.author
    const canEdit = isIssue ? !cant.editIssue(loggedInUser, article.author.username) : !cant.editArticle(loggedInUser, article.author.username)
    if (isIssue) {
      useEEditIssue(canEdit, issueArticle.slug, article.number)
    } else {
      useEEdit(canEdit, article.slug)
    }
    const handleShortFragmentSkipOnce = React.useRef(false)
    const ret = <>
      <MyHead title={
        isIssue ? '' : ancestors.map(a => a.hasScope ? a.titleSource + ` ${Macro.HEADER_SCOPE_SEPARATOR} ` : '').join('') +
          `${article.titleSource} - ${displayAndUsernameText(author)}`
      } />
      <div className="article-page">
        <div className="content-not-ourbigbook article-meta">
          {isIssue && <DiscussionAbout article={issueArticle} span={true}/>}
          <div className="article-info">
            {isIssue &&
              <span className="h2-nocolor inline">
                #{article.number}
                {' '}
              </span>
            }
            by
            {' '}
            <UserLinkWithImage user={author} showUsername={true} />
            {isIssue &&
              <>
                {' '}
                <CustomLink href={routes.articleIssues(issueArticle.slug)} className="btn"><DiscussionIcon /> See all ({issuesCount})</CustomLink>
                {' '}
                <CustomLink
                  className="btn"
                  href={routes.issueNew(issueArticle.slug)}
                  updatePreviousPage={true}
                >
                  <NewArticleIcon /> New discussion
                </CustomLink>
              </>
            }
          </div>
        </div>
        <div className="container page">
          <Article {...{
            ancestors,
            article,
            articlesInSamePage,
            articlesInSamePageCount,
            articlesInSamePageForToc,
            articlesInSamePageForTocCount,
            commentCountByLoggedInUser,
            comments,
            commentsCount,
            handleShortFragmentSkipOnce,
            incomingLinks,
            issueArticle,
            isIndex: false,
            isIssue,
            issuesCount,
            latestIssues,
            page,
            synonymLinks,
            loggedInUser,
            tagged,
            topIssues,
          }} />
        </div>
        {!isIssue &&
          <>
            <h2 className="content-not-ourbigbook">
              <CustomLink href={routes.topic(article.topicId)}>
                <TopicIcon /> Articles by others on the same topic <span className="meta">({ article.topicCount - 1 })</span>
              </CustomLink>
            </h2>
            <ArticleList {...{
              articles: otherArticlesInTopic,
              articlesCount: article.topicCount,
              handleShortFragmentSkipOnce,
              loggedInUser,
              showAuthor: true,
              showBody: true,
              showControls: false,
              what: 'articles',
            }}/>
            <div className="content-not-ourbigbook navlink">
              <CustomLink href={routes.topic(article.topicId)}> <TopicIcon /> <SeeIcon /> See all articles in the same topic</CustomLink>
              {articleInTopicByLoggedInUser
                ? <>
                    {articleInTopicByLoggedInUser.slug !== article.slug &&
                      <>{' '}<SeeMyOwnVersionOfThisTopic slug={articleInTopicByLoggedInUser.slug} toplevel={true} /></>
                    }
                  </>
                : <>{' '}<CreateMyOwnVersionOfThisTopic titleSource={article.titleSource} toplevel={true} /></>
              }
            </div>
          </>
        }
      </div>
    </>
    if (log.perf) {
      console.error(`perf: ArticlePage: ${performance.now() - t0} ms`)
    }
    return ret
  }
}

export default ArticlePageHoc;
