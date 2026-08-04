import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function MainLayout() {
  return (
    <div className="command-shell">
      <div className="command-grid" aria-hidden="true" />
      <Sidebar />
      <section className="command-workspace">
        <Header />
        <main className="command-content">
          <div className="command-content-frame">
            <Outlet />
          </div>
        </main>
      </section>
    </div>
  )
}
