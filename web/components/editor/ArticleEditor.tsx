import Router, { useRouter } from "next/router";
import React from "react";

import ListErrors from "components/common/ListErrors";
import ArticleAPI from "lib/api/article";
import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import Editor, { DiffEditor, useMonaco, loader } from "@monaco-editor/react";
import cirodown from 'cirodown/dist/cirodown.js';
import { cirodown_runtime } from 'cirodown/dist/cirodown_runtime.js';
import { cirodown_editor } from 'cirodown/editor.js';

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

function getEditorRefCallback(initialContent) {
  return (elem) => {
    if (elem) {
      loader.init().then(monaco => cirodown_editor(elem, initialContent, monaco, cirodown, cirodown_runtime));
    }
  }
}

export default function makeArticleEditor(isnew: boolean = false) {
  const editor = ({ article: initialArticle }) => {
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
    const handleCancel = async (e) => {
      if (isnew) {
        Router.push(`/`);
      } else {
        Router.push(`/article/${initialArticle.slug}`);
      }
    }
    return (
      <div className="editor-page content-not-cirodown">
        { /* <ListErrors errors={errors} /> */ }
        <form className="editor-form">
          <div className="title-and-actions">
            <input
              type="text"
              className="title"
              placeholder="Article Title"
              value={posting.title}
              onChange={handleTitle}
            />
            <div className="actions">
              <button
                className="btn"
                type="button"
                onClick={handleCancel}
              >
                <i className="ion-close" />&nbsp;Cancel
              </button>
              <button
                className="btn"
                type="button"
                disabled={isLoading}
                onClick={handleSubmit}
              >
                <i className="ion-checkmark" />&nbsp;{isnew ? 'Create' : 'Submit'}
              </button>
            </div>
          </div>
          <div
            className="cirodown-editor"
            ref={getEditorRefCallback(posting.body)}
          >
          </div>
        </form>
      </div>
    );
  };
  editor.isEditor = true;
  return editor;
}
