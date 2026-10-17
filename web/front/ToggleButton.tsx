import React from 'react'

const ToggleButton = ({
  callbackOff,
  callbackOn,
  confirmOff,
  confirmOn,
  contentOff,
  contentOn,
  disabled=false,
  disabledWhenOn=false,
  on: onInit,
  onSuccess,
} : {
  callbackOff: () => Promise<void>;
  callbackOn?: () => Promise<void>;
  confirmOff?: () => boolean;
  confirmOn?: () => boolean;
  contentOff: React.ReactNode;
  contentOn: React.ReactNode;
  disabled?: boolean,
  disabledWhenOn?: boolean,
  on: boolean;
  onSuccess?: (ret: any) => void;
}) => {
  const [on, setOn] = React.useState(onInit)
  React.useEffect(() => {
    setOn(onInit)
  }, [onInit])
  if (disabledWhenOn && on) {
    disabled = true
  }
  const buttonClassNames = ['modal']
  if (disabled) {
    buttonClassNames.push('disabled')
  }
  return (
    <button
      className={buttonClassNames.join(' ')}
      onClick={(e) => {
        e.preventDefault()
        if (!disabled) {
          const confirm = on ? confirmOn : confirmOff
          if (confirm && !confirm()) {
            return
          }
          let ret
          if (on) {
            if (callbackOn) {
              ret = callbackOn()
            }
          } else {
            ret = callbackOff()
          }
          if (ret) {
            ret.then(ret => {
              const { data, status } = ret
              if (status !== 200) {
                alert(`error operation failed with status=${status} data=${JSON.stringify(data)}`)
              } else if (onSuccess) {
                onSuccess(ret)
              }
            })
          }
          setOn((on) => !on)
        }
      }}
    >
      {on ? contentOn : contentOff}
    </button>
  )
}

export default ToggleButton
