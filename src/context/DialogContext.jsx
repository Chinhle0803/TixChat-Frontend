import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import '../styles/DialogModal.css'

const DialogContext = createContext(null)

export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null)
  const [promptValue, setPromptValue] = useState('')
  const resolverRef = useRef(null)

  const closeDialog = useCallback((result = false) => {
    setDialog(null)
    setPromptValue('')

    if (typeof resolverRef.current === 'function') {
      resolverRef.current(result)
    }

    resolverRef.current = null
  }, [])

  const notify = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({
        type: 'notify',
        title: options?.title || 'Thông báo',
        message: options?.message || '',
        confirmText: options?.confirmText || 'Đóng',
        variant: options?.variant || 'info',
      })
    })
  }, [])

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({
        type: 'confirm',
        title: options?.title || 'Xác nhận',
        message: options?.message || '',
        confirmText: options?.confirmText || 'Đồng ý',
        cancelText: options?.cancelText || 'Hủy',
        variant: options?.variant || 'warning',
      })
    })
  }, [])

  const prompt = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve

      const defaultValue =
        typeof options?.defaultValue === 'string' ? options.defaultValue : ''

      setPromptValue(defaultValue)
      setDialog({
        type: 'prompt',
        title: options?.title || 'Nhập thông tin',
        message: options?.message || '',
        confirmText: options?.confirmText || 'Xác nhận',
        cancelText: options?.cancelText || 'Hủy',
        placeholder: options?.placeholder || '',
        variant: options?.variant || 'info',
      })
    })
  }, [])

  const value = useMemo(
    () => ({
      notify,
      confirm,
      prompt,
    }),
    [notify, confirm, prompt]
  )

  const handleOverlayClose = () => {
    if (dialog?.type === 'prompt') {
      closeDialog(null)
      return
    }

    closeDialog(false)
  }

  const handleConfirm = () => {
    if (dialog?.type === 'prompt') {
      closeDialog(promptValue)
      return
    }

    closeDialog(true)
  }

  const handleCancel = () => {
    if (dialog?.type === 'prompt') {
      closeDialog(null)
      return
    }

    closeDialog(false)
  }

  return (
    <DialogContext.Provider value={value}>
      {children}

      {dialog && (
        <div className="app-dialog-overlay" onClick={handleOverlayClose}>
          <div className="app-dialog-modal" onClick={(event) => event.stopPropagation()}>
            <div className="app-dialog-header">
              <h3 className={`app-dialog-title ${dialog.variant || 'info'}`}>{dialog.title}</h3>
            </div>

            <div className="app-dialog-body">
              {dialog.message ? <p>{dialog.message}</p> : null}

              {dialog.type === 'prompt' && (
                <input
                  type="text"
                  className="app-dialog-input"
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  placeholder={dialog.placeholder || ''}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleConfirm()
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      handleCancel()
                    }
                  }}
                />
              )}
            </div>

            <div className="app-dialog-footer">
              {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
                <button
                  type="button"
                  className="app-dialog-btn secondary"
                  onClick={handleCancel}
                >
                  {dialog.cancelText || 'Hủy'}
                </button>
              )}

              <button
                type="button"
                className={`app-dialog-btn primary ${dialog.variant || 'info'}`}
                onClick={handleConfirm}
              >
                {dialog.confirmText || 'Đóng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export const useDialog = () => {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider')
  }
  return context
}
