import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import React, { useRef, useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import lodash from 'lodash'
import pluralize from 'pluralize'

import ourbigbook from 'ourbigbook';
import web_api from 'ourbigbook/web_api';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js';
import { OurbigbookEditor } from 'ourbigbook/editor.js';
import { convertOptions, docsUrl, isProduction, read_include_web } from 'front/config';

import { ArticlePageProps } from 'front/ArticlePage'
import { ArticleBy, capitalize, disableButton, enableButton, CancelIcon, HelpIcon, slugFromArray } from 'front'
import CustomLink from 'front/CustomLink'
import ErrorList from 'front/ErrorList'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { AppContext, useCtrlEnterSubmit } from 'front'
import { hasReachedMaxItemCount, modifyEditorInput } from 'front/js';
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'

/** Fetchs ID and other DB elements via our REST API. */
class RestDbProvider extends web_api.DbProviderBase {
  fetched_ids: Set<string>;
  fetched_files: Set<string>;

  constructor() {
    super()
    this.fetched_ids = new Set()
    this.fetched_files = new Set()
  }

  async get_noscopes_base_fetch(ids, ignore_paths_set, context) {
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

export interface EditorPageProps {
  article: ArticleType & IssueType;
  articleCountByLoggedInUser: number;
  issueArticle?: ArticleType;
  loggedInUser: UserType;
  titleSource?: string;
  titleSourceLine?: number;
}

export default function ArticleEditorPageHoc({
  isIssue=false,
  isNew=false,
}={}) {
  const editor = ({
    article: initialArticle,
    articleCountByLoggedInUser,
    issueArticle,
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
    const itemType = isIssue ? 'discussion' : 'article'
    const [isLoading, setLoading] = React.useState(false);
    const [titleErrors, setTitleErrors] = React.useState([]);
    const [hasConvertError, setHasConvertError] = React.useState(false);
    const [file, setFile] = React.useState(initialFileState);
    const ourbigbookEditorElem = useRef(null);
    const ourbigbookHeaderElem = useRef(null);
    const saveButtonElem = useRef(null);
    const maxReached = hasReachedMaxItemCount(loggedInUser, articleCountByLoggedInUser, pluralize(itemType))
    let editor
    const idExistsCache = new Set()
    function cachedIdExists(idid) {
      if (idExistsCache.has(idid)) {
        return true
      } else {
        if (webApi.editorIdExists(idid)) {
          idExistsCache.add(idid)
          return true
        }
        return false
      }
    }
    function checkTitle(titleSource) {
      let titleErrors = []
      if (titleSource) {
        let newTopicId = ourbigbook.title_to_id(titleSource)
        let showToUserNew
        if (newTopicId === ourbigbook.INDEX_BASENAME_NOEXT) {
          // Maybe there is a more factored out way of dealing with this edge case.
          newTopicId = ''
          showToUserNew = ourbigbook.INDEX_BASENAME_NOEXT
        } else {
          showToUserNew = newTopicId
        }
        if (!isNew && !isIssue && initialArticle.topicId !== newTopicId) {
          let showToUserOld
          if (initialArticle?.topicId === '') {
            showToUserOld = ourbigbook.INDEX_BASENAME_NOEXT
          } else {
            showToUserOld = initialArticle?.topicId
          }
          titleErrors.push(`Topic ID changed from "${showToUserOld}" to "${showToUserNew}", this is not currently allowed`)
        }
      } else {
        titleErrors.push('The title cannot be empty')
      }
      setTitleErrors(titleErrors)
    }
    useEffect(() => {
      checkTitle(file.titleSource)
    }, [saveButtonElem, file.titleSource])
    useEffect(() => {
      if (hasConvertError || titleErrors.length) {
        disableButton(saveButtonElem.current, 'Cannot submit due to errors')
      } else {
        enableButton(saveButtonElem.current, true)
      }
    }, [hasConvertError, titleErrors])
    useEffect(() => {
      if (
        ourbigbookEditorElem &&
        loggedInUser &&
        !maxReached
      ) {
        let editor
        loader.init().then(monaco => {
          editor = new OurbigbookEditor(
            ourbigbookEditorElem.current,
            bodySource,
            monaco,
            ourbigbook,
            ourbigbook_runtime,
            {
              convertOptions: lodash.merge({
                db_provider: new RestDbProvider(),
                input_path: initialFile?.path || `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}/asdf.${ourbigbook.OURBIGBOOK_EXT}`,
                ourbigbook_json: {
                  openLinksOnNewTabs: true,
                },
                read_include: read_include_web(cachedIdExists),
                ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}`,
                x_external_prefix: '../'.repeat(window.location.pathname.match(/\//g).length - 1),
              }, convertOptions),
              handleSubmit,
              initialLine: initialArticle ? initialArticle.titleSourceLine : undefined,
              modifyEditorInput: (oldInput) => modifyEditorInput(file.titleSource, oldInput),
              postBuildCallback: (extra_returns) => {
                setHasConvertError(extra_returns.errors.length > 0)
              },
              production: isProduction,
              scrollPreviewToSourceLineCallback: (opts={}) => {
                const { ourbigbook_editor, line_number, line_number_orig } = opts
                const editor = ourbigbook_editor.editor
                const visibleRange = editor.getVisibleRanges()[0]
                const target_line_number = visibleRange.startLineNumber
                if (target_line_number === 1) {
                  ourbigbookHeaderElem.current.classList.remove('hide')
                } else {
                  if (
                    // TODO this is to prevent infinite loop/glitching:
                    // - user left line 1, hide header
                    // - editor becomes larger, but text is not much larger than the small viewport, so line 1 now visible again, show header
                    // - loop
                    // What we want is to find the correct number of lines without hardcoding that 10.
                    // That 10 is a number of lines that is taller than what gets hidden,
                    // which was about 5 lines high when this was hardcoded.
                    // Maybe something smarter can be done with editor.onDidLayoutChange.
                    editor.getModel().getLineCount() - (visibleRange.endLineNumber - visibleRange.startLineNumber) > 10
                  ) {
                    ourbigbookHeaderElem.current.classList.add('hide')
                  }
                }
              },
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
      const titleSource = e.target.value
      setFile(file => { return {
        ...file,
        titleSource,
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
        setTitleErrors(data.errors);
      }
    };
    useCtrlEnterSubmit(handleSubmit)
    const handleCancel = async (e) => {
      if (!ourbigbookEditorElem.current.ourbigbookEditor.modified || confirm('Are you sure you want to abandon your changes?')) {
        if (isNew) {
          Router.push(`/`);
        } else {
          // This is a hack for the useEffect cleanup callback issue.
          ourbigbookEditorElem.current.ourbigbookEditor.dispose()
          Router.push(routes.article(initialArticle.slug));
        }
      }
    }
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => {
      setTitle(isNew ? `New ${itemType}` : `Editing ${isIssue
        ? `discussion #${initialFile.number} "${initialFile.titleSource}" on ${issueArticle.titleSource} by ${issueArticle.author.displayName}`
        : `"${initialFile.titleSource}" by ${initialArticle.author.displayName}`
      }`)
    }, [isNew, initialFile?.titleSource])
    return (
      <div className="editor-page content-not-ourbigbook">
        { maxReached
          ? <p>{maxReached}</p>
          : <>
              <div className="header" ref={ourbigbookHeaderElem}>
                <h1>
                  {isNew
                    ? `New ${itemType}`
                    : <>
                        Editing
                        {' '}
                        {isIssue
                          ? <a href={isIssue ? routes.issue(issueArticle.slug, initialArticle.number) : routes.article(initialArticle.slug)} target="_blank">
                              {isIssue ? `discussion #${initialArticle.number}: ` : ''}"{initialFile?.titleSource}"
                            </a>
                          : <ArticleBy article={initialArticle} newTab={true}/>
                        }
                      </>
                  }
                  {isIssue && <> on <ArticleBy article={issueArticle} issue={initialArticle} newTab={true}/></>}
                </h1>
                <div className="help"><a href={`${docsUrl}#ourbigbook-markup-quick-start`} target="_blank"><HelpIcon /> Learn how to write with our OurBigBook Markup format here!</a></div>
              </div>
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
                    disabled={isLoading}
                    onClick={handleSubmit}
                    ref={saveButtonElem}
                  >
                    <i className="ion-checkmark" />&nbsp;{isNew ? `Publish ${capitalize(itemType)}` : 'Save Changes'}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCancel}
                  >
                    <CancelIcon />&nbsp;Cancel
                  </button>
                </div>
              </div>
              <ErrorList errors={titleErrors}/>
              <div
                className="ourbigbook-editor"
                ref={ourbigbookEditorElem}
              >
              </div>
            </>
        }
      </div>
    );
  };
  editor.isEditor = true;
  return editor;
}
