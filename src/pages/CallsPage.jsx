import React from 'react'
import { FiClock, FiMic, FiPhone, FiVideo } from 'react-icons/fi'
import { EmptyState } from '../components/ui'
import '../styles/CallsPage.css'

const CallsPage = () => (
  <main className="calls-page">
    <section className="calls-shell">
      <header className="calls-header">
        <div>
          <span>Realtime calls</span>
          <h1>Cuộc gọi</h1>
          <p>Theo dõi cuộc gọi đang diễn ra, cuộc gọi gần đây và các phiên bị lỡ.</p>
        </div>
      </header>

      <div className="calls-grid">
        <article className="call-card active">
          <span className="call-card-icon"><FiPhone /></span>
          <div>
            <h2>Không có cuộc gọi đang hoạt động</h2>
            <p>Khi bạn bắt đầu audio/video call từ chat, trạng thái kết nối sẽ xuất hiện ở đây.</p>
          </div>
        </article>

        <article className="call-card">
          <span className="call-card-icon"><FiVideo /></span>
          <div>
            <h2>Video nhóm</h2>
            <p>Amazon Chime SDK đã được giữ nguyên, UI call mới dùng tile responsive và control bar an toàn.</p>
          </div>
        </article>

        <article className="call-card">
          <span className="call-card-icon"><FiMic /></span>
          <div>
            <h2>Điều khiển rõ ràng</h2>
            <p>Mute, camera, speaker và kết thúc cuộc gọi được tách vùng để giảm bấm nhầm.</p>
          </div>
        </article>
      </div>

      <EmptyState
        icon={<FiClock />}
        title="Chưa có lịch sử cuộc gọi"
        description="Backend hiện chưa cung cấp call history riêng. Màn hình này đã sẵn sàng để nối dữ liệu recent/missed calls khi endpoint có sẵn."
      />
    </section>
  </main>
)

export default CallsPage
