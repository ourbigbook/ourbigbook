import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import React, { useRef, useEffect } from 'react'
import Router, { useRouter } from 'next/router'

import ourbigbook from 'ourbigbook/dist/ourbigbook.js';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js';
import { OurbigbookEditor } from 'ourbigbook/editor.js';
import { convertOptions, isProduction } from 'front/config';

import ListErrors from 'front/ListErrors'
import { slugFromRouter } from 'front'
import ArticleAPI from 'front/api/article'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'
import { AppContext, useCtrlEnterSubmit } from 'front'
import { modifyEditorInput } from 'front/js';

export default function ArticleEditorPageHoc(options = { isnew: false}) {
  const { isnew } = options
  const editor = ({ article: initialArticle }) => {
    const router = useRouter();
    const {
      query: { slug },
    } = router;
    let body;
    let slugString
    if (Array.isArray(slug)) {
      slugString = slug.join('/')
    } else {
      slugString = slug
    }
    let initialArticleState;
    if (initialArticle) {
      body = initialArticle.body
      if (slugString && isnew) {
        body += `${ourbigbook.PARAGRAPH_SEP}Adapted from: \\x[${ourbigbook.AT_MENTION_CHAR}${slugString}].`
      }
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
    const ourbigbookEditorElem = useRef(null);
    useEffect(() => {
      if (ourbigbookEditorElem) {
        let editor;
        loader.init().then(monaco => {
          editor = new OurbigbookEditor(
            ourbigbookEditorElem.current,
            body,
            monaco,
            ourbigbook,
            ourbigbook_runtime,
            {
              convertOptions,
              handleSubmit,
              modifyEditorInput: (oldInput) => modifyEditorInput(article.title, oldInput),
              production: isProduction,
            },
          )
          ourbigbookEditorElem.current.ourbigbookEditor = editor
        })
        return () => {
          // TODO cleanup here not working.
          // Blows exception when changing page title because scroll callback calls for the new page.
          // This also leads the redirected article page to be at a random scroll and not on top.
          // Maybe try to extract a solution from:
          // https://github.com/suren-atoyan/monaco-react/blob/9acaf635caf6d738173e53434984252baa8b06d9/src/Editor/Editor.js
          // What happens: order is ArticlePage -> onDidScrollChange -> dispose
          // but we need dispose to be the first thing.
          //ourbigbookEditorRef.current.ourbigbookEditor.dispose()
          if (editor) {
            editor.dispose()
          }
        };
      }
    }, [])
    const loggedInUser = useLoggedInUser()
    const handleTitle = async (e) => {
      setArticle(article => { return {
        ...article,
        title: e.target.value,
      }})
      await ourbigbookEditorElem.current.ourbigbookEditor.setModifyEditorInput(
        oldInput => modifyEditorInput(e.target.value, oldInput))
    }
    const handleSubmit = async (e) => {
      if (e) {
        e.preventDefault();
      }
      setLoading(true);
      let data, status;
      article.body = ourbigbookEditorElem.current.ourbigbookEditor.getValue()
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
      ourbigbookEditorElem.current.ourbigbookEditor.dispose()

      Router.push(routes.articleView(data.article.slug), null, { scroll: true });
    };
    useCtrlEnterSubmit(handleSubmit)
    const handleCancel = async (e) => {
      if (isnew) {
        Router.push(`/`);
      } else {
        // This is a hack for the useEffect cleanup callback issue.
        ourbigbookEditorElem.current.ourbigbookEditor.dispose()

        Router.push(routes.articleView(initialArticle.slug));
      }
    }
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => {
      setTitle(isnew ? 'New article' : `Editing: ${initialArticle?.title}`)
    }, [isnew, initialArticle?.title])
    return (
      <div className="editor-page content-not-ourbigbook">
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
            className="ourbigbook-editor"
            ref={ourbigbookEditorElem}
          >
          </div>
        </form>
      </div>
    );
  };
  editor.isEditor = true;
  return editor;
}
