import { useState } from 'react'


import MarkdownRenderer from './MarkdownRenderer'
import './App.css'

function App() {
  return (
    <>
      <div className="w-full h-full flex flex-col items-center justify-center">
        <MarkdownRenderer />
      </div>
    </>
  )
}

export default App
