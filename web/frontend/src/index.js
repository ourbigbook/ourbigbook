import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { Route, Switch } from 'react-router-dom';
import { ConnectedRouter } from 'react-router-redux';

import App from './components/App';
import { store, history} from './store';

import './scss/index.scss';

function padNum(n, pad) {
  return String(n).padStart(pad, '0');
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getUTCFullYear()}-${padNum(date.getUTCMonth() + 1, 2)}-${padNum(date.getUTCDay(), 2)}`;
}

ReactDOM.render((
  <Provider store={store}>
    <ConnectedRouter history={history}>
      <Switch>
        <Route path="/" component={App} />
      </Switch>
    </ConnectedRouter>
  </Provider>

), document.getElementById('root'));
