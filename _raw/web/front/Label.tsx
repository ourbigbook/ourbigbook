function Label({
  children=undefined,
  label,
  // If given, the label appears on the same line as a child <input />
  inline=false,
}) {
  return <label className={`${inline ? 'inline' : ''}`}>
    <div className={`label${inline ? ' inline' : ''}`}>{label}</div>
    {children}
  </label>
}

export default Label;
