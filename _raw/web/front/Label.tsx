/**
 * default: label and input on separate lines
 * inline: label and input on same line, take minimum horizontal space. Use case: checkbox
 *         we don't want clicking on line outside of label to activate
 * flex: label and input on same line, take maximum horizontal space. Use case: text area
 */
function Label({
  children=undefined,
  label,
  // If given, the label appears on the same line as a child <input />
  inline=false,
  flex=false,
}) {
  return <div><label className={`${inline ? 'inline' : ''}${flex ? 'flex' : ''}`}>
    <div className={`label${inline ? ' inline' : ''}${flex ? ' flex' : ''}`}>{label}</div>
    {inline && ' '}
    {children}
  </label></div>
}

export default Label;
