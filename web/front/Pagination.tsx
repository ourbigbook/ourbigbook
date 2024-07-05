import React from 'react'
import Router, { useRouter } from 'next/router'

import { encodeGetParams } from 'ourbigbook/web_api'

import Maybe from 'front/Maybe'
import CustomLink from 'front/CustomLink'
import { loadProjectInfo } from 'next/dist/build/webpack-config'

// number: 1-indexed page number
export type PaginationPropsUrlFunc = (number) => string;

export interface PaginationProps {
  itemsCount: number;
  itemsPerPage: number;
  showPagesMax?: number;
  currentPage: number;
  urlFunc?: PaginationPropsUrlFunc;
  what: string;
}

function PaginationItem(props) {
  const newProps = Object.assign({}, props)
  delete newProps.children
  delete newProps.className
  delete newProps.page
  delete newProps.urlFunc
  let className;
  if (props.className) {
    className = ' ' + props.className
  } else {
    className = ''
  }
  return <>
    <span className={`page-item${className}`} {...newProps}>
      <CustomLink
        className="page-link"
        href={props.urlFunc(props.href)}
        onClick={(ev) => {
          // This is to maintain display-only query parameteres which
          // are added with shallow routing, this was the case for body= as
          // of writing. Ideally we should also hack the href to reflect the correct
          // location, but lazy.
          ev.preventDefault()
          Router.push(makeUrlFunc(window.location.href)(props.page))
        }}
      >
        {props.children}
      </CustomLink>
    </span>
    {' '}
  </>
}

export const getRange = (start: number, end: number) => {
  return [...Array(end - start + 1)].map((_, i) => start + i);
};

function makeUrlFunc(urlString) {
  return page => {
    const url = new URL(urlString)
    const query = Object.fromEntries(url.searchParams)
    if (page === 1) {
      delete query.page
    } else {
      query.page = page
    }
    return `${url.pathname}${encodeGetParams(query)}`
  }
}

const Pagination = ({
  // 0-indexed
  currentPage=1,
  itemsCount,
  itemsPerPage,
  showPagesMax,
  urlFunc,
  what,
}: PaginationProps) => {
  const router = useRouter()
  if (showPagesMax === undefined) {
    showPagesMax = 10
  }
  if (urlFunc === undefined) {
    // Take over this on browser, as there may be other query parameters set
    // that we want to keep as the page changes.
    urlFunc = makeUrlFunc('http://example.com' + router.asPath)
  }
  // - totalPages
  // - firstPage: 0-indexed
  // - lastPage: 0-indexed, inclusive
  const totalPages = Math.ceil(itemsCount / itemsPerPage)
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  let firstPage = Math.max(0, currentPage - Math.floor(showPagesMax / 2));
  let lastPage = Math.min(totalPages - 1, currentPage + Math.floor(showPagesMax / 2));
  if (lastPage - firstPage + 1 < showPagesMax) {
    if (currentPage < totalPages / 2) {
      lastPage = Math.min(
        totalPages - 1,
        lastPage + (showPagesMax - (lastPage - firstPage))
      );
    } else {
      firstPage = Math.max(0, firstPage - (showPagesMax - (lastPage - firstPage)));
    }
  }
  if (lastPage - firstPage + 1 > showPagesMax) {
    if (currentPage > totalPages / 2) {
      firstPage = firstPage + 1;
    } else {
      lastPage = lastPage - 1;
    }
  }

  const pages = itemsCount > 0 ? getRange(firstPage, lastPage) : [];
  return (
    <nav className="content-not-ourbigbook">
      <div className="pagination">
        <Maybe test={totalPages > 1}>
          <span className="pages">
            <Maybe test={firstPage > 0}>
              <PaginationItem {...{ page: 0, urlFunc }}>{`<<`}</PaginationItem>
            </Maybe>
            <Maybe test={currentPage > 0}>
              <PaginationItem {...{ page: currentPage, urlFunc }}>{`<`}</PaginationItem>
            </Maybe>
            {pages.map(page => {
              const isCurrent = page === currentPage;
              return (
                <PaginationItem
                  {...{
                    key: page.toString(),
                    className: isCurrent && "active",
                    page: page + 1,
                    urlFunc,
                  }}
                >
                  {page + 1}
                </PaginationItem>
              );
            })}
            <Maybe test={currentPage < totalPages - 1}>
              <PaginationItem {...{ page: currentPage + 2, urlFunc }}>{`>`}</PaginationItem>
            </Maybe>
            <Maybe test={lastPage < totalPages - 1}>
              <PaginationItem  {...{ page: totalPages, urlFunc }}>{`>>`}</PaginationItem>
            </Maybe>
          </span>
        </Maybe>
        <span className="total">
          Total {what}: <b>{itemsCount}</b>
        </span>
      </div>
    </nav>
  )
};

export default Pagination;
