import React from "react";

interface ErrorMessageProps {
  message: string;
}

const ErrorMessage = ({ message }: ErrorMessageProps) => (
  <div className="error-message">
    <div className="error-message-presenter">{message}</div>
  </div>
);

export default ErrorMessage;
