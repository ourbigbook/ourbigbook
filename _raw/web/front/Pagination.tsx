import React from 'react'
import Router, { useRouter } from 'next/router'

import { encodeGetParams } from 'ourbigbook/web_api'

import Maybe from 'front/Maybe'
import CustomLink from 'front/CustomLink'

// number: 1-indexed page number
export type PaginationPropsUrlFunc = (number) => string;

export interface PaginationProps {
  isCurrent?: boolean;
  itemsCount: number;
  itemsPerPage: number;
  showPagesMax?: number;
  currentPage: number;
  urlFunc?: PaginationPropsUrlFunc;
  what: string;
  wrap?: boolean;
}

function PaginationItem({
  children,
  className,
  mobileHide=false,
  isCurrent=false,
  page,
  urlFunc
}: {
  children: React.ReactNode;
  className?: string;
  mobileHide?: boolean;
  isCurrent?: boolean;
  page: number;
  urlFunc?: PaginationPropsUrlFunc;
}) {
  const classNames = ['page-item']
  if (className) {
    classNames.push(className)
  }
  if (isCurrent) {
    classNames.push('active')
  } else {
    if (mobileHide) {
      classNames.push('mobile-hide')
    }
  }
  return <>
    <span className={classNames.join(' ')}>
      <CustomLink
        className="page-link"
        href={urlFunc(page)}
        onClick={(ev) => {
          // Capture the click here to maintain display-only query parameters which
          // are added with shallow routing and not seen on server. This was the case for body= as
          // of writing. Ideally we should also hack the href to reflect the correct
          // location, but lazy.
          ev.preventDefault()
          Router.push(makeUrlFunc(window.location.href)(page))
        }}
      >
        {children}
      </CustomLink>
    </span>
    {' '}
  </>
}

export const getRange = (start: number, end: number) => {
  return [...Array(end - start + 1)].map((_, i) => start + i);
};

function makeUrlFunc(urlString: string): (page: number) => string {
  return page => {
    const url = new URL(urlString)
    const query: any = Object.fromEntries(url.searchParams)
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
  wrap=true,
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
  let ret = <div className="pagination">
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
          return <PaginationItem
            key={page.toString()}
            {...{
              isCurrent,
              mobileHide: true,
              page: page + 1,
              urlFunc,
            }}
          >
            {page + 1}
          </PaginationItem>
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
      Total<span className="mobile-hide"> {what}</span>: <b>{itemsCount}</b>
    </span>
  </div>
  if (wrap) {
    ret = <nav className="content-not-ourbigbook">{ret}</nav>
  }
  return ret
};

export default Pagination;
