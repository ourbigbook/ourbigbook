import Router, { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { displayAndUsernameText } from 'front/user'
import Article from 'front/Article'
import ArticleList from 'front/ArticleList'
import {
  AppContext,
  CreateMyOwnVersionOfThisTopic,
  DiscussionAbout,
  IssueIcon,
  NewArticleIcon,
  SeeIcon,
  SeeMyOwnVersionOfThisTopic,
  TopicIcon,
  useEEdit,
  useEEditIssue,
} from 'front'
import { webApi } from 'front/api'
import { cant } from 'front/cant'
import routes from 'front/routes'
import { ArticleType, ArticleLinkType  } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'

export interface ArticlePageProps {
  ancestors?: ArticleLinkType[];
  article: ArticleType & IssueType;
  articleInTopicByLoggedInUser?: ArticleType,
  articlesInSamePage?: ArticleType[];
  articlesInSamePageForToc?: ArticleType[];
  comments?: CommentType[];
  commentsCount?: number;
  commentCountByLoggedInUser?: number;
  incomingLinks?: ArticleLinkType[];
  issueArticle?: ArticleType;
  issuesCount?: number;
  latestIssues?: IssueType[];
  loggedInUser?: UserType;
  otherArticlesInTopic?: (ArticleType & IssueType & TopicType)[];
  page?: number;
  synonymLinks?: ArticleLinkType[];
  tagged?: ArticleLinkType[];
  topIssues?: IssueType[];
}

const ArticlePageHoc = (isIssue=false) => {
  return ({
    ancestors,
    article,
    articleInTopicByLoggedInUser,
    articlesInSamePage,
    articlesInSamePageForToc,
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
  }: ArticlePageProps) => {
    const author = article.author
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() =>
      // TODO here we would like to have a plaintext render of the title.
      // https://github.com/ourbigbook/ourbigbook/issues/250
      setTitle(`${article.titleSource} by ${displayAndUsernameText(author)}`)
    )
    const canEdit = isIssue ? !cant.editIssue(loggedInUser, article.author.username) : !cant.editArticle(loggedInUser, article.author.username)
    const handleDelete = async () => {
      if (!loggedInUser) return;
      const result = window.confirm("Do you really want to delete this article?");
      if (!result) return;
      await webApi.articleDelete(article.slug);
      Router.push(`/`);
    };
    if (isIssue) {
      useEEditIssue(canEdit, issueArticle.slug, article.number)
    } else {
      useEEdit(canEdit, article.slug)
    }
    const handleShortFragmentSkipOnce = React.useRef(false)
    return (
      <>
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
                  <CustomLink href={routes.issues(issueArticle.slug)} className="btn"><IssueIcon /> See all ({issuesCount})</CustomLink>
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
              articlesInSamePageForToc,
              commentCountByLoggedInUser,
              comments,
              commentsCount,
              handleShortFragmentSkipOnce,
              incomingLinks,
              issueArticle,
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
                  <TopicIcon /> Articles by others on the same topic ({ article.topicCount - 1 })
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
    );
  };
}

export default ArticlePageHoc;
