import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import React, { useRef, useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import lodash from 'lodash'
import pluralize from 'pluralize'

import ourbigbook from 'ourbigbook';
import ourbigbook_tex from 'ourbigbook/default.tex';
import web_api from 'ourbigbook/web_api';
import { preload_katex } from 'ourbigbook/nodejs_front';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js';
import { OurbigbookEditor } from 'ourbigbook/editor.js';
import { convertOptions, docsUrl, forbidMultiheaderMessage, isProduction, read_include_web } from 'front/config';

import { ArticleBy, capitalize, disableButton, enableButton, CancelIcon, HelpIcon, slugFromArray } from 'front'
import ErrorList from 'front/ErrorList'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { AppContext, useCtrlEnterSubmit } from 'front'
import { hasReachedMaxItemCount, modifyEditorInput } from 'front/js';
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import Label from 'front/Label'
import { UserType } from 'front/types/UserType'

/** DbProvider that fetchs data via the OurBigBook Web REST API. */
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
      // @ts-ignore: Property 'rows_to_asts' does not exist on type 'RestDbProvider'.
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
      const { data: { files }, status } = await webApi.editorFetchFiles(unfetched_files)
      for (const file of files) {
        // This was likely not fixed for the editor case: https://github.com/ourbigbook/ourbigbook/issues/240
        // But I'll just pretend it's fine for now until this gets digged up a few years later.
        // @ts-ignore: Property 'add_file_row_to_cache' does not exist on type 'RestDbProvider'.
        this.add_file_row_to_cache(file, context)
      }
    }
  }
}

export interface EditorPageProps {
  article: ArticleType & IssueType;
  articleCountByLoggedInUser: number;
  issueArticle?: ArticleType;
  loggedInUser: UserType;
  parentTitle?: string,
  previousSiblingTitle?: string,
  titleSource?: string;
  titleSourceLine?: number;
}

function titleToId(loggedInUser, title) {
  let ret = `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}`
  const topicId = ourbigbook.title_to_id(title)
  if (topicId !== ourbigbook.INDEX_BASENAME_NOEXT) {
    ret += `/${topicId}`
  }
  return ret
}

function titleToPath(loggedInUser, title) {
  return `${titleToId(loggedInUser, title)}.${ourbigbook.OURBIGBOOK_EXT}`
}

const idExistsCache = {}
async function cachedIdExists(idid) {
  if (idid in idExistsCache) {
    return idExistsCache[idid]
  } else {
    const ret = await webApi.editorIdExists(idid)
    idExistsCache[idid] = ret
    return ret
  }
}

const parentTitleDisplay = 'Parent article'
const previousSiblingTitleDisplay = 'Previous sibling'

