import axios from "axios";
import { useRouter } from "next/router";
import { trigger } from "swr";

import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const DeleteButton = ({ commentId }) => {
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  const {
    query: { pid },
  } = router;
  const handleDelete = async (commentId) => {
    await axios.delete(
      `${SERVER_BASE_URL}/articles/${pid}/comments/${commentId}`,
      {
        headers: {
          Authorization: `Token ${loggedInUser?.token}`,
        },
      }
    );
    trigger(`${SERVER_BASE_URL}/articles/${pid}/comments`);
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
