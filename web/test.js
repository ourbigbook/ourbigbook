const assert = require('assert');

const test_lib = require('./test_lib')

it('feed shows articles by followers', async ()=>{
  //  art0 by user0
  //  art1 by user1
  //  art2 by user2
  //  art3 by user3
  //
  //  art4 by user0
  //  art5 by user1
  //  art6 by user2
  //  art7 by user3
  //
  //  art8 by user0
  //  art9 by user1
  // art10 by user2
  // art11 by user3
  //
  // user0 follows user1 and user2
  // user1 follows user2 and user3
  // user2 follows user0 and user3
  // user3 follows user0 and user1
  const sequelize = await test_lib.generateDemoData({
    nUsers: 4,
    nArticlesPerUser: 3,
    nFollowsPerUser: 2,
  })

  const user0 = await sequelize.models.User.findOne({where: {username: 'user0'}})

  // getArticlesByFollowedAndCount
  const {count, rows} = await user0.findAndCountArticlesByFollowed(1, 4)
  //assert.strictEqual(user0ArticlesByFollowed[].title, 'My title 10')
  assert.strictEqual(rows[0].title, 'My title 9')
  assert.strictEqual(rows[1].title, 'My title 6')
  assert.strictEqual(rows[2].title, 'My title 5')
  assert.strictEqual(rows[3].title, 'My title 2')
  //assert.strictEqual(user0ArticlesByFollowed[4].title, 'My title 1')
  assert.strictEqual(rows.length, 4)
  assert.strictEqual(count, 6)

  await sequelize.close()
})
