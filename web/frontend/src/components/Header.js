import React from 'react';
import { Link } from 'react-router-dom';

class Header extends React.Component {
  render() {
    return (
      <header>
        <Link to="/">
          {this.props.appName}
        </Link>
        <div>
        {
          this.props.currentUser
          ? [
            <Link to="/editor">
              <i className="ion-compose"></i>&nbsp;New Post
            </Link>,
            <Link
              to={`/@${this.props.currentUser.username}`}
            >
              <img src={this.props.currentUser.image} className="user-pic" alt={this.props.currentUser.username} />
              {this.props.currentUser.username}
            </Link>,
          ] :
          [ <Link to="/login">
              Sign in
            </Link>,
            <Link to="/register">
              Sign up
            </Link>,
          ]
        }
        </div>
      </header>
    );
  }
}

export default Header;
