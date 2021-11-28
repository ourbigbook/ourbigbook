import React from "react";
import { trigger } from "swr";

import Maybe from "./Maybe";
import { getRange, getPageInfo } from "lib/utils/calculatePagination";
import { usePageDispatch, usePageState } from "lib/context/PageContext";

interface PaginationProps {
  total: number;
  limit: number;
  pageCount: number;
  currentPage: number;
  lastIndex: number;
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
  return (
    <span className={`page-item${className}`} {...newProps}>
      <a className="page-link">{props.children}</a>
    </span>
  )
}

const Pagination = ({
  total,
  limit,
  pageCount,
  currentPage,
  lastIndex,
  fetchURL,
}: PaginationProps) => {
  const page = usePageState();
  const setPage = usePageDispatch();

  const { firstPage, lastPage, hasPreviousPage, hasNextPage } = getPageInfo({
    limit,
    pageCount,
    total,
    page: currentPage,
  });
  const pages = total > 0 ? getRange(firstPage, lastPage) : [];

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLLIElement, MouseEvent>, index: number) => {
      e.preventDefault();
      setPage(index);
      trigger(fetchURL);
    },
    []
  );

  const handleFirstClick = React.useCallback(
    (e: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
      e.preventDefault();
      setPage(0);
      trigger(fetchURL);
    },
    []
  );

  const handlePrevClick = React.useCallback(
    (e: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
      e.preventDefault();
      setPage(page - 1);
      trigger(fetchURL);
    },
    []
  );

  const handleNextClick = React.useCallback(
    (e: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
      e.preventDefault();
      setPage(page + 1);
      trigger(fetchURL);
    },
    []
  );

  const handleLastClick = React.useCallback(
    (e: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
      e.preventDefault();
      setPage(lastIndex);
      trigger(fetchURL);
    },
    []
  );

  return (
    <nav className="pagination">
      <PaginationItem onClick={handleFirstClick}>{`<<`}</PaginationItem>
      <Maybe test={hasPreviousPage}>
        <PaginationItem onClick={handlePrevClick}>{`<`}</PaginationItem>
      </Maybe>
      {pages.map((page) => {
        const isCurrent = !currentPage ? page === 0 : page === currentPage;
        return (
          <React.Fragment key={page.toString()}>
            <PaginationItem
              className={isCurrent && "active"}
              onClick={(e) => handleClick(e, page)}
            >
              {page + 1}
            </PaginationItem>
            {' '}
          </React.Fragment>
        );
      })}
      <Maybe test={hasNextPage}>
        <PaginationItem onClick={handleNextClick}>{`>`}</PaginationItem>
      </Maybe>
      <PaginationItem onClick={handleLastClick}>{`>>`}</PaginationItem>
    </nav>
  );
};

export default Pagination;