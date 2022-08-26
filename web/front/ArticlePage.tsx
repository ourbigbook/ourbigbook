import Router, { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LoadingSpinner from 'front/LoadingSpinner'
import Maybe from 'front/Maybe'
import UserLinkWithImage from 'front/UserLinkWithImage'
import FollowUserButton from 'front/FollowUserButton'
import { DisplayAndUsername, displayAndUsernameText } from 'front/user'
import Article from 'front/Article'
import { AppContext, DiscussionAbout, NewArticleIcon, IssueIcon, SeeIcon, TimeIcon, TopicIcon, useEEdit, UserIcon } from 'front'
import { webApi } from 'front/api'
import { cant } from 'front/cant'
import fetcher from 'front/fetcher'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'

export interface ArticlePageProps {
  article: ArticleType & IssueType;
  articlesInSamePage?: ArticleType[];
  articlesInSamePageForToc?: ArticleType[];
  comments?: CommentType[];
  commentsCount?: number;
  commentCountByLoggedInUser?: number;
  issueArticle?: ArticleType;
  issuesCount?: number;
  latestIssues?: IssueType[];
  loggedInUser?: UserType;
  topIssues?: IssueType[];
  topicArticleCount?: number;
}

const ArticlePageHoc = (isIssue=false) => {
  return ({
    article,
    articlesInSamePage,
    articlesInSamePageForToc,
    commentCountByLoggedInUser,
    comments,
    commentsCount,
    issueArticle,
    latestIssues,
    topIssues,
    issuesCount,
    loggedInUser,
    topicArticleCount,
  }: ArticlePageProps) => {
    const router = useRouter();
    const author = article.author
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() =>
      // TODO here we would like to have a plaintext render of the title.
      // https://github.com/cirosantilli/ourbigbook/issues/250
      setTitle(`${article.titleSource} by ${displayAndUsernameText(author)}`)
    )
    const showOthers = topicArticleCount !== undefined && topicArticleCount > 1
    const showCreateMyOwn = !loggedInUser || author.username !== loggedInUser.username
    const canEdit = isIssue ? !cant.editIssue(loggedInUser, article) : !cant.editArticle(loggedInUser, article)
    const handleDelete = async () => {
      if (!loggedInUser) return;
      const result = window.confirm("Do you really want to delete this article?");
      if (!result) return;
      await webApi.articleDelete(article.slug);
      Router.push(`/`);
    };
    useEEdit(canEdit, article.slug)
    return (
      <>
        <div className="article-page">
          <div className="content-not-ourbigbook article-meta">
            {isIssue &&
              <nav className="issue-nav">
                <DiscussionAbout article={issueArticle} />
              </nav>
            }
            <div className="article-info">
              {isIssue &&
                <span className="h2 inline">
                  #{article.number}
                  {' '}
                </span>
              }
              by
              {' '}
              <UserLinkWithImage user={author} showUsername={true} showUsernameMobile={false} />
              {isIssue &&
                <>
                  {' '}
                  <CustomLink href={routes.issues(issueArticle.slug)} className="btn"><IssueIcon /> See All ({issuesCount})</CustomLink>
                  {' '}
                  <CustomLink className="btn" href={routes.issueNew(issueArticle.slug)}><NewArticleIcon /> New Discussion</CustomLink>
                </>
              }
            </div>
          </div>
          <div className="container page">
            <Article {...{
              article,
              articlesInSamePage,
              articlesInSamePageForToc,
              commentCountByLoggedInUser,
              comments,
              commentsCount,
              issueArticle,
              isIssue,
              issuesCount,
              latestIssues,
              loggedInUser,
              topIssues,
            }} />
          </div>
        </div>
      </>
    );
  };
}

export default ArticlePageHoc;
