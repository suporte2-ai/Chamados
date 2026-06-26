import { Outlet } from 'react-router-dom'

export default function AppShell() {
  return (
    <div className="flex h-screen">
      <main className="flex-1 p-4"><Outlet /></main>
    </div>
  )
}