export default function EditorPageHoc({
  isIssue=false,
  isNew=false,
}={}) {
  const editor = ({
    article: initialArticle,
    articleCountByLoggedInUser,
    issueArticle,
    loggedInUser,
    parentTitle: initialParentTitle,
    previousSiblingTitle: initialPreviousSiblingTitle,
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
    let isIndex
    if (!isNew && !isIssue) {
      isIndex = initialArticle.topicId === ''
    } else {
      isIndex = false
    }
    const itemType = isIssue ? 'discussion' : 'article'
    const [isLoading, setLoading] = React.useState(false);
    const [editorLoaded, setEditorLoading] = React.useState(false);
    // TODO titleErrors can be undefined immediately after this call,
    // if the server gives 500 after update. It is some kind of race condition
    // and then it blows up at a later titleErrors.length. It is some kind of race
    // condition that needs debugging at some point.
    const [titleErrors, setTitleErrors] = React.useState([]);
    const [parentErrors, setParentErrors] = React.useState([]);
    const [hasConvertError, setHasConvertError] = React.useState(false);
    const [file, setFile] = React.useState(initialFileState);
    const [parentTitle, setParentTitle] = React.useState(initialParentTitle || 'Index');
    const [previousSiblingTitle, setPreviousSiblingTitle] = React.useState(initialPreviousSiblingTitle || '');
    const ourbigbookEditorElem = useRef(null);
    const ourbigbookHeaderElem = useRef(null);
    const ourbigbookParentIdContainerElem = useRef(null);
    const saveButtonElem = useRef(null);
    const maxReached = hasReachedMaxItemCount(loggedInUser, articleCountByLoggedInUser, pluralize(itemType))
    let editor
    const finalConvertOptions = lodash.merge({
      db_provider: new RestDbProvider(),
      forbid_multiheader: isIssue ? undefined : forbidMultiheaderMessage,
      input_path: initialFile?.path || titleToPath(loggedInUser, 'asdf'),
      katex_macros: preload_katex(ourbigbook_tex),
      ourbigbook_json: {
        openLinksOnNewTabs: true,
      },
      read_include: read_include_web(cachedIdExists),
      ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}`,
    }, convertOptions)
    async function checkTitle(titleSource) {
      let titleErrors = []
      if (titleSource) {
        if (!isIssue) {
          let newTopicId = ourbigbook.title_to_id(titleSource)
          let showToUserNew
          if (newTopicId === ourbigbook.INDEX_BASENAME_NOEXT) {
            // Maybe there is a more factored out way of dealing with this edge case.
            newTopicId = ''
            showToUserNew = ourbigbook.INDEX_BASENAME_NOEXT
          } else {
            showToUserNew = newTopicId
          }
          if (isNew) {
            // finalConvertOptions.input_path
            const id = `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}/${newTopicId}`
            if (await cachedIdExists(id)) {
              titleErrors.push(`Article ID already taken: "${id}" `)
            }
          } else if (!isIssue && initialArticle.topicId !== newTopicId) {
            let showToUserOld
            if (initialArticle?.topicId === '') {
              showToUserOld = ourbigbook.INDEX_BASENAME_NOEXT
            } else {
              showToUserOld = initialArticle?.topicId
            }
            titleErrors.push(`Topic ID changed from "${showToUserOld}" to "${showToUserNew}", this is not currently allowed`)
          }
        }
      } else {
        titleErrors.push('Title cannot be empty')
      }
      setTitleErrors(titleErrors)
    }
    useEffect(() => {
      // Initial check here, then check only on title update.
      checkTitle(file.titleSource)
    }, [])
    useEffect(() => {
      if (
        // Can fail on maximum number of articles reached.
        saveButtonElem.current
      ) {
        if (hasConvertError || titleErrors.length || parentErrors.length) {
          disableButton(saveButtonElem.current, 'Cannot submit due to errors')
        } else {
          enableButton(saveButtonElem.current, true)
        }
      }
    }, [
      hasConvertError,
      saveButtonElem.current,
      titleErrors,
      parentErrors
    ])
    useEffect(() => {
      if (
        ourbigbookEditorElem &&
        loggedInUser &&
        !maxReached
      ) {
        let editor
        loader.init().then(monaco => {
          finalConvertOptions.x_external_prefix = '../'.repeat(window.location.pathname.match(/\//g).length - 1)
          editor = new OurbigbookEditor(
            ourbigbookEditorElem.current,
            bodySource,
            monaco,
            ourbigbook,
            ourbigbook_runtime,
            {
              convertOptions: finalConvertOptions,
              handleSubmit,
              initialLine: initialArticle ? initialArticle.titleSourceLine : undefined,
              modifyEditorInput: (oldInput) => modifyEditorInput(file.titleSource, oldInput),
              postBuildCallback: (extra_returns) => {
                setHasConvertError(extra_returns.errors.length > 0)
                const first_header = extra_returns.context.header_tree.children[0]
                if (isNew && first_header) {
                  const id = first_header.ast.id
                  // TODO
                  // Not working because finalConvertOptions.input_path setting in handleTitle
                  // not taking effect. This would be the better way to check for it.
                  //if (file.titleSource && cachedIdExists(id)) {
                  //  setTitleErrors([`Article ID already taken: "${id}"`])
                  //}
                }
              },
              production: isProduction,
              scrollPreviewToSourceLineCallback: (
                opts : {
                  line_number?: number;
                  line_number_orig?: number;
                  ourbigbook_editor?: any;
                } = {}
              ) => {
                const { ourbigbook_editor, line_number, line_number_orig } = opts
                const editor = ourbigbook_editor.editor
                const visibleRange = editor.getVisibleRanges()[0]
                const firstVisibleLine = visibleRange.startLineNumber
                if (firstVisibleLine === 1) {
                  ourbigbookHeaderElem.current.classList.remove('hide')
                  if (
                    // Fails for index page.
                    ourbigbookParentIdContainerElem.current !== null
                  ) {
                    ourbigbookParentIdContainerElem.current.classList.remove('hide')
                  }
                } else {
                  if (
                    // TODO this is to prevent infinite loop/glitching:
                    // - user left line 1, hide header
                    // - editor becomes larger, but text is not much larger than the small viewport, so line 1 now visible again, show header
                    // - loop
                    // What we would like is to find the correct number of lines without hardcoding this line count
                    // That hardcoded number is a number of lines that is taller than what gets hidden,
                    // which was about 5 lines high when this was hardcoded.
                    // Maybe something smarter can be done with editor.onDidLayoutChange.
                    editor.getModel().getLineCount() - (visibleRange.endLineNumber - visibleRange.startLineNumber) > 14
                  ) {
                    ourbigbookHeaderElem.current.classList.add('hide')
                    ourbigbookParentIdContainerElem.current.classList.add('hide')
                  }
                }
              },
            },
          )
          ourbigbookEditorElem.current.ourbigbookEditor = editor
          // To ensure an initial conversion in case user has modified title before the editor had loaded.
          // Otherwise title would only update if user edited title again.
          setEditorLoading(true)
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
    async function checkParent(loggedInUser, title, otherTitle, display) {
      const parentErrors = []
      if (title) {
        const id = titleToId(loggedInUser, title)
        if (!(await cachedIdExists(id))) {
          parentErrors.push(`${display} ID "${id}" does not exist`)
        }
      } else if (!otherTitle) {
        parentErrors.push(`${parentTitleDisplay} and ${previousSiblingTitleDisplay} can't both be empty`)
      }
      setParentErrors(parentErrors)
    }
    const handleParentTitle = async (e) => {
      const title = e.target.value
      setParentTitle(title)
      await checkParent(loggedInUser, title, previousSiblingTitle, parentTitleDisplay)
    }
    const handlePreviousSiblingTitle = async (e) => {
      const title = e.target.value
      setPreviousSiblingTitle(title)
      await checkParent(loggedInUser, title, parentTitle, previousSiblingTitleDisplay)
    }
    const handleTitle = async (e) => {
      const titleSource = e.target.value
      setFile(file => { return {
        ...file,
        titleSource,
      }})
      checkTitle(titleSource)
      // TODO this would be slighty better, but not taking effect, I simply can't understand why,
      // there appear to be no copies of convertOptions under editor...
      //if (titleSource) {
      //  finalConvertOptions.input_path = titleToPath(loggedInUser, titleSource)
      //}
    }
    useEffect(() => {
      if (
        // Can fail on maximum number of articles reached.
        ourbigbookEditorElem.current &&
        // Can fail is user starts editing title quickly after page load before editor had time to load.
        ourbigbookEditorElem.current.ourbigbookEditor
      ) {
        ourbigbookEditorElem.current.ourbigbookEditor.setModifyEditorInput(
          oldInput => modifyEditorInput(file.titleSource, oldInput))
      }
    }, [file, editorLoaded, ourbigbookEditorElem.current])
    const handleSubmit = async (e) => {
      if (e) {
        e.preventDefault();
      }
      if (hasConvertError || titleErrors.length) {
        // Although the button should be disabled from clicks,
        // this could still be reached via the Ctrl shortcut.
        return
      }
      setLoading(true);
      let data, status;
      file.bodySource = ourbigbookEditorElem.current.ourbigbookEditor.getValue()
      if (isIssue) {
        if (isNew) {
          ;({ data, status } = await webApi.issueCreate(slugString, file))
        } else {
          ;({ data, status } = await webApi.issueEdit(slugString, router.query.number, file))
        }
      } else {
        const opts: { path?: string, parentId?: string, previousSiblingId?: string } = {}
        if (!isIndex) {
          opts.parentId = titleToId(loggedInUser, parentTitle)
          if (previousSiblingTitle) {
            opts.previousSiblingId = titleToId(loggedInUser, previousSiblingTitle)
          }
        }
        if (isNew) {
          ;({ data, status } = await webApi.articleCreate(file, opts));
        } else {
          const path = slugFromArray(ourbigbook.path_splitext(initialFile.path)[0].split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR), { username: false })
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
                  {isIssue && <> on <ArticleBy article={issueArticle} newTab={true}/></>}
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
                    tabIndex={-1}
                  >
                    <i className="ion-checkmark" />&nbsp;{isNew ? `Publish ${capitalize(itemType)}` : 'Save Changes'}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCancel}
                    tabIndex={-1}
                  >
                    <CancelIcon />&nbsp;Cancel
                  </button>
                </div>
              </div>
              <ErrorList errors={titleErrors}/>
              {(!isIssue && !isIndex) &&
                <div ref={ourbigbookParentIdContainerElem}>
                  <Label label="Parent" />
                  <div className="parent-id-container">
                    <input
                      type="text"
                      className="title"
                      placeholder={parentTitleDisplay}
                      value={parentTitle}
                      onChange={handleParentTitle}
                    />
                  </div>
                  <Label label={previousSiblingTitleDisplay} />
                  <div className="parent-id-container">
                    <input
                      type="text"
                      className="title"
                      placeholder={`Article with same parent that comes befor this one. Empty means first child.`}
                      value={previousSiblingTitle}
                      onChange={handlePreviousSiblingTitle}
                    />
                  </div>
                </div>
              }
              <ErrorList errors={parentErrors}/>
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
