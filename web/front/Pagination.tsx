import React from 'react'
import { useRouter } from 'next/router'

import { encodeGetParams } from 'ourbigbook/web_api'

import Maybe from 'front/Maybe'
import CustomLink from 'front/CustomLink'

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
  let className;
  if (props.className) {
    className = ' ' + props.className
  } else {
    className = ''
  }
  return <>
    <span className={`page-item${className}`} {...newProps}>
      <CustomLink href={props.href} className="page-link">{props.children}</CustomLink>
    </span>
    {' '}
  </>
}

export const getRange = (start, end) => {
  return [...Array(end - start + 1)].map((_, i) => start + i);
};


const Pagination = ({
  // 0-indexed
  currentPage,
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
    // By default, base pagination on the current URL.
    // Works well if there is just one pagination per page about the current item,
    // which is always true as of writing.
    urlFunc = page => {
      const query = Object.assign({}, router.query)
      if (page === 1) {
        delete query.page
      } else {
        query.page = page
      }
      return `${router.pathname}${encodeGetParams(query)}`
    }
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
              <PaginationItem href={urlFunc(0)}>{`<<`}</PaginationItem>
            </Maybe>
            <Maybe test={currentPage > 0}>
              <PaginationItem href={urlFunc(currentPage)}>{`<`}</PaginationItem>
            </Maybe>
            {pages.map(page => {
              const isCurrent = page === currentPage;
              return (
                <PaginationItem
                  key={page.toString()}
                  className={isCurrent && "active"}
                  href={urlFunc(page + 1)}
                >
                  {page + 1}
                </PaginationItem>
              );
            })}
            <Maybe test={currentPage < totalPages - 1}>
              <PaginationItem  href={urlFunc(currentPage + 2)}>{`>`}</PaginationItem>
            </Maybe>
            <Maybe test={lastPage < totalPages - 1}>
              <PaginationItem href={urlFunc(totalPages)}>{`>>`}</PaginationItem>
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
