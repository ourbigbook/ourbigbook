import React from 'react'

import cirodown from 'cirodown/dist/cirodown.js';

export const LOGIN_ACTION = 'Sign in'
export const REGISTER_ACTION = 'Sign up'

export function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1)
}

export function decapitalize(s) {
  return s[0].toLowerCase() + s.slice(1)
}

export function slugFromArray(arr) {
  return arr.join(cirodown.Macro.HEADER_SCOPE_SEPARATOR)
}

export function slugFromRouter(router) {
  return slugFromArray(router.query.slug)
}

export const AppContext = React.createContext<{
  title: string
  setTitle: React.Dispatch<any> | undefined
}>({
  title: '',
  setTitle: undefined,
});

// Global state.
export const AppContextProvider = ({ children }) => {
  const [title, setTitle] = React.useState()
  return <AppContext.Provider value={{
    title, setTitle,
  }}>
    {children}
  </AppContext.Provider>
};

export function useCtrlEnterSubmit(handleSubmit) {
  React.useEffect(() => {
    function ctrlEnterListener(e) {
      if (e.code === 'Enter' && e.ctrlKey) {
        handleSubmit(e)
      }
    }
    document.addEventListener('keydown', ctrlEnterListener);
    return () => {
      document.removeEventListener('keydown', ctrlEnterListener);
    };
  });
}
