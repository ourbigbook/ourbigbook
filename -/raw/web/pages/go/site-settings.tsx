import Router from 'next/router'
import React, { useRef } from 'react'

import { cant } from 'front/cant'
import {
  docsAdminUrl,
  docsUrl,
  networkSlowMs,
} from 'front/config'
import {
  USER_FINISHED_TYPING_MS
} from 'ourbigbook/runtime_common'
import ErrorList from 'front/ErrorList'
import Label from 'front/Label'
import MapErrors from 'front/MapErrors'
import {
  disableButton,
  enableButton,
  MyHead,
  SettingsIcon,
  useCtrlEnterSubmit,
  useConfirmExitPage,
  PinnedArticleIcon,
  NON_NEGATIVE_INPUT_RE,
  WarningIcon,
  ErrorIcon,
} from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { SiteType } from 'front/types/SiteType'

interface SiteSettingsProps extends CommonPropsType {
  site: SiteType;
}

function getArticleErrors(pinnedArticle, exists) {
  let newPinnedArticleOks, newPinnedArticleErrors
  if (pinnedArticle) {
    if (exists) {
      newPinnedArticleErrors = []
      newPinnedArticleOks = [`Article exists`]
    } else {
      newPinnedArticleErrors = [`Article does not exist`]
    }
  } else {
    newPinnedArticleErrors = []
    newPinnedArticleOks = [`No pinned article`]
  }
  return [newPinnedArticleErrors, newPinnedArticleOks]
}

