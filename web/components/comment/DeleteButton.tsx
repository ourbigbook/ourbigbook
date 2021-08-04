import { useRouter } from "next/router";
import { trigger } from "swr";

import CommentAPI from "lib/api/comment"
import getLoggedInUser from "lib/utils/getLoggedInUser";

const DeleteButton = ({ commentId }) => {
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  const {
    query: { pid },
  } = router;
  const handleDelete = async (commentId) => {
    await CommentAPI.delete(pid, commentId, loggedInUser?.token)
    trigger(CommentAPI.forArticle(pid));
  };
  return (
    <button
      className="btn"
      onClick={() => handleDelete(commentId)}
    >
      <i className="ion-trash-a" /> Delete Comment
    </button>
  );
};

export default DeleteButton;
