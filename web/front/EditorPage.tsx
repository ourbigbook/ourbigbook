import { loader } from '@monaco-editor/react'
import React, { useEffect, useRef, useState, } from 'react'
import Router, { useRouter } from 'next/router'
import Link from 'next/link'

import lodash from 'lodash'
import pluralize from 'pluralize'

import ourbigbook, { TXT_HOME_MARKER } from 'ourbigbook'
import ourbigbook_tex from 'ourbigbook/default.tex'
import web_api from 'ourbigbook/web_api'
import { preload_katex } from 'ourbigbook/nodejs_front'
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js'
import { OurbigbookEditor, applyEditorMarkup } from 'ourbigbook/editor.js'
import { convertOptions, docsUrl, forbidMultiheaderMessage, sureLeaveMessage, isProduction, read_include_web } from 'front/config'

import {
  ArticleBy,
  ArticleIcon,
  capitalize,
  disableButton,
  enableButton,
  CancelIcon,
  EditArticleIcon,
  HelpIcon,
  MoreIcon,
  OkIcon,
  slugFromArray,
  useWindowEventListener,
  TopicIcon,
  TimeIcon,
  DiscussionIcon,
  NewArticleIcon,
} from 'front'
import ErrorList from 'front/ErrorList'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { MyHead, useCtrlEnterSubmit } from 'front'
import { hasReachedMaxItemCount, idToTopic } from 'front/js'
import Label from 'front/Label'

import { ArticleType } from 'front/types/ArticleType'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'
import { displayAndUsernameText } from 'front/user'
import CustomLink from './CustomLink'

export interface EditorPageProps extends CommonPropsType {
  article: ArticleType & IssueType;
  articleCountByLoggedInUser: number;
  issueArticle?: ArticleType;
  parentTitle?: string,
  previousSiblingTitle?: string,
  titleSource?: string;
  titleSourceLine?: number;
}

