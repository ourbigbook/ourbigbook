import { GetStaticProps, GetStaticPaths } from 'next'

import { revalidate } from "config";
import sequelize from "lib/db";

export const getStaticPathsProfile: GetStaticPaths = async () => {
  return {
    fallback: true,
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
  const [profile, authoredArticleCount, favoritedArticleCount] = await Promise.all([
    user.toJson(),
    user.countAuthoredArticles(),
    user.countFavorites(),
  ])
  return {
    revalidate,
    props: {
      profile,
      authoredArticleCount,
      favoritedArticleCount,
    },
  }
}
