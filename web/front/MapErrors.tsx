import React from 'react'

const MapErrors = ({ errors }) => (
  <ul className="error-messages">
    {Object.keys(errors).map((key) => {
      return (
        <li key={key}>
          {key}:
          <ul>
            <li>{errors[key]}</li>
          </ul>
        </li>
      );
    })}
  </ul>
);

export default MapErrors;