function ImageModal({ username, initialWebUrl, onInsert, onClose }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState('upload')
  const [image, setImage] = useState<File>(null)
  const [preview, setPreview] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const [path, setPath] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const uploadingRef = useRef(false)
  const [search, setSearch] = useState('')
  const [images, setImages] = useState<{ path: string }[]>([])
  const [imageCount, setImageCount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [webUrl, setWebUrl] = useState(initialWebUrl)
  const selectedImage = images.find(image => image.path === search)
  let validWebUrl = ''
  try {
    const url = new URL(webUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') validWebUrl = url.href
  } catch {}

  useEffect(() => {
    dialog.current.showModal()
  }, [])
  useEffect(() => {
    const element = dialog.current
    const cancel = e => {
      e.preventDefault()
      if (!uploadingRef.current) onClose()
    }
    element.addEventListener('cancel', cancel)
    return () => element.removeEventListener('cancel', cancel)
  }, [onClose])
  useEffect(() => {
    if (!image) return
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  useEffect(() => {
    if (tab !== 'select') return
    let active = true
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await webApi.uploadImages({ prefix: search, limit: 20 })
        if (active) {
          setImages(data.images)
          setImageCount(data.count)
        }
      } catch (error) {
        if (active) {
          setImages([])
          setImageCount(0)
          setErrors(['Could not load your images. Please try again.'])
        }
      } finally {
        if (active) setSearching(false)
      }
    }, 200)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [search, tab])

  function insert(source, fromWeb=false) {
    dialog.current.close()
    onInsert(source, fromWeb)
  }

  async function upload(e) {
    e.preventDefault()
    if (uploadingRef.current) return
    if (tab === 'select') {
      if (selectedImage && !searching) insert(selectedImage.path)
      return
    }
    if (tab === 'web') {
      if (validWebUrl) insert(validWebUrl, true)
      return
    }
    if (!image || !previewReady) return
    const parts = path.split('/')
    if (parts.some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f\x7f]/.test(path)) {
      setErrors(['Enter a relative file path, such as images/photo.png, without empty, . or .. components.'])
      return
    }
    const extension = name => name.slice(name.lastIndexOf('.')).toLowerCase().replace(/^\.jpeg$/, '.jpg')
    if (extension(path) !== extension(image.name)) {
      setErrors(['Keep the selected image’s file extension so it is served with the correct image type.'])
      return
    }
    uploadingRef.current = true
    setUploading(true)
    setErrors([])
    try {
      await webApi.uploadCreateOrUpdate(`${username}/${path}`, await image.arrayBuffer())
      insert(path)
    } catch (error) {
      const messages = error.response?.data?.errors
      setErrors(messages ? (typeof messages === 'string' ? [messages] : Array.isArray(messages) ? messages : Object.values(messages).flat()).map(String)
        : [error.message || 'Upload failed. Please try again.'])
    } finally {
      uploadingRef.current = false
      setUploading(false)
    }
  }

  return <dialog
    ref={dialog}
    className="image-upload-modal content-not-ourbigbook"
    aria-labelledby="image-upload-title"
    aria-busy={uploading}
    onKeyDown={e => e.stopPropagation()}
  >
    <form onSubmit={upload}>
      <h2 id="image-upload-title">Image</h2>
      <div className="image-tabs" role="tablist" aria-label="Image source">
        {[['upload', 'Upload image'], ['select', 'Select image'], ['web', 'From web']].map(([value, label]) =>
          <button key={value} type="button" role="tab" id={`image-tab-${value}`}
            aria-selected={tab === value} aria-controls={`image-panel-${value}`}
            tabIndex={tab === value ? 0 : -1} disabled={uploading}
            onClick={() => { setTab(value); setErrors([]) }}
            onKeyDown={e => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
              e.preventDefault()
              const tabs = Array.from(e.currentTarget.parentElement.querySelectorAll('button'))
              const i = tabs.indexOf(e.currentTarget)
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
                : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
              tabs[next].click()
              tabs[next].focus()
            }}
          >{label}</button>
        )}
      </div>
      <div role="tabpanel" id={`image-panel-${tab}`} aria-labelledby={`image-tab-${tab}`} className="image-panel">
        {tab === 'upload' && <>
          <label>
            Image
            <input type="file" accept="image/*" disabled={uploading} onChange={e => {
              const file = e.target.files?.[0]
              setErrors([])
              setPreviewReady(false)
              setPreview('')
              if (file && !file.type.startsWith('image/')) {
                setImage(null)
                setPath('')
                setErrors(['Please select an image file.'])
                return
              }
              setImage(file || null)
              setPath(file?.name || '')
            }} />
          </label>
          {preview && <img className="image-upload-preview" src={preview} alt="Selected image preview"
            onLoad={() => setPreviewReady(true)}
            onError={() => {
              setPreviewReady(false)
              setErrors(['This file cannot be previewed as an image. Please select another file.'])
            }}
          />}
          <label>
            File path
            <input type="text" value={path} required disabled={uploading} onChange={e => setPath(e.target.value)} />
          </label>
          <p>Saved under {username}/. You can include folders, for example images/photo.png.
            {' '}Uploading to an existing path replaces that file.</p>
        </>}
        {tab === 'select' && <>
          <label>
            Search your images
            <input type="text" list="uploaded-image-options" value={search} autoComplete="off"
              placeholder="Start typing a file path" onChange={e => {
                setSearch(e.target.value)
                setImages([])
                setErrors([])
                setSearching(true)
              }} />
            <datalist id="uploaded-image-options">
              {images.map(image => <option key={image.path} value={image.path} />)}
            </datalist>
          </label>
          <p role="status">{searching ? 'Searching…' : imageCount === 0 ? 'No matching images.'
            : imageCount > images.length ? 'Showing the first 20 matches. Type more to narrow the search.'
            : `${imageCount} matching image${imageCount === 1 ? '' : 's'}. Select a path from the dropdown.`}</p>
          {selectedImage && <img className="image-upload-preview" alt="Selected image preview"
            src={`/${username}/_raw/${selectedImage.path.split('/').map(encodeURIComponent).join('/')}`} />}
        </>}
        {tab === 'web' && <>
          <label>
            Image URL
            <input type="url" value={webUrl} required placeholder="https://example.com/image.jpg"
              onChange={e => setWebUrl(e.target.value)} />
          </label>
          {validWebUrl && <img className="image-upload-preview" src={validWebUrl} alt="Web image preview" />}
        </>}
      </div>
      <div role="alert"><ErrorList errors={errors} /></div>
      <div className="image-upload-actions">
        <button type="button" disabled={uploading} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={uploading || (tab === 'upload' ? !image || !previewReady || !path
          : tab === 'select' ? searching || !selectedImage : !validWebUrl)}>
          {uploading ? 'Uploading…' : tab === 'upload' ? 'Upload and insert' : 'Insert image'}
        </button>
      </div>
    </form>
  </dialog>
}

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

