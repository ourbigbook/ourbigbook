import Footer from "components/common/Footer"
import Navbar from "components/common/Navbar"

export default function Layout({ children, isEditor }) {
  return (
    <>
      <div className={`toplevel${isEditor ? ' editor' : ''}`}>
        <Navbar />
        <div className="main">
          {children}
        </div>
        {!isEditor &&
          <Footer />
        }
      </div>
    </>
  )
}
