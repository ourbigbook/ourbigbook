import { ApiBase } from './index'
import { WEB_API_PATH } from '../index'

class UserApiClass extends ApiBase {
  async current() {
    return this.req('get', `/users`)
  }

  async follow(username){
    return this.req('post',
      `users/${username}/follow`,
    );
  }

  async get(username) { return this.req('get', `users/${username}`) }

  async login(email, password) {
    return this.req('post',
      `login`,
      { body: { user: { email, password } } },
    );
  }

  async register(displayName, username, email, password) {
    return this.req('post',
      `users`,
      { body: { user: { displayName, username, email, password } } },
    );
  }

  async save(user) {
    return this.req('put',
      `users`,
      { body : { user } },
    );
  }

  async update(user) {
    return this.req('put',
      `users/${user.username}`,
      { body: { user } },
    )
  }

  async unfollow(username) {
    return this.req('delete',
      `users/${username}/follow`,
    );
  }

  url(username) { return `/${WEB_API_PATH}/users/${username}` }
};

module.exports = UserApiClass
