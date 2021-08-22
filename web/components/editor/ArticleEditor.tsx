import Editor, { DiffEditor, useMonaco, loader } from "@monaco-editor/react";
import React, { useRef, useEffect } from "react";
import Router, { useRouter } from "next/router";

import cirodown from 'cirodown/dist/cirodown.js';
import { cirodown_runtime } from 'cirodown/dist/cirodown_runtime.js';
import { CirodownEditor } from 'cirodown/editor.js';

import ListErrors from "components/common/ListErrors";
import ArticleAPI from "lib/api/article";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import { modifyEditorInput } from "lib/shared";
import routes from "routes";

function editorReducer(state, action) {
  switch (action.type) {
    case "SET_TITLE":
      action.cirodownEditorElem.current.cirodownEditor.setModifyEditorInput(
        oldInput => modifyEditorInput(action.text, oldInput))
      return {
        ...state,
        title: action.text
      };
    default:
      throw new Error("Unhandled action");
  }
};

export default function makeArticleEditor(isnew: boolean = false) {
  const editor = ({ article: initialArticle }) => {
    let body;
    let initialArticleState;
    if (initialArticle) {
      body = initialArticle.body
      initialArticleState = {
        title: initialArticle.title,
        tagList: initialArticle.tagList,
      }
    } else {
      body = ""
      initialArticleState = {
        title: "",
        tagList: [],
      }
    }
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [article, articleDispatch] = React.useReducer(editorReducer, initialArticleState);
    const cirodownEditorElem = useRef(null);
    useEffect(() => {
      if (cirodownEditorElem) {
        let editor;
        loader.init().then(monaco => {
          editor = new CirodownEditor(
            cirodownEditorElem.current,
            body,
            monaco,
            cirodown,
            cirodown_runtime,
            {
              modifyEditorInput: (oldInput) => modifyEditorInput(article.title, oldInput)
            }
          )
          cirodownEditorElem.current.cirodownEditor = editor
        })
        return () => {
          // TODO cleanup here not working.
          // Blows exception when changing page title because scroll callback calls for the new page.
          // This also leads the redirected article page to be at a random scroll and not on top.
          // Maybe try to extract a solution from:
          // https://github.com/suren-atoyan/monaco-react/blob/9acaf635caf6d738173e53434984252baa8b06d9/src/Editor/Editor.js
          // What happens: order is ArticlePage -> onDidScrollChange -> dispose
          // but we need dispose to be the first thing.
          //cirodownEditorRef.current.cirodownEditor.dispose()
          if (editor) {
            editor.dispose()
          }
        };
      }
    }, [])
    const loggedInUser = getLoggedInUser()
    const router = useRouter();
    const handleTitle = (e) =>
      articleDispatch({ type: "SET_TITLE", text: e.target.value, cirodownEditorElem });
    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      let data, status;
      article.body = cirodownEditorElem.current.cirodownEditor.getValue()
      if (isnew) {
        ({ data, status } = await ArticleAPI.create(
          article,
          loggedInUser?.token
        ));
      } else {
        ({ data, status } = await ArticleAPI.update(
          article,
          router.query.slug.join(cirodown.Macro.HEADER_SCOPE_SEPARATOR),
          loggedInUser?.token
        ));
      }
      setLoading(false);
      if (status !== 200) {
        setErrors(data.errors);
      }

      // This is a hack for the useEffect cleanup callback issue.
      cirodownEditorElem.current.cirodownEditor.dispose()

      Router.push(routes.articleView(data.article.slug), null, {scroll: true});
    };
    const handleCancel = async (e) => {
      if (isnew) {
        Router.push(`/`);
      } else {
        // This is a hack for the useEffect cleanup callback issue.
        cirodownEditorElem.current.cirodownEditor.dispose()

        Router.push(routes.articleView(initialArticle.slug));
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
              value={article.title}
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
            ref={cirodownEditorElem}
          >
          </div>
        </form>
      </div>
    );
  };
  editor.isEditor = true;
  return editor;
}
