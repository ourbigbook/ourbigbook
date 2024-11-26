/**
 * default: label and input on separate lines
 * inline: label and input on same line, take minimum horizontal space. Use case: checkbox
 *         we don't want clicking on line outside of label to activate
 * flex: label and input on same line, take maximum horizontal space. Use case: text area
 */
function Label({
  children=undefined,
  className='',
  label,
  // If given, the label appears on the same line as a child <input />
  inline=false,
  flex=false,
  wrap=true,
}) {
  const classes = []
  if (inline) {
    classes.push('inline')
  }
  if (flex) {
    classes.push('flex')
  }
  if (!wrap && className) {
    classes.push(className)
  }
  let ret = <label className={classes.join(' ')}>
    <span className={`label${inline ? ' inline' : ''}${flex ? ' flex' : ''}`}>{label}</span>
    {inline && ' '}
    {children}
  </label>
  if (wrap) {
    ret = <div className={className}>{ret}</div>
  }
  return ret
}

export default Label;
