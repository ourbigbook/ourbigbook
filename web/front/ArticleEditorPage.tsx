import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import React, { useRef, useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import lodash from 'lodash'

import ourbigbook from 'ourbigbook';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js';
import { OurbigbookEditor } from 'ourbigbook/editor.js';
import { convertOptions, isProduction } from 'front/config';

import { ArticlePageProps } from 'front/ArticlePage'
import { slugFromArray } from 'front'
import ListErrors from 'front/ListErrors'
import useLoggedInUser from 'front/useLoggedInUser'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { AppContext, useCtrlEnterSubmit } from 'front'
import { modifyEditorInput } from 'front/js';
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'

export interface EditorPageProps {
  article: ArticleType & IssueType;
  titleSource?: string;
  titleSourceLine?: number;
}

export default function ArticleEditorPageHoc({
  isIssue=false,
  isNew=false,
}={}) {
  const editor = ({
  article: initialArticle,
  titleSource,
}: EditorPageProps) => {
    const router = useRouter();
    const {
      query: { slug },
    } = router;
    let bodySource;
    let slugString
    if (Array.isArray(slug)) {
      slugString = slug.join('/')
    } else {
      slugString = slug
    }
    let initialFileState;
    let initialFile
    if (initialArticle) {
      initialFile = isIssue ? initialArticle : initialArticle.file
      bodySource = initialFile.bodySource
      if (slugString && isNew) {
        bodySource += `${ourbigbook.PARAGRAPH_SEP}Adapted from: \\x[${ourbigbook.AT_MENTION_CHAR}${slugString}].`
      }
      initialFileState = {
        titleSource: initialFile.titleSource || titleSource,
      }
    } else {
      bodySource = ""
      initialFileState = {
        titleSource,
      }
    }
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [file, setFile] = React.useState(initialFileState);
    const ourbigbookEditorElem = useRef(null);
    const loggedInUser = useLoggedInUser()
    useEffect(() => {
      if (ourbigbookEditorElem && loggedInUser) {
        let editor;
        loader.init().then(monaco => {
          //const id = ourbigbook.title_to_id(file.titleSource)
          //const input_path = `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}/${id}.${ourbigbook.OURBIGBOOK_EXT}`
          editor = new OurbigbookEditor(
            ourbigbookEditorElem.current,
            bodySource,
            monaco,
            ourbigbook,
            ourbigbook_runtime,
            {
              convertOptions: lodash.merge({
                input_path: initialFile?.path,
                ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}`,
              }, convertOptions),
              handleSubmit,
              initialLine: initialArticle ? initialArticle.titleSourceLine : undefined,
              modifyEditorInput: (oldInput) => modifyEditorInput(file.titleSource, oldInput),
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
    }, [loggedInUser?.username])
    const handleTitle = async (e) => {
      setFile(file => { return {
        ...file,
        titleSource: e.target.value,
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
      file.bodySource = ourbigbookEditorElem.current.ourbigbookEditor.getValue()
      if (isNew) {
        if (isIssue) {
          ;({ data, status } = await webApi.issueCreate(slugString, file));
        } else {
          ;({ data, status } = await webApi.articleCreate(file));
        }
      } else {
        if (isIssue) {
          ;({ data, status } = await webApi.issueEdit(slugString, router.query.number, file))
        } else {
          ;({ data, status } = await webApi.articleCreateOrUpdate(
            file,
            {
              path: slugFromArray(ourbigbook.path_splitext(initialFile.path)[0].split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR), { username: false }),
            }
          ))
        }
      }
      setLoading(false);
      if (status !== 200) {
        setErrors(data.errors);
      }

      // This is a hack for the useEffect cleanup callback issue.
      ourbigbookEditorElem.current.ourbigbookEditor.dispose()

      let redirTarget
      if (isIssue) {
        redirTarget = routes.issue(slugString, data.issue.number)
      } else {
        if (isNew) {
          redirTarget = routes.article(data.articles[0].slug)
        } else {
          redirTarget = routes.article(slugString)
        }
      }
      Router.push(redirTarget, null, { scroll: true });
    };
    useCtrlEnterSubmit(handleSubmit)
    const handleCancel = async (e) => {
      if (isNew) {
        Router.push(`/`);
      } else {
        // This is a hack for the useEffect cleanup callback issue.
        ourbigbookEditorElem.current.ourbigbookEditor.dispose()
        Router.push(routes.article(initialArticle.slug));
      }
    }
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => {
      setTitle(isNew ? `New ${isIssue ? 'issue' : 'article'}` : `Editing: ${initialFile?.titleSource}`)
    }, [isNew, initialFile?.titleSource])
    return (
      <div className="editor-page content-not-ourbigbook">
        { /* <ListErrors errors={errors} /> */ }
        <form className="editor-form">
          <div className="title-and-actions">
            <input
              type="text"
              className="title"
              placeholder="Article Title"
              value={file.titleSource}
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
                <i className="ion-checkmark" />&nbsp;{isNew ? 'Create' : 'Submit'}
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
