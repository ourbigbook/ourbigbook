async function getArticle(req, res) {
  if (req.query.id) {
    const article = await req.app.get('sequelize').models.Article.findOne({
      where: { slug: req.query.id },
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }]
    })
    if (!article)
      res.status(404)
    return article
  }
}
exports.getArticle = getArticle
