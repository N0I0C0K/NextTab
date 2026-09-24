import { useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'

export function Grid() {
  const [, setItems] = useState(Array.from({ length: 30 }, (_, idx) => idx))

  return (
    <DragDropProvider
      onDragEnd={event => {
        setItems(prevItems => move(prevItems, event))
      }}>
      <div className="grid grid-cols-6"></div>
    </DragDropProvider>
  )
}
