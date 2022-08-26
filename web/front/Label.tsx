function Label({
  children=undefined,
  label,
  inline=false,
}) {
  return <label>
    <div className={`label${inline ? ' inline' : ''}`}>{label}</div>
    {children}
  </label>
}

export default Label;
