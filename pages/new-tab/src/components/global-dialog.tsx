import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@extension/ui/lib/components'
import type { GlobalDialogInnerProps } from '@src/provider'
import { GlobalDialogContext } from '@src/provider/global-dialog'
import { type ReactNode, useState, type FC } from 'react'

export const GlobalDialog: FC<{
  children: ReactNode
}> = ({ children }) => {
  const [dialogState, setDialogState] = useState<GlobalDialogInnerProps>({ open: false })
  return (
    <>
      <GlobalDialogContext.Provider value={[dialogState, setDialogState]}>{children}</GlobalDialogContext.Provider>
      <Dialog
        open={dialogState.open}
        onOpenChange={open => {
          setDialogState({ open })
        }}>
        <DialogContent>
          <DialogHeader>
            {dialogState.title && <DialogTitle>{dialogState.title}</DialogTitle>}
            {dialogState.description && <DialogDescription>{dialogState.description}</DialogDescription>}
          </DialogHeader>
          <div className={cn('min-w-[20rem] max-w-screen-xl', dialogState.className)}>
            {dialogState.showElement ?? null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
