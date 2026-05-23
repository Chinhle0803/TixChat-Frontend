import React from 'react'
import './ui.css'

const cx = (...classes) => classes.filter(Boolean).join(' ')
const variantAlias = {
  primary: 'default',
  danger: 'destructive',
}

export const Button = ({
  as: Component = 'button',
  variant = 'default',
  size = 'default',
  icon,
  loading,
  className,
  children,
  ...props
}) => {
  const resolvedVariant = variantAlias[variant] || variant

  return (
    <Component
      className={cx('tc-button', `tc-button-${resolvedVariant}`, `tc-button-${size}`, className)}
      {...props}
    >
      {loading ? <span className="tc-spinner" aria-hidden="true" /> : icon ? <span className="tc-button-leading-icon">{icon}</span> : null}
      {children ? <span>{children}</span> : null}
    </Component>
  )
}

export const Card = ({ className, children, ...props }) => (
  <section className={cx('tc-card', className)} {...props}>{children}</section>
)

export const CardHeader = ({ className, children, ...props }) => (
  <header className={cx('tc-card-header', className)} {...props}>{children}</header>
)

export const CardTitle = ({ className, children, ...props }) => (
  <h3 className={cx('tc-card-title', className)} {...props}>{children}</h3>
)

export const CardDescription = ({ className, children, ...props }) => (
  <p className={cx('tc-card-description', className)} {...props}>{children}</p>
)

export const CardAction = ({ className, children, ...props }) => (
  <div className={cx('tc-card-action', className)} {...props}>{children}</div>
)

export const CardContent = ({ className, children, ...props }) => (
  <div className={cx('tc-card-content', className)} {...props}>{children}</div>
)

export const CardFooter = ({ className, children, ...props }) => (
  <footer className={cx('tc-card-footer', className)} {...props}>{children}</footer>
)

export const Input = ({ className, ...props }) => (
  <input className={cx('tc-input', className)} {...props} />
)

export const Textarea = ({ className, ...props }) => (
  <textarea className={cx('tc-input', 'tc-textarea', className)} {...props} />
)

export const SearchInput = ({ icon, className, ...props }) => (
  <label className={cx('tc-search', className)}>
    {icon ? <span className="tc-search-icon">{icon}</span> : null}
    <input {...props} />
  </label>
)

export const SearchBar = SearchInput

export const Tabs = ({ value, onValueChange, items = [], className }) => (
  <div className={cx('tc-tabs', className)} role="tablist">
    {items.map((item) => (
      <button
        key={item.value}
        type="button"
        role="tab"
        aria-selected={value === item.value}
        className={cx('tc-tabs-trigger', value === item.value && 'active')}
        onClick={() => onValueChange?.(item.value)}
      >
        {item.label}
      </button>
    ))}
  </div>
)

export const TabsList = ({ className, children, ...props }) => (
  <div className={cx('tc-tabs', className)} role="tablist" {...props}>{children}</div>
)

export const TabsTrigger = ({ active, className, children, ...props }) => (
  <button type="button" role="tab" aria-selected={active} className={cx('tc-tabs-trigger', active && 'active', className)} {...props}>
    {children}
  </button>
)

export const Avatar = ({ src, name = 'TixChat', size = 'md', online, group, className }) => {
  const initials = String(name || 'TC')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'TC'

  return (
    <span className={cx('tc-avatar', `tc-avatar-${size}`, group && 'tc-avatar-group', className)}>
      {src ? <img src={src} alt={name} /> : <span>{initials}</span>}
      {online ? <i className="tc-online-dot" aria-label="Đang online" /> : null}
    </span>
  )
}

export const Badge = ({ tone = 'neutral', className, children }) => (
  <span className={cx('tc-badge', `tc-badge-${tone}`, className)}>{children}</span>
)

export const Separator = ({ className }) => <span className={cx('tc-separator', className)} aria-hidden="true" />

export const Sheet = ({ open, onClose, title, side = 'right', children, footer }) => {
  if (!open) return null

  return (
    <div className="tc-sheet-overlay" onClick={onClose}>
      <aside className={cx('tc-sheet', `tc-sheet-${side}`)} onClick={(event) => event.stopPropagation()}>
        <header className="tc-sheet-header">
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
        </header>
        <div className="tc-sheet-body">{children}</div>
        {footer ? <footer className="tc-sheet-footer">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export const EmptyState = ({ icon, title, description, action }) => (
  <div className="tc-empty-state">
    {icon ? <div className="tc-empty-icon">{icon}</div> : null}
    <h3>{title}</h3>
    {description ? <p>{description}</p> : null}
    {action}
  </div>
)

export const Skeleton = ({ className }) => <span className={cx('tc-skeleton', className)} />

export const ModalShell = ({ title, children, footer, onClose }) => (
  <div className="tc-modal-overlay" onClick={onClose}>
    <section className="tc-modal" onClick={(event) => event.stopPropagation()}>
      <header>
        <h3>{title}</h3>
        {onClose ? <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button> : null}
      </header>
      <div className="tc-modal-body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </section>
  </div>
)

export const IncidentStatusBadge = ({ status }) => {
  const map = {
    pending: ['warning', 'Mới'],
    new: ['warning', 'Mới'],
    in_progress: ['info', 'Đang xử lý'],
    resolved: ['success', 'Đã xử lý'],
  }
  const [tone, label] = map[status] || ['neutral', 'Mới']
  return <Badge tone={tone}>{label}</Badge>
}

export const SeverityBadge = ({ severity = 'medium' }) => {
  const map = {
    low: ['success', 'Thấp'],
    medium: ['info', 'Trung bình'],
    high: ['warning', 'Cao'],
    critical: ['danger', 'Khẩn cấp'],
  }
  const [tone, label] = map[severity] || map.medium
  return <Badge tone={tone}>{label}</Badge>
}

export const AIChatBubble = ({ role = 'assistant', children }) => (
  <div className={cx('tc-ai-bubble', role === 'user' && 'tc-ai-bubble-user')}>{children}</div>
)

export const AISuggestionChip = ({ children, ...props }) => (
  <button type="button" className="tc-ai-chip" {...props}>{children}</button>
)
