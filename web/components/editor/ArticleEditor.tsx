import Router, { useRouter } from "next/router";
import React from "react";

import ListErrors from "components/common/ListErrors";
import ArticleAPI from "lib/api/article";
import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import * as monaco from 'monaco-editor';

import 'cirodown/editor.scss'

function editorReducer(state, action) {
  switch (action.type) {
    case "SET_TITLE":
      return {
        ...state,
        title: action.text
      };
    case "SET_BODY":
      return {
        ...state,
        body: action.text
      };
    case "ADD_TAG":
      return {
        ...state,
        tagList: state.tagList.concat(action.tag)
      };
    case "REMOVE_TAG":
      return {
        ...state,
        tagList: state.tagList.filter(tag => tag !== action.tag)
      };
    default:
      throw new Error("Unhandled action");
  }
};

export default function makeArticleEditor(isnew: boolean = false) {
  return ({ article: initialArticle }) => {
    let initialState
    if (initialArticle) {
      initialState = {
        title: initialArticle.title,
        body: initialArticle.body,
        tagList: initialArticle.tagList,
      }
    } else {
      initialState = {
        title: "",
        body: "",
        tagList: [],
      }
    }
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [posting, dispatch] = React.useReducer(editorReducer, initialState);
    const loggedInUser = getLoggedInUser()
    const router = useRouter();
    const {
      query: { pid },
    } = router;
    const handleTitle = (e) =>
      dispatch({ type: "SET_TITLE", text: e.target.value });
    const handleBody = (e) =>
      dispatch({ type: "SET_BODY", text: e.target.value });
    const addTag = (tag) => dispatch({ type: "ADD_TAG", tag: tag });
    const removeTag = (tag) => dispatch({ type: "REMOVE_TAG", tag: tag });
    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      let data, status;
      if (isnew) {
        ({ data, status } = await ArticleAPI.create(
          posting,
          loggedInUser?.token
        ));
      } else {
        ({ data, status } = await ArticleAPI.update(
          posting,
          router.query.pid,
          loggedInUser?.token
        ));
      }
      setLoading(false);
      if (status !== 200) {
        setErrors(data.errors);
      }
      Router.push(`/article/${data.article.slug}`);
    };
    return (
      <div className="editor-page content-not-cirodown">
        <ListErrors errors={errors} />
        <form>
          <input
            type="text"
            placeholder="Article Title"
            value={posting.title}
            onChange={handleTitle}
          />
          <div className="input"></div>
          <div className="output cirodown"></div>
          <button
            className="btn btn-lg pull-xs-right btn-primary"
            type="button"
            disabled={isLoading}
            onClick={handleSubmit}
          >
            {isnew ? 'Publish' : 'Update'} Article
          </button>
        </form>
      </div>
    );
  };
}
