import React from 'react';
import { connect } from 'react-redux';

const mapStateToProps = state => ({
  ...state,
});

const mapDispatchToProps = dispatch => ({
});

class NotFound extends React.Component {
  render() {
    return (
      <div className="home-page">
        404 Not Found
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(NotFound);
