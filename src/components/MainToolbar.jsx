import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiCpu,
  FiLogOut,
  FiMapPin,
  FiMessageSquare,
  FiSettings,
  FiUser,
} from 'react-icons/fi'
import useAuthStore from '../store/authStore'
import useThemeStore from '../store/themeStore'
import '../styles/MainToolbar.css'

const MainToolbar = ({ collapsed = false, onToggleCollapsed }) => {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const { theme, cycleTheme } = useThemeStore()

  const handleLogout = async () => {
    await logout()
    navigate('/auth/login')
  }

  return (
    <aside className={`main-toolbar ${collapsed ? 'collapsed' : ''}`} aria-label="Thanh công cụ chính">
      <div className="main-toolbar-brand" title="TixChat">
        <NavLink to="/chat" aria-label="TixChat">
          <img src="/logo.png" alt="TixChat Logo" />
        </NavLink>
        <strong>TixChat</strong>
      </div>

      <nav className="main-toolbar-actions" aria-label="Điều hướng chính">
        <NavLink to="/chat" className="main-toolbar-action" title="Chat" aria-label="Chat">
          <FiMessageSquare />
          <span>Chat</span>
        </NavLink>

        <NavLink to="/urban" className="main-toolbar-action" title="Bảng tin đô thị" aria-label="Bảng tin đô thị">
          <FiMapPin />
          <span>Urban</span>
        </NavLink>

        <NavLink to="/assistant" className="main-toolbar-action" title="Assistant" aria-label="Assistant">
          <FiCpu />
          <span>AI</span>
        </NavLink>

        <NavLink to="/profile" className="main-toolbar-action" title="Hồ sơ" aria-label="Hồ sơ">
          <FiUser />
          <span>Profile</span>
        </NavLink>

        <button
          type="button"
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
          aria-label="Đổi giao diện sáng tối"
          className="main-toolbar-action"
        >
          <FiSettings />
          <span>{theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}</span>
        </button>
      </nav>

      <div className="main-toolbar-footer">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Mở rộng thanh công cụ' : 'Thu gọn thanh công cụ'}
          aria-label={collapsed ? 'Mở rộng thanh công cụ' : 'Thu gọn thanh công cụ'}
          className="main-toolbar-action main-toolbar-toggle"
        >
          {collapsed ? <FiChevronsRight /> : <FiChevronsLeft />}
          <span>{collapsed ? 'Mở' : 'Thu gọn'}</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          title="Đăng xuất"
          aria-label="Đăng xuất"
          className="main-toolbar-action"
        >
          <FiLogOut />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default MainToolbar
