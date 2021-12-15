import { GetStaticProps, GetStaticPaths } from 'next'

import { fallback, revalidate } from "config";
import sequelize from "lib/db";

export const getStaticPathsProfile: GetStaticPaths = async () => {
  return {
    fallback,
    paths: [],
  }
}

export const getStaticPropsProfile: GetStaticProps = async ({ params: { uid } }) => {
  const user = await sequelize.models.User.findOne({
    where: { username: uid },
  })
  if (!user) {
    return {
      notFound: true
    }
  }
  const [profile, authoredArticleCount, likedArticleCount] = await Promise.all([
    user.toJson(),
    user.countAuthoredArticles(),
    user.countLikes(),
  ])
  return {
    revalidate,
    props: {
      profile,
      authoredArticleCount,
      likedArticleCount,
    },
  }
}