export default function SiteSettings({
  loggedInUser,
  site: siteInit,
}: SiteSettingsProps) {
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState([])
  if (siteInit.pinnedArticle === undefined) {
    siteInit.pinnedArticle = ''
  }
  const [site, setSite] = React.useState(siteInit)
  const [siteLastSaved, setSiteLastSaved] = React.useState(siteInit)
  const [_, pinnedArticleOksInit] = getArticleErrors(siteInit.pinnedArticle, true)
  const [pinnedArticleOks, setPinnedArticleOks] = React.useState(pinnedArticleOksInit)
  const [pinnedArticleErrors, setPinnedArticleErrors] = React.useState([])
  const [automaticTopicLinksMaxWordsErrors, setAutomaticTopicLinksMaxWordsErrors] = React.useState([])
  const [pinnedArticleLoading, setPinnedArticleLoading] = React.useState(false)
  const [pinnedArticleCheckDone, setPinnedArticleCheckDone] = React.useState(true)
  const pinnedArticleI = React.useRef(0)
  let pinnedArticleIClosure = pinnedArticleI.current
  const [formChanged, setFormChanged] = React.useState(false)
  const updateState = (field) => async (e) => {
    let val = e.target.value
    let pinnedArticle
    let valueOk = true
    if (field === 'pinnedArticle') {
      pinnedArticle = val
      setPinnedArticleCheckDone(false)
      pinnedArticleI.current++
    } else if (field === 'automaticTopicLinksMaxWords') {
      e.preventDefault()
      if (val.match(NON_NEGATIVE_INPUT_RE)) {
        e.target.value = val
        if (val === '') {
          setAutomaticTopicLinksMaxWordsErrors(['Cannot be empty'])
        } else {
          val = Number(val)
          setAutomaticTopicLinksMaxWordsErrors([])
        }
      } else {
        valueOk = false
      }
    }
    if (valueOk) {
      const newSite = { ...site, [field]: val }
      setSite(newSite)
      setFormChanged(
        siteLastSaved.automaticTopicLinksMaxWords !== newSite.automaticTopicLinksMaxWords ||
        siteLastSaved.pinnedArticle !== newSite.pinnedArticle
      )
      if (pinnedArticle) {
        setTimeout(() => {
          if (pinnedArticleIClosure + 1 === pinnedArticleI.current) {
            let done = false
            setTimeout(() => {
              if (!done) { setPinnedArticleLoading(true) }
            }, networkSlowMs)
            webApi.article(pinnedArticle).then(ret => {
              if (pinnedArticleIClosure + 1 === pinnedArticleI.current) {
                const articleExists = !!ret.data
                setPinnedArticleLoading(false)
                const [newPinnedArticleErrors, newPinnedArticleOks] = getArticleErrors(
                  pinnedArticle,
                  articleExists
                )
                setPinnedArticleErrors(newPinnedArticleErrors)
                setPinnedArticleOks(newPinnedArticleOks)
                setPinnedArticleCheckDone(true)
                done = true
              }
            })
          }
        }, USER_FINISHED_TYPING_MS)
      } else {
        // Empty is always valid, so we make no request.
        const [newPinnedArticleErrors, newPinnedArticleOks] = getArticleErrors(
          pinnedArticle,
          true
        )
        setPinnedArticleErrors(newPinnedArticleErrors)
        setPinnedArticleOks(newPinnedArticleOks)
        setPinnedArticleCheckDone(true)
      }
    }
  }
  const handleSubmit = async (e) => {
    if (hasError) {
      return
    }
    e.preventDefault()
    setLoading(true)
    const { data, status } = await webApi.siteSettingsUpdate(site)
    setLoading(false)
    if (status !== 200) {
      setErrors(data.errors)
    }
    setSiteLastSaved({ ...site })
    setFormChanged(false)
  }
  useCtrlEnterSubmit(handleSubmit)
  useConfirmExitPage(!formChanged)
  const title = 'Site settings'
  const canUpdate = !cant.updateSiteSettings(loggedInUser)
  const submitElem = useRef(null)
  const hasError = 
      pinnedArticleErrors.length ||
      automaticTopicLinksMaxWordsErrors.length
  if (submitElem.current) {
    if (pinnedArticleCheckDone && !hasError) {
      enableButton(submitElem.current)
    } else {
      disableButton(submitElem.current)
    }
  }
  return <>
    <MyHead title={title} />
    <div className="settings-page content-not-ourbigbook">
      <h1><SettingsIcon /> {title}</h1>
      <p>This page contains global settings that affect the entire website. It can only be edited by <a href={`${docsAdminUrl}`}>admins</a>.</p>
      <MapErrors errors={errors} />
      <form onSubmit={handleSubmit}>
        <Label
          label={<>
            <PinnedArticleIcon /> Pinned article
            {canUpdate &&
              <ErrorList
                errors={pinnedArticleErrors}
                oks={pinnedArticleOks}
                inline={true}
                loading={pinnedArticleLoading}
              />
            }
          </>}
        >
          <input
            type="text"
            placeholder={"(currently empty) Sample value: \"user0/article0\". Empty for don't pin any."}
            value={site.pinnedArticle}
            onChange={updateState('pinnedArticle')}
            disabled={!canUpdate}
          />
        </Label>
        <Label label={<>
          Maximum number of words for automatic topic links (<a href={`${docsUrl}/automatic-topic-linking`}>automaticTopicLinksMaxWords</a>)
          <ErrorList
            errors={automaticTopicLinksMaxWordsErrors}
            inline={true}
          />
        </>} >
          <input
            placeholder={"(currently empty) 0: turn off automatic topic links >0: turn on and use this many words at most per link"}
            value={site.automaticTopicLinksMaxWords.toString()}
            onChange={updateState('automaticTopicLinksMaxWords')}
            disabled={!canUpdate}
          />
        </Label>
        {(canUpdate) &&
          <div className="submit-container">
            <button
              className="btn"
              type="submit"
              ref={submitElem}
            >
              Update settings
            </button>
            {hasError
              ? <span className="message"><ErrorIcon /> Cannot submit due to errors</span>
              : formChanged && <>
                  <span className="message"><WarningIcon /> Unsaved changes</span>
                </>
            }
          </div>
        }
      </form>
    </div>
  </>
}

import { getLoggedInUser } from 'back'

export async function getServerSideProps(context) {
  const { req, res } = context
  const sequelize = req.sequelize
  const [loggedInUser, site] = await Promise.all([
    getLoggedInUser(req, res),
    sequelize.models.Site.findOne(),
  ])
  const [siteJson, loggedInUserJson] = await Promise.all([
    site.toJson(loggedInUser),
    loggedInUser ? loggedInUser.toJson(loggedInUser) : null,
  ])
  return {
    props: {
      loggedInUser: loggedInUserJson,
      site: siteJson,
    }
  }
}
