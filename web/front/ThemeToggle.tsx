import React from 'react'

const {
  THEME_LIGHT,
  getStoredTheme,
  setTheme,
  themeToggleLabel,
  toggleTheme,
} = require('ourbigbook/runtime_common')

const ThemeToggle = () => {
  const [theme, setThemeState] = React.useState(THEME_LIGHT)

  React.useEffect(() => {
    setThemeState(setTheme(getStoredTheme(), { persist: false }))
  }, [])

  return <button
    type="button"
    className="ourbigbook-theme-toggle"
    onClick={() => setThemeState(toggleTheme())}
  >
    {themeToggleLabel(theme)}
  </button>
}

export default ThemeToggle
