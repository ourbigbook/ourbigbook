import React from 'react'

interface ErrorMessageProps {
  message: string;
}

const ErrorMessage = ({ message }: ErrorMessageProps) => (
  <div className="error-message">
    <div className="presenter">{message}</div>
  </div>
);

export default ErrorMessage;
