function Label({ children, label }) {
  return <label>
    <div className="label">{label}</div>
    {children}
  </label>
}

export default Label;
