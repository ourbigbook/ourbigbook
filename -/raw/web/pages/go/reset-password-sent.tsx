import {
  MyHead,
  UserIcon,
} from 'front'

export default function ResetPasswordSentPage() {
  const title = 'Reset password email sent'
  return <>
    <MyHead title={title} />
    <div className="reset-password-page content-not-ourbigbook">
      <h1><UserIcon /> {title}</h1>
      <p>A password reset email has been sent to your email address.</p>
      <p>Please click the link in that email to reset your password.</p>
    </div>
  </>
}
