const router = require('express').Router()
const _ = require('underscore')

// return a list of tags
router.get('/', function(req, res, next) {
  req.app.get('sequelize').models.Article.findAll({
    attributes: ['tagList']
  })
    .then(function(articles) {
      let tags = articles.reduce(function(allTags, article) {
        return allTags.concat(article.tagList)
      }, [])
      return res.json({ tags: _.uniq(tags) })
    })
    .catch(next)
})

module.exports = router
