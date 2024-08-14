import Router from 'next/router'
import React, { useEffect, useRef } from 'react'

import { cant } from 'front/cant'
import config from 'front/config'
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
} from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { SiteType } from 'front/types/SiteType'
import { UserType } from 'front/types/UserType'

interface SiteSettingsProps {
  loggedInUser?: UserType
  site: SiteType
}

const SiteSettings = ({
  loggedInUser,
  site,
}) => {
  const [isLoading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState([])
  if (site.pinnedArticle === undefined) {
    site.pinnedArticle = ''
  }
  const [siteInfo, setSiteInfo] = React.useState(site)
  const [pinnedArticleErrors, setPinnedArticleErrors] = React.useState([]);
  const [formChanged, setFormChanged] = React.useState(false)
  const updateState = (field) => async (e) => {
    const val = e.target.value
    setSiteInfo({ ...siteInfo, [field]: val })
    if (field === 'pinnedArticle') {
      let newPinnedArticleErrors
      if (val) {
        if ((await webApi.article(val)).data) {
          newPinnedArticleErrors = []
        } else {
          newPinnedArticleErrors = [`Article does not exist: ${val}`]
        }
      } else {
        newPinnedArticleErrors = []
      }
      setPinnedArticleErrors(newPinnedArticleErrors)
      if (newPinnedArticleErrors.length === 0) {
        enableButton(submitElem.current)
      } else {
        disableButton(submitElem.current)
      }
      setFormChanged(site.pinnedArticle !== val)
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
  const submitElem = useRef(null);
  return <>
    <MyHead title={title} />
    <div className="settings-page content-not-ourbigbook">
      <h1><SettingsIcon /> {title}</h1>
      <p>This page contains global settings that affect the entire website. It can only be edited by <a href={`${config.docsAdminUrl}`}>admins</a>.</p>
      <>
        <MapErrors errors={errors} />
        <form onSubmit={handleSubmit}>
          <Label label="Pinned article">
            <input
              type="text"
              placeholder="(empty) Sample value: user0/article0. Empty for don't pin any."
              value={siteInfo.pinnedArticle}
              onChange={updateState("pinnedArticle")}
              disabled={!canUpdate}
            />
          </Label>
          <ErrorList errors={pinnedArticleErrors}/>
          {(canUpdate) &&
            <>
              <button
                className="btn"
                type="submit"
                ref={submitElem}
              >
                Update Settings
              </button>
              {formChanged && <>
                {' '}
                <span>Unsaved changes</span>
              </>}
            </>
          }
        </form>
      </>
    </div>
  </>
}

export default SiteSettings

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
      site: siteJson,
      loggedInUser: loggedInUserJson,
    }
  }
}
