import React from 'react';
import { Link } from 'react-router-dom';

class Header extends React.Component {
  render() {
    return (
      <header>
        <div className="container">
          <Link to="/">
            {this.props.appName}
          </Link>
          <div>
          {
            this.props.currentUser
            ? [
              <Link to="/editor">
                <i className="ion-compose"></i>New Post
              </Link>,
              <Link to="/settings">
                <i className="ion-gear-a"></i>Settings
              </Link>,
              <Link
                to={`/@${this.props.currentUser.username}`}
              >
                <img src={this.props.currentUser.image} className="user-pic" alt={this.props.currentUser.username} />
                {this.props.currentUser.username}
              </Link>,
            ] :
              <Link to="/register" className="nav-link">
                Sign up
              </Link>
          }
          </div>
        </div>
      </header>
    );
  }
}

export default Header;
