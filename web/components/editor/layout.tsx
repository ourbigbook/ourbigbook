import Footer from "components/common/Footer"
import Navbar from "components/common/Navbar"

export default function EditorLayout({ children }) {
  return (
    <>
      <div className="toplevel">
        <Navbar />
        <div className="main">
          {children}
        </div>
        <Footer />
      </div>
    </>
  )
}
