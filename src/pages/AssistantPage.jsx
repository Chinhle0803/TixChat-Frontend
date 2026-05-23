import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertCircle, FiMapPin, FiSend, FiShield, FiZap } from 'react-icons/fi'
import { AIChatBubble, AISuggestionChip, Button } from '../components/ui'
import { assistantService } from '../services/api'
import useAuthStore from '../store/authStore'
import '../styles/AssistantPage.css'

const fallbackSuggestions = [
  'Khu vực gần tôi đang có sự cố gì?',
  'Có báo cáo ngập nước mới nào không?',
  'Điểm nóng giao thông hôm nay là ở đâu?',
  'Tôi nên mở bài báo cáo nào để theo dõi tiếp?',
]

const helperCards = [
  { icon: <FiMapPin />, title: 'Dữ liệu đô thị', text: 'Tổng hợp báo cáo giao thông, hạ tầng và môi trường từ cộng đồng.' },
  { icon: <FiShield />, title: 'Trả lời gọn', text: 'Nếu chưa đủ dữ liệu hoặc chưa rõ ngữ cảnh, assistant sẽ nói rõ hoặc hỏi lại.' },
  { icon: <FiZap />, title: 'Hành động nhanh', text: 'Mở bảng tin, bản đồ hoặc bài chi tiết ngay từ câu trả lời.' },
]

const createUserMessage = (content) => ({
  id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role: 'user',
  content,
})

const createAssistantMessage = (payload) => ({
  id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role: 'assistant',
  content: payload?.answer || 'Mình chưa có dữ liệu để trả lời.',
  relatedPosts: Array.isArray(payload?.relatedPosts) ? payload.relatedPosts : [],
  showIncidentCards: payload?.showIncidentCards === true,
  actions: Array.isArray(payload?.actions) ? payload.actions : [],
  disclaimer: payload?.disclaimer || '',
})

const extractErrorMessage = (error) =>
  String(error?.response?.data?.error || error?.message || 'Không thể kết nối trợ lý đô thị lúc này.')

const buildHistoryPayload = (messages = []) =>
  messages
    .slice(-6)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || '').trim(),
    }))
    .filter((message) => message.content)

const buildAssistantLocation = (user = {}) => {
  const location = user?.location && typeof user.location === 'object' ? user.location : {}
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  const payload = {
    address: String(location?.address || '').trim(),
    province: String(location?.province || user?.province || '').trim(),
    district: String(location?.district || user?.district || '').trim(),
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    payload.lat = lat
    payload.lng = lng
  }

  return Object.values(payload).some((value) => value !== '')
    ? payload
    : null
}

const AssistantPage = () => {
  const user = useAuthStore((state) => state.user)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [suggestions, setSuggestions] = useState(fallbackSuggestions)
  const [messages, setMessages] = useState([])
  const [errorMessage, setErrorMessage] = useState('')

  const hasMessages = messages.length > 0

  useEffect(() => {
    let active = true

    const loadSuggestions = async () => {
      try {
        const response = await assistantService.getUrbanSuggestions()
        const nextSuggestions = response?.data?.suggestions
        if (!active) return

        if (Array.isArray(nextSuggestions) && nextSuggestions.length > 0) {
          setSuggestions(nextSuggestions)
        }
      } catch (_) {
        if (active) {
          setSuggestions(fallbackSuggestions)
        }
      } finally {
        if (active) {
          setLoadingSuggestions(false)
        }
      }
    }

    loadSuggestions()

    return () => {
      active = false
    }
  }, [])

  const welcomeCards = useMemo(() => helperCards, [])

  const askAssistant = async (value = input) => {
    const question = String(value || '').trim()
    if (!question || loading) return

    const userMessage = createUserMessage(question)
    const requestHistory = buildHistoryPayload([...messages, userMessage])

    setMessages((current) => [...current, userMessage])
    setInput('')
    setLoading(true)
    setErrorMessage('')

    try {
      const payload = {
        question,
        history: requestHistory,
      }
      const assistantLocation = buildAssistantLocation(user)
      if (assistantLocation) {
        payload.location = assistantLocation
      }

      const response = await assistantService.urbanChat(payload)
      setMessages((current) => [...current, createAssistantMessage(response?.data)])
    } catch (error) {
      setErrorMessage(extractErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="assistant-page">
      <section className="assistant-shell">
        <header className="assistant-header">
          <div>
            <span className="assistant-eyebrow">Smart City Assistant</span>
            <h1>Trợ lý đô thị TixChat</h1>
          </div>
          <div className="assistant-orb" aria-hidden="true">AI</div>
        </header>

        {!hasMessages && (
          <section className="assistant-welcome">
            {/* <div className="assistant-helper-grid">
              {welcomeCards.map((card) => (
                <article key={card.title} className="assistant-helper-card">
                  <span>{card.icon}</span>
                  <h2>{card.title}</h2>
                  <p>{card.text}</p>
                </article>
              ))}
            </div> */}

            <div className="assistant-suggestions">
              {(loadingSuggestions ? fallbackSuggestions : suggestions).map((suggestion) => (
                <AISuggestionChip key={suggestion} onClick={() => askAssistant(suggestion)} disabled={loading}>
                  {suggestion}
                </AISuggestionChip>
              ))}
            </div>
          </section>
        )}

        {hasMessages && (
          <section className="assistant-thread" aria-live="polite">
            {messages.map((message) => (
              <AIChatBubble key={message.id} role={message.role}>
                <p>{message.content}</p>

                {message.disclaimer ? (
                  <div className="assistant-sources">{message.disclaimer}</div>
                ) : null}

                {message.showIncidentCards && message.relatedPosts?.length > 0 && (
                  <div className="assistant-related">
                    {message.relatedPosts.map((post) => (
                      <Link key={post.postId || post.title} to={post.target || post.detailTarget || '/urban/map'}>
                        <article>
                          <strong>{post.title}</strong>
                          <span>{post.status} · {post.location}</span>
                        </article>
                      </Link>
                    ))}
                  </div>
                )}

                {message.actions?.length > 0 && (
                  <div className="assistant-actions">
                    {message.actions.map((action) => (
                      <Button key={`${action.kind}-${action.target}`} as={Link} to={action.target} variant="secondary" size="sm">
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </AIChatBubble>
            ))}

            {loading ? (
              <AIChatBubble>
                <p>Assistant đang phân tích dữ liệu đô thị...</p>
              </AIChatBubble>
            ) : null}

            {errorMessage ? (
              <AIChatBubble>
                <p><FiAlertCircle aria-hidden="true" /> {errorMessage}</p>
              </AIChatBubble>
            ) : null}
          </section>
        )}

        <form
          className="assistant-composer"
          onSubmit={(event) => {
            event.preventDefault()
            askAssistant()
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Hỏi về giao thông, hạ tầng hoặc cảnh báo khu vực..."
          />
          <Button type="submit" icon={<FiSend />} disabled={!input.trim() || loading} loading={loading}>
            Gửi
          </Button>
        </form>
      </section>
    </main>
  )
}

export default AssistantPage
