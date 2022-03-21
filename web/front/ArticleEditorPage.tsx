import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import React, { useRef, useEffect } from 'react'
import Router, { useRouter } from 'next/router'

import cirodown from 'cirodown/dist/cirodown.js';
import { cirodown_runtime } from 'cirodown/dist/cirodown_runtime.js';
import { CirodownEditor } from 'cirodown/editor.js';
import { isProduction } from 'front/config';

import ListErrors from 'front/ListErrors'
import { slugFromRouter } from 'front'
import ArticleAPI from 'front/api/article'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'
import { AppContext, useCtrlEnterSubmit } from 'front'
import { modifyEditorInput } from 'shared';

export default function ArticleEditorPageHoc(options={ }) {
  const isnew = options.isnew === undefined ? false : options.isnew
  const editor = ({ article: initialArticle }) => {
    let body;
    let initialArticleState;
    if (initialArticle) {
      body = initialArticle.body
      initialArticleState = {
        title: initialArticle.title,
      }
    } else {
      body = ""
      initialArticleState = {
        title: "",
      }
    }
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [article, setArticle] = React.useState(initialArticleState);
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
              modifyEditorInput: (oldInput) => modifyEditorInput(article.title, oldInput),
              production: isProduction,
              handleSubmit,
            },
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
    const loggedInUser = useLoggedInUser()
    const router = useRouter();
    const handleTitle = async (e) => {
      setArticle(article => { return {
        ...article,
        title: e.target.value,
      }})
      await cirodownEditorElem.current.cirodownEditor.setModifyEditorInput(
        oldInput => modifyEditorInput(e.target.value, oldInput))
    }
    const handleSubmit = async (e) => {
      if (e) {
        e.preventDefault();
      }
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
          slugFromRouter(router),
          loggedInUser?.token
        ));
      }
      setLoading(false);
      if (status !== 200) {
        setErrors(data.errors);
      }

      // This is a hack for the useEffect cleanup callback issue.
      cirodownEditorElem.current.cirodownEditor.dispose()

      Router.push(routes.articleView(data.article.slug), null, { scroll: true });
    };
    useCtrlEnterSubmit(handleSubmit)
    const handleCancel = async (e) => {
      if (isnew) {
        Router.push(`/`);
      } else {
        // This is a hack for the useEffect cleanup callback issue.
        cirodownEditorElem.current.cirodownEditor.dispose()

        Router.push(routes.articleView(initialArticle.slug));
      }
    }
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => {
      setTitle(isnew ? 'New article' : `Editing: ${initialArticle?.title}`)
    }, [isnew, initialArticle?.title])
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
