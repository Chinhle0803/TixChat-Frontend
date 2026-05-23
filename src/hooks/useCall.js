import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
} from 'amazon-chime-sdk-js'
import { callService } from '../services/api'
import { getSocket } from '../services/socket'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value.userId || value.id || '')
  return String(value)
}

const terminalEvents = new Set(['call:declined', 'call:ended', 'call:missed'])

const waitForRender = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0)
      return
    }

    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })

const formatDuration = (totalSeconds = 0) => {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const getCallDurationSeconds = (call) => {
  if (!call) return 0
  if (Number.isFinite(Number(call.durationSeconds))) {
    return Number(call.durationSeconds)
  }

  const acceptedAt = Number(call.acceptedAt || call.answeredAt || 0)
  const endedAt = Number(call.endedAt || call.declinedAt || call.missedAt || Date.now())
  if (!acceptedAt) return 0
  return Math.max(0, Math.floor((endedAt - acceptedAt) / 1000))
}

const useCall = ({ currentUserId } = {}) => {
  const [incomingCall, setIncomingCall] = useState(null)
  const [currentCall, setCurrentCall] = useState(null)
  const [callPhase, setCallPhase] = useState('idle')
  const [callError, setCallError] = useState('')
  const [activeDurationSeconds, setActiveDurationSeconds] = useState(0)
  const [lastCallNotice, setLastCallNotice] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [remoteVideoTiles, setRemoteVideoTiles] = useState([])

  const meetingSessionRef = useRef(null)
  const pendingJoinInfoRef = useRef(null)
  const currentCallRef = useRef(null)
  const incomingCallRef = useRef(null)
  const acceptingCallIdRef = useRef('')
  const audioElementRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteVideoElementsRef = useRef(new Map())
  const remoteTileStatesRef = useRef(new Map())

  useEffect(() => {
    currentCallRef.current = currentCall
  }, [currentCall])

  useEffect(() => {
    incomingCallRef.current = incomingCall
  }, [incomingCall])

  const stopMeeting = useCallback(() => {
    const audioVideo = meetingSessionRef.current?.audioVideo
    if (audioVideo) {
      try {
        audioVideo.stopLocalVideoTile()
        audioVideo.stopVideoInput()
        audioVideo.stopAudioInput()
        audioVideo.stop()
      } catch (error) {
        console.warn('Failed to stop Chime session:', error?.message || error)
      }
    }

    meetingSessionRef.current = null
    pendingJoinInfoRef.current = null
    remoteVideoElementsRef.current.clear()
    remoteTileStatesRef.current.clear()
    setRemoteVideoTiles([])
    setIsMuted(false)
    setIsVideoEnabled(false)
    setActiveDurationSeconds(0)
  }, [])

  const resetCallState = useCallback(() => {
    stopMeeting()
    acceptingCallIdRef.current = ''
    setIncomingCall(null)
    setCurrentCall(null)
    setCallPhase('idle')
    setActiveDurationSeconds(0)
  }, [stopMeeting])

  const bindVideoTile = useCallback((audioVideo, tileState) => {
    if (!tileState?.boundAttendeeId || tileState.isContent) return

    if (tileState.localTile) {
      if (localVideoRef.current) {
        audioVideo.bindVideoElement(tileState.tileId, localVideoRef.current)
      }
      return
    }

    remoteTileStatesRef.current.set(tileState.tileId, tileState)
    setRemoteVideoTiles((prev) => {
      const nextTile = {
        tileId: tileState.tileId,
        attendeeId: tileState.boundAttendeeId,
      }
      const existingIndex = prev.findIndex((tile) => tile.tileId === tileState.tileId)
      if (existingIndex === -1) return [...prev, nextTile]

      const next = [...prev]
      next[existingIndex] = nextTile
      return next
    })

    const targetElement = remoteVideoElementsRef.current.get(tileState.tileId) || remoteVideoRef.current
    if (targetElement) {
      audioVideo.bindVideoElement(tileState.tileId, targetElement)
    }
  }, [])

  const setRemoteVideoElement = useCallback((tileId, element) => {
    if (!tileId) return

    if (!element) {
      remoteVideoElementsRef.current.delete(tileId)
      return
    }

    remoteVideoElementsRef.current.set(tileId, element)
    const audioVideo = meetingSessionRef.current?.audioVideo
    const tileState = remoteTileStatesRef.current.get(tileId)
    if (audioVideo && tileState) {
      audioVideo.bindVideoElement(tileId, element)
    }
  }, [])

  const joinMeeting = useCallback(async ({ meeting, attendee, call }) => {
    if (!meeting || !attendee || !call) {
      throw new Error('Missing Chime meeting data')
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Browser does not support camera or microphone access')
    }

    stopMeeting()
    setLastCallNotice(null)
    setCurrentCall(call)
    setCallPhase(call.status === 'accepted' ? 'active' : 'ringing')
    await waitForRender()

    const logger = new ConsoleLogger('TixChatChime', LogLevel.WARN)
    const deviceController = new DefaultDeviceController(logger)
    const configuration = new MeetingSessionConfiguration(meeting, attendee)
    const meetingSession = new DefaultMeetingSession(configuration, logger, deviceController)
    const audioVideo = meetingSession.audioVideo

    meetingSessionRef.current = meetingSession

    audioVideo.addObserver({
      audioVideoDidStop: () => {
        setIsVideoEnabled(false)
      },
      videoTileDidUpdate: (tileState) => bindVideoTile(audioVideo, tileState),
      videoTileWasRemoved: (tileId) => {
        remoteTileStatesRef.current.delete(tileId)
        remoteVideoElementsRef.current.delete(tileId)
        setRemoteVideoTiles((prev) => prev.filter((tile) => tile.tileId !== tileId))
      },
    })

    if (audioElementRef.current) {
      audioVideo.bindAudioElement(audioElementRef.current)
    } else {
      console.warn('Chime audio element is not ready yet')
    }

    const audioInputs = await audioVideo.listAudioInputDevices()
    if (audioInputs?.[0]?.deviceId) {
      await audioVideo.startAudioInput(audioInputs[0].deviceId)
    }

    audioVideo.start()

    if (call.callType === 'video') {
      const videoInputs = await audioVideo.listVideoInputDevices()
      if (videoInputs?.[0]?.deviceId) {
        await audioVideo.startVideoInput(videoInputs[0].deviceId)
        audioVideo.startLocalVideoTile()
        setIsVideoEnabled(true)
      }
    }

    setCallPhase(call.status === 'accepted' ? 'active' : 'ringing')
    setActiveDurationSeconds(getCallDurationSeconds(call))
    setCallError('')
  }, [bindVideoTile, stopMeeting])

  const startCall = useCallback(async (conversationId, callType) => {
    if (!conversationId || callPhase !== 'idle') return

    try {
      setCallError('')
      setLastCallNotice(null)
      setCallPhase('starting')
      const response = await callService.startCall(conversationId, callType)
      pendingJoinInfoRef.current = response.data
      setCurrentCall(response.data.call)
      setCallPhase('ringing')
    } catch (error) {
      resetCallState()
      setCallError(error?.response?.data?.error || error?.message || 'Cannot start call')
      throw error
    }
  }, [callPhase, resetCallState])

  const acceptCall = useCallback(async () => {
    if (!incomingCall?.callId) return

    const callId = incomingCall.callId
    acceptingCallIdRef.current = callId
    currentCallRef.current = incomingCall

    try {
      setCallError('')
      setLastCallNotice(null)
      setCurrentCall(incomingCall)
      setIncomingCall(null)
      setCallPhase('joining')
      const response = await callService.acceptCall(callId)
      await joinMeeting(response.data)
      setLastCallNotice({
        type: 'accepted',
        call: response.data.call,
        durationSeconds: 0,
      })
    } catch (error) {
      acceptingCallIdRef.current = ''
      resetCallState()
      setCallError(error?.response?.data?.error || error?.message || 'Cannot accept call')
      throw error
    }
  }, [incomingCall, joinMeeting, resetCallState])

  const declineCall = useCallback(async () => {
    const callId = incomingCall?.callId || currentCallRef.current?.callId
    if (!callId) return

    await callService.declineCall(callId)
    resetCallState()
  }, [incomingCall, resetCallState])

  const endCall = useCallback(async () => {
    const callId = currentCallRef.current?.callId || incomingCall?.callId
    if (!callId) {
      resetCallState()
      return
    }

    try {
      await callService.endCall(callId)
    } finally {
      resetCallState()
    }
  }, [incomingCall, resetCallState])

  const toggleMute = useCallback(() => {
    const audioVideo = meetingSessionRef.current?.audioVideo
    if (!audioVideo) return

    if (isMuted) {
      audioVideo.realtimeUnmuteLocalAudio()
      setIsMuted(false)
    } else {
      audioVideo.realtimeMuteLocalAudio()
      setIsMuted(true)
    }
  }, [isMuted])

  const toggleVideo = useCallback(async () => {
    const audioVideo = meetingSessionRef.current?.audioVideo
    if (!audioVideo || currentCallRef.current?.callType !== 'video') return

    if (isVideoEnabled) {
      audioVideo.stopLocalVideoTile()
      await audioVideo.stopVideoInput()
      setIsVideoEnabled(false)
      return
    }

    const videoInputs = await audioVideo.listVideoInputDevices()
    if (videoInputs?.[0]?.deviceId) {
      await audioVideo.startVideoInput(videoInputs[0].deviceId)
      audioVideo.startLocalVideoTile()
      setIsVideoEnabled(true)
    }
  }, [isVideoEnabled])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const handleIncoming = ({ call }) => {
      if (!call?.callId) return
      if (normalizeId(call.callerId) === normalizeId(currentUserId)) return
      if (acceptingCallIdRef.current === call.callId) return
      if (incomingCallRef.current?.callId === call.callId) return
      if (currentCallRef.current?.callId) return

      setLastCallNotice(null)
      setIncomingCall(call)
      setCallPhase('incoming')
    }

    const handleAccepted = async ({ call }) => {
      if (!call?.callId) return
      if (acceptingCallIdRef.current === call.callId) return

      if (currentCallRef.current?.callId === call.callId) {
        const pendingJoinInfo = pendingJoinInfoRef.current
        if (pendingJoinInfo?.call?.callId === call.callId && !meetingSessionRef.current) {
          try {
            await joinMeeting({ ...pendingJoinInfo, call })
            pendingJoinInfoRef.current = null
          } catch (error) {
            setCallError(error?.message || 'Cannot join call')
          }
          return
        }

        setCurrentCall(call)
        setActiveDurationSeconds(getCallDurationSeconds(call))
        setLastCallNotice({
          type: 'accepted',
          call,
          durationSeconds: 0,
        })
        setCallPhase('active')
      }
    }

    const handleTerminal = ({ call }) => {
      if (!call?.callId) return
      const activeId = currentCallRef.current?.callId
      const incomingId = incomingCall?.callId
      if (call.callId === activeId || call.callId === incomingId) {
        setLastCallNotice({
          type: call.status || 'ended',
          call,
          durationSeconds: getCallDurationSeconds(call),
        })
        resetCallState()
      }
    }

    socket.on('call:incoming', handleIncoming)
    socket.on('call:accepted', handleAccepted)
    terminalEvents.forEach((eventName) => socket.on(eventName, handleTerminal))

    return () => {
      socket.off('call:incoming', handleIncoming)
      socket.off('call:accepted', handleAccepted)
      terminalEvents.forEach((eventName) => socket.off(eventName, handleTerminal))
    }
  }, [currentUserId, incomingCall?.callId, resetCallState])

  useEffect(() => {
    if (callPhase !== 'active' || !currentCall) return undefined

    const updateDuration = () => {
      setActiveDurationSeconds(getCallDurationSeconds(currentCall))
    }

    updateDuration()
    const intervalId = setInterval(updateDuration, 1000)
    return () => clearInterval(intervalId)
  }, [callPhase, currentCall])

  useEffect(() => () => stopMeeting(), [stopMeeting])

  return {
    incomingCall,
    currentCall,
    callPhase,
    callError,
    activeDurationSeconds,
    activeDurationLabel: formatDuration(activeDurationSeconds),
    lastCallNotice,
    isMuted,
    isVideoEnabled,
    remoteVideoTiles,
    audioElementRef,
    localVideoRef,
    remoteVideoRef,
    setRemoteVideoElement,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    clearLastCallNotice: () => setLastCallNotice(null),
    clearCallError: () => setCallError(''),
  }
}

export default useCall
