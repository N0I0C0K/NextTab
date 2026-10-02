import { Button } from '@/components/shared'
import { t } from '@/utils/i18n'
import type { FC, ReactElement } from 'react'
import { createContext, useCallback, useContext } from 'react'

export interface GlobalDialogProps {
  show: (element: ReactElement, title?: string, description?: string, className?: string) => void
  confirm: (title: string, description: string, onConfirm: () => void) => void
  close: () => void
}

const RenderDefaultConfirmDialog: FC<{
  onConfirm: () => void
  onCancel: () => void
}> = ({ onConfirm, onCancel }) => {
  return (
    <div className="flex w-full flex-row-reverse gap-3">
      <Button variant={'secondary'} onClick={onConfirm}>
        {t('confirm')}
      </Button>
      <Button onClick={onCancel}>{t('cancel')}</Button>
    </div>
  )
}

export function useGlobalDialog(): GlobalDialogProps {
  const [, setInnerProps] = useInnerGlobalDialog()
  const show = useCallback(
    (element: ReactElement, title?: string, description?: string, className?: string) => {
      setInnerProps({
        showElement: element,
        title,
        description,
        className,
        open: true,
      })
    },
    [setInnerProps],
  )
  const close = useCallback(() => {
    setInnerProps({ open: false })
  }, [setInnerProps])

  const confirm = useCallback(
    (title: string, description: string, onConfirm: () => void) => {
      setInnerProps({
        open: true,
        title,
        description,
        showElement: <RenderDefaultConfirmDialog onConfirm={onConfirm} onCancel={close} />,
      })
    },
    [close, setInnerProps],
  )
  return { show, close, confirm }
}

export interface GlobalDialogInnerProps {
  showElement?: ReactElement
  title?: string
  description?: string
  /** Classes for the outer DialogContent, including responsive sizing. */
  className?: string
  open: boolean
}

export const GlobalDialogContext = createContext<
  [GlobalDialogInnerProps, React.Dispatch<React.SetStateAction<GlobalDialogInnerProps>>]
>([{ open: false }, () => {}])

export function useInnerGlobalDialog(): [
  GlobalDialogInnerProps,
  React.Dispatch<React.SetStateAction<GlobalDialogInnerProps>>,
] {
  const [innerProps, setInnerProps] = useContext(GlobalDialogContext)
  return [innerProps, setInnerProps]
}
