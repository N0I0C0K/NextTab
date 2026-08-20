import type { ComponentType, FC, ReactNode } from 'react'

import { useSortable } from '@dnd-kit/react/sortable'
import { DragOverlay, useDragOperation } from '@dnd-kit/react'

export function SortableItem({ id, index, children }: { id: string | number; index: number; children: ReactNode }) {
  const { ref } = useSortable({ id, index })

  return <div ref={ref}>{children}</div>
}

export function MakeSortableItem<P>(Component: ComponentType<P>): FC<P & { id: string | number; index: number }> {
  const WrapSortableItem: FC<P & { id: string | number; index: number }> = props => {
    return (
      <SortableItem id={props.id} index={props.index}>
        <Component {...props} />
      </SortableItem>
    )
  }
  return WrapSortableItem
}

export function DraggableOverlay() {
  const { source } = useDragOperation()

  return <DragOverlay>{source ? <p>temp</p> : null}</DragOverlay>
}
