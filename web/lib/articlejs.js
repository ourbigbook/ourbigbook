async function getArticle(sequelize, pid) {
  return await sequelize.models.Article.findOne({
    where: { slug: pid },
  });
}

async function getArticleWithAuthor(sequelize, pid) {
  return await sequelize.models.Article.findOne({
    where: { slug: pid },
    include: [{ model: sequelize.models.User, as: 'Author' }],
  });
}

async function getArticleJson(sequelize, pid, uid) {
  const promises = [
    getArticleWithAuthor(sequelize, pid)
  ];
  if (uid) {
    promises.push(sequelize.models.User.findByPk(uid))
  }
  const ret = await Promise.all(promises);
  let user;
  const article = ret[0]
  if (!article) {
    return null;
  }
  if (uid) {
    user = ret[1]
  }
  return article.toJSONFor(article.Author, user);
}

module.exports = {
  getArticle,
  getArticleWithAuthor,
  getArticleJson,
}
