import Router from 'next/router'
import React, { useRef } from 'react'

import { cant } from 'front/cant'
import {
  docsAdminUrl,
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
} from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { SiteType } from 'front/types/SiteType'

interface SiteSettingsProps extends CommonPropsType {
  site: SiteType
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
  site,
}: SiteSettingsProps) {
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState([])
  if (site.pinnedArticle === undefined) {
    site.pinnedArticle = ''
  }
  const [siteInfo, setSiteInfo] = React.useState(site)
  const [_, pinnedArticleOksInit] = getArticleErrors(site.pinnedArticle, true)
  const [pinnedArticleOks, setPinnedArticleOks] = React.useState(pinnedArticleOksInit)
  const [pinnedArticleErrors, setPinnedArticleErrors] = React.useState([])
  const [pinnedArticleLoading, setPinnedArticleLoading] = React.useState(false)
  const [pinnedArticleCheckDone, setPinnedArticleCheckDone] = React.useState(true)
  const pinnedArticleI = React.useRef(0)
  let pinnedArticleIClosure = pinnedArticleI.current
  const [formChanged, setFormChanged] = React.useState(false)
  const updateState = (field) => async (e) => {
    const val = e.target.value
    let pinnedArticle
    if (field === 'pinnedArticle') {
      pinnedArticle = val
      setPinnedArticleCheckDone(false)
      setFormChanged(site.pinnedArticle !== pinnedArticle)
      pinnedArticleI.current++
    }
    setSiteInfo({ ...siteInfo, [field]: val })
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
  const handleSubmit = async (e) => {
    if (pinnedArticleErrors.length !== 0) {
      return
    }
    e.preventDefault()
    setLoading(true)
    const { data, status } = await webApi.siteSettingsUpdate(siteInfo)
    setLoading(false)
    if (status === 200) {
      Router.push(routes.siteSettings())
    } else {
      setErrors(data.errors)
    }
    setFormChanged(false)
  }
  useCtrlEnterSubmit(handleSubmit)
  useConfirmExitPage(!formChanged)
  const title = 'Site settings'
  const canUpdate = !cant.updateSiteSettings(loggedInUser)
  const submitElem = useRef(null)
  if (submitElem.current) {
    if (pinnedArticleCheckDone && pinnedArticleErrors.length === 0) {
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
        <Label label={<><PinnedArticleIcon /> Pinned article</>} >
          <input
            type="text"
            placeholder={"(currently empty) Sample value: \"user0/article0\". Empty for don't pin any."}
            value={siteInfo.pinnedArticle}
            onChange={updateState('pinnedArticle')}
            disabled={!canUpdate}
          />
        </Label>
        <ErrorList
          errors={pinnedArticleErrors}
          loading={pinnedArticleLoading}
          oks={pinnedArticleOks}
        />
        {(canUpdate) &&
          <>
            <button
              className="btn"
              type="submit"
              ref={submitElem}
            >
              Update settings
            </button>
            {formChanged && <>
              {' '}
              <span>Unsaved changes</span>
            </>}
          </>
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
