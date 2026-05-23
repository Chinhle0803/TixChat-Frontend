import React, { createContext, useContext } from 'react'

const RealtimeContext = createContext({
  callControls: null,
})

export const RealtimeProvider = ({ value, children }) => (
  <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
)

export const useRealtimeContext = () => useContext(RealtimeContext)

export default RealtimeContext
