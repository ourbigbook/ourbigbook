import React from "react";
import { trigger } from "swr";

import Maybe from "./Maybe";
import { AppContext } from "lib";

interface PaginationProps {
  articlesCount: number;
  articlesPerPage: number;
  showPagesMax: number;
  currentPage: number;
  setCurrentPage: React.Dispatch<any> | undefined;
  fetchURL: string;
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
      <a className="page-link">{props.children}</a>
    </span>
    {' '}
  </>
}

export const getRange = (start, end) => {
  return [...Array(end - start + 1)].map((_, i) => start + i);
};

export const getPageInfo = ({ articlesPerPage, showPagesMax, articlesCount, currentPage }) => {
  const totalPages = Math.ceil(articlesCount / articlesPerPage)
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  let firstPage = Math.max(0, currentPage - Math.floor(showPagesMax / 2));
  let lastPage = Math.min(totalPages - 1, currentPage + Math.floor(showPagesMax / 2));
  if (lastPage - firstPage + 1 < showPagesMax) {
    if (currentPage < totalPages / 2) {
      lastPage = Math.min(
        totalPages,
        lastPage + (showPagesMax - (lastPage - firstPage))
      );
    } else {
      firstPage = Math.max(1, firstPage - (showPagesMax - (lastPage - firstPage)));
    }
  }
  if (lastPage - firstPage + 1 > showPagesMax) {
    if (currentPage > totalPages / 2) {
      firstPage = firstPage + 1;
    } else {
      lastPage = lastPage - 1;
    }
  }
  const previousPage = currentPage - 1;
  const nextPage = currentPage + 1;
  const hasPreviousPage = currentPage > 0;
  const hasNextPage = currentPage < totalPages - 1;
  return {
    firstPage,
    lastPage,
    previousPage,
    nextPage,
    hasPreviousPage,
    hasNextPage,
    totalPages,
  };
};

function makeSetPageCallback(setPage, pageIndex, fetchURL) {
  return (e: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
    e.preventDefault();
    setPage(pageIndex);
    trigger(fetchURL);
  }
}

const Pagination = ({
  articlesCount,
  articlesPerPage,
  showPagesMax,
  currentPage,
  setCurrentPage,
  fetchURL,
}: PaginationProps) => {
  const { firstPage, lastPage, hasPreviousPage, hasNextPage, totalPages } = getPageInfo({
    articlesPerPage,
    showPagesMax,
    articlesCount,
    currentPage,
  });
  const pages = articlesCount > 0 ? getRange(firstPage, lastPage) : [];
  const handleFirstClick = makeSetPageCallback(setCurrentPage, 0, fetchURL)
  const handlePrevClick = makeSetPageCallback(setCurrentPage, currentPage - 1, fetchURL)
  const handleNextClick = makeSetPageCallback(setCurrentPage, currentPage + 1, fetchURL)
  const handleLastClick = makeSetPageCallback(setCurrentPage, totalPages - 1, fetchURL)
  return (
    <nav>
      <ul className="pagination">
        <Maybe test={firstPage > 0}>
          <PaginationItem onClick={handleFirstClick}>{`<<`}</PaginationItem>
        </Maybe>
        <Maybe test={hasPreviousPage}>
          <PaginationItem onClick={handlePrevClick}>{`<`}</PaginationItem>
        </Maybe>
        {pages.map(page => {
          const isCurrent = !currentPage ? page === 0 : page === currentPage;
          return (
            <PaginationItem
              key={page.toString()}
              className={isCurrent && "active"}
              onClick={makeSetPageCallback(setCurrentPage, page, fetchURL)}
            >
              {page + 1}
            </PaginationItem>
          );
        })}
        <Maybe test={hasNextPage}>
          <PaginationItem onClick={handleNextClick}>{`>`}</PaginationItem>
        </Maybe>
        <Maybe test={lastPage < totalPages - 1}>
          <PaginationItem onClick={handleLastClick}>{`>>`}</PaginationItem>
        </Maybe>
      </ul>
    </nav>
  );
};

export default Pagination;
