import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import React, { useRef, useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import lodash from 'lodash'
import pluralize from 'pluralize'

import ourbigbook from 'ourbigbook';
import web_api from 'ourbigbook/web_api';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js';
import { OurbigbookEditor } from 'ourbigbook/editor.js';
import { convertOptions, isProduction, read_include_web } from 'front/config';

import { ArticlePageProps } from 'front/ArticlePage'
import { capitalize, slugFromArray } from 'front'
import ListErrors from 'front/ListErrors'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { AppContext, useCtrlEnterSubmit } from 'front'
import { hasReachedMaxItemCount, modifyEditorInput } from 'front/js';
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'

export interface EditorPageProps {
  article: ArticleType & IssueType;
  articleCountByLoggedInUser: number;
  loggedInUser: UserType;
  titleSource?: string;
  titleSourceLine?: number;
}

class RestDbProvider extends web_api.DbProviderBase {
  fetched_ids: Set<string>;
  fetched_files: Set<string>;

  constructor() {
    super()
    this.fetched_ids = new Set()
    this.fetched_files = new Set()
  }

  async get_noscopes_base_fetch(ids, ignore_paths_set, context) {
<<<<<<< Updated upstream
    const unfetched_ids = []
    for (const id of ids) {
      if (
        // Small optimization, don't fetch IDs that don't start with @, that is the case for every web ID.
        // And if there are two @, it means user is doing <@other-user/mytopic>, so we also don't need
        // to try and fetch <@myself/@other-user/mytopic>
        (id.match(new RegExp(ourbigbook.AT_MENTION_CHAR, 'g')) || []).length === 1 &&
        !this.fetched_ids.has(id)
      ) {
        this.fetched_ids.add(id)
        unfetched_ids.push(id)
      }
    }
    if (unfetched_ids.length) {
      const { data: { rows }, status } = await webApi.editorGetNoscopesBaseFetch(unfetched_ids, Array.from(ignore_paths_set))
      return this.rows_to_asts(rows, context)
    } else {
      return []
    }
=======
    const { data: { rows }, status } = await webApi.editorGetNoscopesBaseFetch(ids, Array.from(ignore_paths_set))
    console.error({ids});
    return this.rows_to_asts(rows, context)
>>>>>>> Stashed changes
  }

  async get_refs_to_fetch(types, to_ids, { reversed, ignore_paths_set, context }) {
    return []
  }

  async fetch_header_tree_ids(starting_ids_to_asts) {
    return []
  }

  async fetch_ancestors(toplevel_id) {
    return []
  }

  build_header_tree(fetch_header_tree_ids_rows, { context }) {
    return []
  }

  fetch_ancestors_build_tree(rows, context) {
    return []
  }

  get_refs_to(type, to_id, reversed=false) {
    return []
  }

  async fetch_files(paths, context) {
    const unfetched_files = []
    for (const path of paths) {
      if (!this.fetched_files.has(path)) {
        this.fetched_files.add(path)
        unfetched_files.push(path)
      }
    }
    if (unfetched_files.length) {
      const { data: { rows }, status } = await webApi.editorFetchFiles(unfetched_files)
      for (const row of rows) {
        this.add_file_row_to_cache(row, context)
      }
    }
  }
}

export default function ArticleEditorPageHoc({
  isIssue=false,
  isNew=false,
}={}) {
  const editor = ({
    article: initialArticle,
    articleCountByLoggedInUser,
    loggedInUser,
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
    if (initialArticle && !(isNew && isIssue)) {
      initialFile = isIssue ? initialArticle : initialArticle.file
      bodySource = initialFile.bodySource
      if (slugString && isNew && !isIssue) {
        bodySource += `${ourbigbook.PARAGRAPH_SEP}Adapted from: \\x[${ourbigbook.AT_MENTION_CHAR}${slugString}].`
      }
      initialFileState = {
        titleSource: initialFile.titleSource || titleSource,
      }
    } else {
      bodySource = ""
      initialFileState = {
        titleSource: titleSource || '',
      }
    }
    const itemType = isIssue ? 'issue' : 'article'
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [file, setFile] = React.useState(initialFileState);
    const ourbigbookEditorElem = useRef(null);
    const maxReached = hasReachedMaxItemCount(loggedInUser, articleCountByLoggedInUser, pluralize(itemType))
    useEffect(() => {
      if (
        ourbigbookEditorElem &&
        loggedInUser &&
        !maxReached
      ) {
        let editor;
        loader.init().then(monaco => {
          //const id = ourbigbook.title_to_id(file.titleSource)
          editor = new OurbigbookEditor(
            ourbigbookEditorElem.current,
            bodySource,
            monaco,
            ourbigbook,
            ourbigbook_runtime,
            {
              convertOptions: lodash.merge({
                db_provider: new RestDbProvider(),
<<<<<<< Updated upstream
                input_path: initialFile?.path || `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}/asdf.${ourbigbook.OURBIGBOOK_EXT}`,
                read_include: read_include_web((idid) => webApi.editorIdExists(idid)),
=======
                //input_path: initialFile?.path || `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}/asdf.${ourbigbook.OURBIGBOOK_EXT}`,
                input_path: `${window.location.pathname.slice(1)}.${ourbigbook.OURBIGBOOK_EXT}`,
>>>>>>> Stashed changes
                ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}`,
                x_external_prefix: '../'.repeat(window.location.pathname.match(/\//g).length - 1),
                //input_path: `${.slice(1)}.${ourbigbook.OURBIGBOOK_EXT}`,
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
          const path = slugFromArray(ourbigbook.path_splitext(initialFile.path)[0].split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR), { username: false })
          const opts: { path?: string } = {}
          if (path) {
            opts.path = path
          }
          ;({ data, status } = await webApi.articleCreateOrUpdate(file, opts))
        }
      }
      setLoading(false);
      if (status === 200) {
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
      } else {
        setErrors(data.errors);
      }

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
      setTitle(isNew ? `New ${itemType}` : `Editing: ${initialFile?.titleSource}`)
    }, [isNew, initialFile?.titleSource])
    return (
      <div className="editor-page content-not-ourbigbook">
        { maxReached
          ?
          <p>{maxReached}</p>
          :
          <form className="editor-form">
            <div className="title-and-actions">
              <input
                type="text"
                className="title"
                placeholder={`${capitalize(itemType)} Title`}
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
        }
      </div>
    );
  };
  editor.isEditor = true;
  return editor;
}
