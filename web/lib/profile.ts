import { GetStaticProps, GetStaticPaths } from 'next'
import sequelize from "lib/db";
const configShared = require('../config/shared')

export const getStaticPathsProfile: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: [],
  }
}

export const getStaticPropsProfile: GetStaticProps = async ({ params: { pid } }) => {
  const user = await sequelize.models.User.findOne({
    where: { username: pid },
  })
  if (!user) {
    return {
      notFound: true
    }
  }
  return {
    revalidate: configShared.revalidate,
    props: { profile: await user.toProfileJSONFor() },
  }
}
