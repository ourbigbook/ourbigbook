import React from "react";

import CustomLink from "components/common/CustomLink";
import LoadingSpinner from "components/common/LoadingSpinner";
import { usePageDispatch } from "lib/context/PageContext";
import useSWR from "swr";
import { SERVER_BASE_URL } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";
import ErrorMessage from "components/common/ErrorMessage";

const Tags = ({setTab, setTag}) => {
  const setPage = usePageDispatch();
  const handleClick = React.useCallback(() => setPage(0), []);
  const { data, error } = useSWR(`${SERVER_BASE_URL}/tags`, fetcher);
  if (error) return <ErrorMessage message="Cannot load popular tags..." />;
  if (!data) return <LoadingSpinner />;
  const { tags } = data;
  return (
    <div className="tag-list">
      {tags?.map((tag) => (
        <CustomLink
          key={tag}
          href={``}
          as={`/`}
          className="tag-default tag-pill"
          onClick={() => {setTab('tag'); setTag(tag);}}
        >
          <span onClick={handleClick}>{tag}</span>
        </CustomLink>
      ))}
    </div>
  );
};

export default Tags;
