import React from 'react'

const ToggleButton = ({
  callbackOff,
  callbackOn,
  contentOff,
  contentOn,
  disabled=false,
  on: onInit,
} : {
  callbackOff: () => Promise<void>;
  callbackOn: () => Promise<void>;
  contentOff: React.ReactNode;
  contentOn: React.ReactNode;
  disabled?: boolean,
  on: boolean;
}) => {
  const [on, setOn] = React.useState(onInit)
  const buttonClassNames = ['modal']
  if (disabled) {
    buttonClassNames.push('disabled')
  }
  return (
    <button
      className={buttonClassNames.join(' ')}
      onClick={(e) => {
        e.preventDefault()
        if (on) {
          callbackOn()
        } else {
          callbackOff()
        }
        setOn((on) => !on)
      }}
    >
      {on ? contentOn : contentOff}
    </button>
  )
}

export default ToggleButton
