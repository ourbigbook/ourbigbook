import React from 'react';
import { connect } from 'react-redux';

import cirodown from 'cirodown';
import 'cirodown/cirodown.runtime.js';

import ArticleMeta from './ArticleMeta';
import CommentContainer from './CommentContainer';
import agent from '../../agent';
import { ARTICLE_PAGE_LOADED, ARTICLE_PAGE_UNLOADED } from '../../constants/actionTypes';

const mapStateToProps = state => ({
  ...state.article,
  currentUser: state.common.currentUser
});

const mapDispatchToProps = dispatch => ({
  onLoad: payload =>
    dispatch({ type: ARTICLE_PAGE_LOADED, payload }),
  onUnload: () =>
    dispatch({ type: ARTICLE_PAGE_UNLOADED })
});

class Article extends React.Component {
  constructor(props) {
    super(props);
    this.renderRefCallback = this.renderRefCallback.bind(this);
  }

  componentWillMount() {
    this.props.onLoad(Promise.all([
      agent.Articles.get(this.props.match.params.id),
      agent.Comments.forArticle(this.props.match.params.id)
    ]));
  }

  componentWillUnmount() {
    this.props.onUnload();
  }

  render() {
    if (!this.props.article) {
      return null;
    }
    const markup = { __html: cirodown.convert('= ' + this.props.article.title + '\n\n' + this.props.article.body, {body_only: true}) };
    const canModify = this.props.currentUser &&
      this.props.currentUser.username === this.props.article.author.username;
    return (
      <div className="article-page">
        <div className="container">
          <ArticleMeta
            article={this.props.article}
            canModify={canModify} />
        </div>
        <div
          className="cirodown"
          dangerouslySetInnerHTML={markup}
          ref={this.renderRefCallback}
        ></div>
        <CommentContainer
          comments={this.props.comments || []}
          errors={this.props.commentErrors}
          slug={this.props.match.params.id}
          currentUser={this.props.currentUser} />
      </div>
    );
  }

  renderRefCallback() {
    cirodown_runtime(this.cirodownElem);
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Article);