function titleToId(username, title) {
  let ret = `${ourbigbook.AT_MENTION_CHAR}${username}`
  const topicId = ourbigbook.titleToId(title, { keepScopeSep: true })
  if (topicId !== ourbigbook.INDEX_BASENAME_NOEXT) {
    ret += `/${topicId}`
  }
  return ret
}

function titleToPath(username, title) {
  return `${titleToId(username, title)}.${ourbigbook.OURBIGBOOK_EXT}`
}

function localWebId(username, id) {
  if (id.startsWith(ourbigbook.AT_MENTION_CHAR)) {
    return id
  }
  return `${ourbigbook.AT_MENTION_CHAR}${username}/${id}`
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
const metadataTabId = `${ourbigbook.Macro.RESERVED_ID_PREFIX}metadata`

export default function EditorPageHoc({
  isIssue=false,
  isNew=false,
}={}) {
  const editor = function EditorPage({
    article: initialArticle,
    articleCountByLoggedInUser,
    issueArticle,
    loggedInUser,
    parentTitle: initialParentTitle,
    previousSiblingTitle: initialPreviousSiblingTitle,
    titleSource,
  }: EditorPageProps) {
    const router = useRouter()
    const {
      query: { slug },
    } = router
    let bodySource
    let slugString
    if (Array.isArray(slug)) {
      slugString = slug.join('/')
    } else {
      slugString = slug
    }
    let initialFileState
    let initialFile
    let isIndex
    if (!isNew && !isIssue) {
      isIndex = initialArticle.topicId === ''
    } else {
      isIndex = false
    }
    if (initialArticle && !(isNew && isIssue)) {
      initialFile = isIssue ? initialArticle : initialArticle.file
      bodySource = initialFile.bodySource
      if (slugString && isNew && !isIssue) {
        bodySource += `${ourbigbook.PARAGRAPH_SEP}Adapted from: \\x[${ourbigbook.AT_MENTION_CHAR}${slugString}].`
      }
      let curTitleSource = initialFile.titleSource
      if (curTitleSource === undefined) {
        curTitleSource = titleSource
      }
      initialFileState = {
        titleSource: curTitleSource
      }
    } else {
      bodySource = ""
      initialFileState = {
        titleSource: titleSource || '',
      }
    }
    const itemType = isIssue ? 'discussion' : 'article'

    // State
    const [isLoading, setLoading] = useState(false)
    const [imageUpload, setImageUpload] = useState(null)
    const [publishElapsedSeconds, setPublishElapsedSeconds] = useState(0)
    const [publishProgress, setPublishProgress] = useState(null)
    const [topicId, setTopicId] = useState('')
    const [editorLoaded, setEditorLoading] = useState(false)
    // TODO titleErrors can be undefined immediately after this call,
    // if the server gives 500 after update. It is some kind of race condition
    // and then it blows up at a later titleErrors.length. It is some kind of race
    // condition that needs debugging at some point.
    const [titleErrors, setTitleErrors] = useState([])
    const [convertTitleErrors, setConvertTitleErrors] = useState([])
    const [parentErrors, setParentErrors] = useState([])
    const [hasConvertError, setHasConvertError] = useState(false)
    const [file, setFile] = useState(initialFileState)
    const [parentTitle, setParentTitle] = useState(initialParentTitle || 'Index')
    const [previousSiblingTitle, setPreviousSiblingTitle] = useState(initialPreviousSiblingTitle || '')
    const [tab, setTab] = useState('editor')
    const [list, setList] = useState(initialArticle === null ? true : initialArticle.list)
    const ourbigbookEditorElem = useRef(null)
    const ourbigbookHeaderElem = useRef(null)
    const ourbigbookParentIdContainerElem = useRef(null)
    const saveButtonElem = useRef(null)
    const parentInputElem = useRef(null);
    const publishModalElem = useRef(null)
    const publishStartedAt = publishProgress?.startedAt

    useEffect(() => {
      if (publishStartedAt === undefined) {
        return
      }
      publishModalElem.current?.focus()
      const updateElapsed = () => {
        setPublishElapsedSeconds(Math.floor((Date.now() - publishStartedAt) / 1000))
      }
      updateElapsed()
      const interval = window.setInterval(updateElapsed, 250)
      return () => window.clearInterval(interval)
    }, [publishStartedAt])

    const maxReached = hasReachedMaxItemCount(loggedInUser, articleCountByLoggedInUser, pluralize(itemType))
    let ownerUsername: string
    if (isNew) {
      ownerUsername = loggedInUser?.username
    } else {
      ownerUsername = initialArticle.author.username
    }
    async function checkTitle(titleSource) {
      let titleErrors = []
      if (!titleSource && !isIndex) {
        titleErrors.push('Title cannot be empty')
      }
      setTitleErrors(titleErrors)
    }
    useEffect(() => {
      // Initial check here, then check only on title update.
      checkTitle(file.titleSource)
    }, [file.titleSource])

    // Ask for confirmation before leaving page with:
    // - tab close
    // - history back button
    // if any changes were made to editor. In this page we:
    // - can only exit with router on Cancel, and that is handled there
    // - every other link opens a new page.
    // This is why we don't use useConfirmExitPage, as it handles the
    // Router.push case which is not needed in this case.
    function beforeUnloadConfirm() {
      if (ourbigbookEditorElem.current.ourbigbookEditor.modified) {
        // Message not really shown, there's no way:
        // https://stackoverflow.com/questions/38879742/is-it-possible-to-display-a-custom-message-in-the-beforeunload-popup
        return sureLeaveMessage
      }
    }
    useWindowEventListener('beforeunload', beforeUnloadConfirm)

    const hasError = hasConvertError ||
      titleErrors.length ||
      convertTitleErrors.length ||
      parentErrors.length
    if (
      // Can fail on maximum number of articles reached.
      saveButtonElem.current
    ) {
      if (hasError || isLoading) {
        disableButton(saveButtonElem.current)
      } else {
        enableButton(saveButtonElem.current)
      }
    }
    const handleSubmit = async (e) => {
      if (e) {
        e.preventDefault()
      }
      if (hasError || imageUpload) {
        // Although the button should be disabled from clicks,
        // this could still be reached via the Ctrl shortcut.
        return
      }
      setLoading(true)
      if (isNew && !isIssue) {
        setPublishProgress({
          current: 0,
          currentId: undefined,
          startedAt: Date.now(),
          title: undefined,
          total: undefined,
        })
      }
      let data, status
      try {
        file.bodySource = ourbigbookEditorElem.current.ourbigbookEditor.getValue()
        if (isIssue) {
        file.list = list
        if (isNew) {
          ;({ data, status } = await webApi.issueCreate(slugString, file))
        } else {
          ;({ data, status } = await webApi.issueEdit(slugString, router.query.number, file))
        }
        } else {
        const baseOpts: {
          list: boolean;
          owner: string;
          path?: string;
          parentId?: string;
          previousSiblingId?: string;
        } = {
          list,
          owner: ownerUsername,
        }
        if (isNew) {
          const editor = ourbigbookEditorElem.current.ourbigbookEditor
          const splitResult = await ourbigbook.splitWebArticles(
            editor.lastInput,
            {
              ...editor.options.convertOptions,
              db_provider: new RestDbProvider(),
              input_path: editor.lastInputPath,
            },
          )
          if (splitResult.extra_returns.errors.length || !splitResult.articles.length) {
            status = 422
            data = { errors: splitResult.extra_returns.errors.length
              ? splitResult.extra_returns.errors.map(error => error.message)
              : ['No articles were found in the editor input']
            }
          } else {
            let rootData
            status = 200
            const total = splitResult.articles.length
            for (let i = 0; i < total; i++) {
              const article = splitResult.articles[i]
              setPublishProgress(progress => ({
                ...progress,
                current: i + 1,
                currentId: localWebId(ownerUsername, article.ast.id),
                title: article.titleSource,
                total,
              }))
              const opts = { ...baseOpts }
              if (article.parent) {
                opts.parentId = localWebId(ownerUsername, article.parent.ast.id)
              } else if (!isIndex) {
                opts.parentId = titleToId(ownerUsername, parentTitle)
              }
              if (article.previousSibling) {
                opts.previousSiblingId = localWebId(ownerUsername, article.previousSibling.ast.id)
              } else if (!article.parent && previousSiblingTitle) {
                opts.previousSiblingId = titleToId(ownerUsername, previousSiblingTitle)
              }
              ;({ data, status } = await webApi.articleCreate({
                bodySource: article.bodySource,
                titleSource: article.titleSource,
              }, opts))
              if (status !== 200) {
                break
              }
              if (!rootData) {
                rootData = data
              }
            }
            if (status === 200) {
              data = rootData
            }
          }
        } else {
          const opts = baseOpts
          if (!isIndex) {
            opts.parentId = titleToId(ownerUsername, parentTitle)
            if (previousSiblingTitle) {
              opts.previousSiblingId = titleToId(ownerUsername, previousSiblingTitle)
            }
          }
          const path = slugFromArray(
            ourbigbook.pathSplitext(initialFile.path)[0].split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR),
            { username: false }
          )
          if (path) {
            opts.path = path
          }
          ;({ data, status } = await webApi.articleCreateOrUpdate(file, opts))
        }
        }
      } catch (error) {
        setLoading(false)
        setPublishProgress(null)
        setTitleErrors([`An error occurred while publishing: ${error.message}`])
        return
      }
      setLoading(false)
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
        Router.push(redirTarget, null, { scroll: true })
      } else {
        setPublishProgress(null)
        let errors = data.errors
        if (!errors) {
          errors = [`An error ocurred: ${status}`]
        }
        setTitleErrors(errors)
      }
    }
    // https://github.com/ourbigbook/ourbigbook/issues/222
    if (ourbigbookEditorElem.current && ourbigbookEditorElem.current.ourbigbookEditor) {
      ourbigbookEditorElem.current.ourbigbookEditor.handleSubmit = handleSubmit
    }
    useEffect(() => {
      if (
        ourbigbookEditorElem.current &&
        loggedInUser &&
        !maxReached
      ) {
        let editor
        loader.init().then(monaco => {
          const finalConvertOptions = lodash.merge({
            check_db_ids: isNew && !isIssue,
            db_provider: new RestDbProvider(),
            forbid_multiheader: isIssue || isNew ? undefined : forbidMultiheaderMessage,
            input_path: initialFile?.path || titleToPath(ownerUsername, 'asdf'),
            katex_macros: preload_katex(ourbigbook_tex),
            ourbigbook_json: {
              openLinksOnNewTabs: true,
            },
            read_include: read_include_web(cachedIdExists),
            ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${ownerUsername}`,
          }, convertOptions)
          finalConvertOptions.automaticTopicLinksMaxWords = 0
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
              modifyEditorInput: ourbigbook.modifyEditorInput,
              titleSource: initialFileState.titleSource,
              toolbarHeaderLevels: isNew && !isIssue ? [2, 3, 4] : [],
              onImage: editor => setImageUpload({ editor, selection: editor.editor.getSelection() }),
              postBuildCallback: async (extra_returns, ourbigbookEditor) => {
                setHasConvertError(extra_returns.errors.length > 0)

                let titleErrors = []
                if (!isIssue) {
                  const headerTreeRoot = extra_returns.context.header_tree
                  const firstHeader = headerTreeRoot.children[0]
                  const newId = firstHeader.ast.id
                  let newTopicId = idToTopic(newId)
                  setTopicId(newTopicId)
                  let showToUserNew
                  if (newTopicId === ourbigbook.INDEX_BASENAME_NOEXT) {
                    // Maybe there is a more factored out way of dealing with this edge case.
                    newTopicId = ''
                    showToUserNew = ourbigbook.INDEX_BASENAME_NOEXT
                  } else {
                    showToUserNew = newTopicId
                  }
                  if (isNew) {
                    const headerIds = []
                    const collectHeaderIds = (node) => {
                      for (const child of node.children) {
                        headerIds.push(localWebId(ownerUsername, child.ast.id))
                        collectHeaderIds(child)
                      }
                    }
                    collectHeaderIds(headerTreeRoot)
                    if (newTopicId) {
                      const id = localWebId(ownerUsername, firstHeader.ast.id)
                      if (await cachedIdExists(id)) {
                        titleErrors.push(`ID already taken: "${id}"`)
                      }
                      if (
                        !loggedInUser.admin &&
                        articleCountByLoggedInUser + headerIds.length > loggedInUser.maxArticles
                      ) {
                        titleErrors.push(`Creating these ${headerIds.length} articles would exceed your maximum of ${loggedInUser.maxArticles} articles`)
                      }
                    } else {
                      if (ourbigbookEditor.titleSource) {
                        titleErrors.push(`ID cannot be empty`)
                      }
                    }
                  } else if (!isIssue && initialArticle.topicId !== newTopicId) {
                    let showToUserOld
                    if (initialArticle?.topicId === '') {
                      showToUserOld = ourbigbook.INDEX_BASENAME_NOEXT
                    } else {
                      showToUserOld = initialArticle?.topicId
                    }
                    titleErrors.push(`ID changed from "${showToUserOld}" to "${showToUserNew}", this is not currently allowed`)
                  }
                }
                setConvertTitleErrors(titleErrors)

                const first_header = extra_returns.context.header_tree.children[0]
                if (isNew && first_header) {
                  const id = first_header.ast.id
                  // TODO
                  // Not working because finalConvertOptions.input_path setting in handleTitle
                  // not taking effect. This would be the better way to check for it.
                  //if (initialFileState.titleSource && cachedIdExists(id)) {
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
          if (isIndex) {
            editor.editor.focus()
          }
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
        }
      }
    }, [
      bodySource,
      initialFileState.titleSource,
      // TODO this is a dependency, but if we add it
      // we get back the error where the editor goes blank on error.
      // This is related to https://github.com/ourbigbook/ourbigbook/issues/222
      //handleSubmit,
      initialArticle,
      initialArticle?.titleSourceLine,
      initialFile?.path,
      loggedInUser,
      maxReached,
      ownerUsername
    ])
    async function checkParent(title, otherTitle, display) {
      const parentErrors = []
      if (title) {
        const id = titleToId(ownerUsername, title)
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
      await checkParent(title, previousSiblingTitle, parentTitleDisplay)
    }
    const handlePreviousSiblingTitle = async (e) => {
      const title = e.target.value
      setPreviousSiblingTitle(title)
      await checkParent(title, parentTitle, previousSiblingTitleDisplay)
    }
    const handleTitle = async (e) => {
      const titleSource = e.target.value
      setFile(file => { return {
        ...file,
        titleSource,
      }})
      checkTitle(titleSource)
      // TODO this would be slightly better, but not taking effect, I simply can't understand why,
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
        ourbigbookEditorElem.current.ourbigbookEditor.setTitleSource(file.titleSource)
      }
    }, [file, editorLoaded])

    useEffect(() => {
      ourbigbookEditorElem.current?.ourbigbookEditor?.setToolbarDisabled(isLoading)
    }, [isLoading, editorLoaded])
    useCtrlEnterSubmit(handleSubmit)
    const handleCancel = async (e) => {
      if (!ourbigbookEditorElem.current.ourbigbookEditor.modified || confirm('Are you sure you want to abandon your changes?')) {
        if (isNew) {
          Router.push(`/`)
        } else {
          // This is a hack for the useEffect cleanup callback issue.
          ourbigbookEditorElem.current.ourbigbookEditor.dispose()
          Router.push(routes.article(initialArticle.slug))
        }
      }
    }
    const title = isNew
      ? `New ${itemType}`
      : `Editing ${isIssue
          ? `discussion #${initialFile.number} "${initialFile.titleSource}" on ${issueArticle.titleSource} by ${issueArticle.author.displayName}`
          : isIndex
            ? TXT_HOME_MARKER
            : `"${initialFile.titleSource}"` +
              `${initialArticle.author.id === loggedInUser.id
                ? ''
                : `by ${displayAndUsernameText(initialArticle.author)}`
              }`
        }`

    // Tabs
    function goToTab() {
      const hash = window.location.hash
      let tab
      if (hash === '#_metadata') {
        tab = 'metadata'
      } else {
        tab = 'editor'
      }
      setTab(tab)
    }
    useEffect(() => {
      const onHashChange = () => {
        goToTab()
      }
      goToTab()
      window.addEventListener('hashchange', onHashChange)
      return () => window.removeEventListener('hashchange', onHashChange)
    })

    const titleInputElem = useRef(null)
    useEffect(() => {
      if (titleInputElem.current) {
        titleInputElem.current.focus()
      }
    }, [])

    return <>
      <MyHead title={title} />
      {imageUpload && <ImageModal
        username={loggedInUser.username}
        initialWebUrl={(() => {
          const text = imageUpload.editor.editor.getModel().getValueInRange(imageUpload.selection)
          return /^https?:\/\/\S+$/i.test(text) ? text : ''
        })()}
        onClose={() => {
          setImageUpload(null)
          imageUpload.editor.editor.focus()
        }}
        onInsert={(path, fromWeb) => {
          const editor = imageUpload.editor
          const inputPath = editor.lastInputPath
          const headers = editor.lastHeaderTree?.children
          // Bare paths are relative to the source file's directory. New articles
          // can inherit a scope from their parent or split into scoped children;
          // discussions also have a separate internal source directory.
          const useRelativePath = !isIssue &&
            inputPath?.startsWith(`@${ownerUsername}/`) && inputPath.split('/').length === 2 &&
            (!isNew || (parentTitle === 'Index' && !previousSiblingTitle &&
              headers?.length === 1 && headers[0].children.length === 0))
          editor.editor.setSelection(imageUpload.selection)
          const imageSource = fromWeb ? path : loggedInUser.username !== ownerUsername
            ? `@${loggedInUser.username}/${path}` : useRelativePath ? path : `/${path}`
          applyEditorMarkup(editor, 'image', { imageSource })
          setImageUpload(null)
        }}
      />}
      {publishProgress &&
        <div
          aria-live="polite"
          aria-modal="true"
          className="modal-page publish-progress-modal"
          onKeyDown={e => e.preventDefault()}
          ref={publishModalElem}
          role="dialog"
          tabIndex={-1}
        >
          <div className="modal-container">
            <div className="modal-title ourbigbook-title">
              <ArticleIcon title={null} /> Publishing articles
            </div>
            {publishProgress.total === undefined
              ? <div>Preparing articles…</div>
              : <>
                  <div className="publish-progress-count">
                    {publishProgress.current} / {publishProgress.total}
                  </div>
                  <progress
                    max={publishProgress.total}
                    value={Math.max(0, publishProgress.current - 1)}
                  />
                  <div>Publishing “{publishProgress.title}”</div>
                  <div className="publish-progress-id">{publishProgress.currentId}</div>
                </>
            }
            <div><TimeIcon /> {publishElapsedSeconds} seconds elapsed</div>
          </div>
        </div>
      }
      <div className="editor-page content-not-ourbigbook">
        { maxReached
          ? <p>{maxReached}</p>
          : <>
              <div className="header" ref={ourbigbookHeaderElem}>
                <h1>
                  {isNew
                    ? <>
                        <NewArticleIcon /> New {itemType}
                        {(!isIssue && topicId) && <>
                          {' '}on topic <span className="meta">
                            <CustomLink href={routes.topic(topicId)} newTab={true}><TopicIcon /> {topicId}</CustomLink>
                          </span>
                        </>}
                      </>
                    : <>
                        <EditArticleIcon /> Editing
                        {' '}
                        {isIssue
                          ? <CustomLink
                              href={
                                isIssue
                                  ? routes.issue(issueArticle.slug, initialArticle.number)
                                  : routes.article(initialArticle.slug)
                              }
                              newTab={true}
                            >
                              <DiscussionIcon /> Discussion #{initialArticle.number} "{initialFile?.titleSource}"
                            </CustomLink>
                          : <>
                              <ArticleBy
                                article={initialArticle}
                                newTab={true}
                                showAuthor={initialArticle.author.id !== loggedInUser.id}
                                showArticleIcon={!isIndex}
                                showTopicId={
                                  !isIndex &&
                                  ourbigbook.titleToId(initialFile.titleSource) !== initialArticle.topicId
                                }
                              />
                            </>
                        }
                      </>
                  }
                  {isIssue && <> on <ArticleBy article={issueArticle} newTab={true}/></>}
                </h1>
                <Label
                  className={isIndex ? 'hide' : ''}
                  flex={true}
                  label="Title"
                >
                  <input
                    className="title"
                    onChange={handleTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        if (tab === 'editor') {
                          if (ourbigbookEditorElem.current && ourbigbookEditorElem.current.ourbigbookEditor) {
                            ourbigbookEditorElem.current.ourbigbookEditor.editor.focus()
                          }
                        } else {
                          if (parentInputElem.current) {
                            parentInputElem.current.focus()
                          }
                        }
                      }
                    }}
                    placeholder={`${capitalize(itemType)} Title`}
                    ref={titleInputElem}
                    value={file.titleSource}
                    type="text"
                  />
                </Label>
                <ErrorList
                  errors={titleErrors.concat(convertTitleErrors)}
                  //oks={hasError ? undefined : ['Title looks good.']}
                />
                <div className="tab-list">
                  <Link
                    className={`tab-item${tab === 'editor' ? ' active' : ''}`}
                    href={'#' /* TODO don't know how to make this empty. Like this it makes the URL be '#' which is ugly, but it works. */}
                    onClick={(ev) => {
                      ev.preventDefault()
                      window.location.hash = '' }}
                  >
                    <EditArticleIcon /> Editor
                  </Link>
                  <Link
                    className={`tab-item${tab === 'metadata' ? ' active' : ''}`}
                    href={`#${metadataTabId}`}
                    onClick={(ev) => {
                      ev.preventDefault()
                      window.location.hash = `#${metadataTabId}`
                    }}
                  >
                    <MoreIcon /> Metadata
                  </Link>
                  {' '}
                  <button
                    className="btn"
                    type="button"
                    disabled={isLoading}
                    onClick={handleSubmit}
                    ref={saveButtonElem}
                    tabIndex={-1}
                  >
                    <OkIcon title={null} />&nbsp;{isNew ? `Publish ${capitalize(itemType)}` : 'Save Changes'}
                  </button>
                  {' '}
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCancel}
                    tabIndex={-1}
                  >
                    <CancelIcon title={null}/>&nbsp;Cancel
                  </button>
                </div>
              </div>
              <div className="tabs">
                <div className={`editor-tab${tab === 'editor' ? '' : ' hide'}`}>
                  <div className="help">
                    <CustomLink
                      href={`${docsUrl}#ourbigbook-markup-quick-start`}
                      newTab={true}
                    >
                      <HelpIcon /> Learn how to write with our OurBigBook Markup format here!
                    </CustomLink>
                  </div>
                  <div
                    className="ourbigbook-editor"
                    ref={ourbigbookEditorElem}
                  >
                  </div>
                </div>
                <div className={`metadata-tab${tab === 'metadata' ? '' : ' hide'}`}>
                  {!isIssue &&
                    <div ref={ourbigbookParentIdContainerElem}>
                      {!isIndex && <>
                        <Label label="ID" >
                          <input
                            type="text"
                            className="title"
                            value={topicId}
                            disabled={true}
                          />
                        </Label>
                        <Label label="Parent" >
                          <input
                            type="text"
                            className="title"
                            placeholder={parentTitleDisplay}
                            value={parentTitle}
                            onChange={handleParentTitle}
                            ref={parentInputElem} />
                        </Label>
                        <Label label={previousSiblingTitleDisplay} >
                          <input
                            type="text"
                            className="title"
                            placeholder={`Article with same parent that comes before this one. Empty means first child.`}
                            value={previousSiblingTitle}
                            onChange={handlePreviousSiblingTitle}
                          />
                        </Label>
                        <ErrorList errors={parentErrors}/>
                      </>}
                    </div>
                  }
                  <Label label="Unlisted" inline={true}>
                    <input
                      type="checkbox"
                      defaultChecked={!list}
                      onChange={(e) => { setList(!e.target.checked) }}
                    />
                  </Label>
                </div>
              </div>
            </>
        }
      </div>
    </>
  }
  editor.isEditor = true
  return editor
}
