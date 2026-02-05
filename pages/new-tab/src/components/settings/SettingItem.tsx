import { cn } from '@/lib/utils'
import { Space, Stack, Text } from '@extension/ui'
import type { LucideProps } from 'lucide-react'
import { type ElementType, type FC, type ReactElement } from 'react'

export const SettingItem: FC<{
  className?: string
  title: string
  description?: string
  control: ReactElement
  IconClass: ElementType<LucideProps>
  additionalControl?: ReactElement
}> = ({ control, title, className, description, IconClass, additionalControl }) => {
  return (
    <Stack
      direction={'row'}
      className={cn(
        'items-center overflow-hidden relative rounded-md p-3 border-slate-400/20',
        'bg-muted gap-2',
        className,
      )}>
      <IconClass className="min-w-8 size-8 text-muted-foreground" />
      <Stack direction={'column'} className="gap-0.5">
        <Text className="font-medium" level="md">
          {title}
        </Text>
        <Text gray className="-mt-1 max-w-[20em]" level="s">
          {description}
        </Text>
      </Stack>
      <Space className="mx-1" />
      <div className="max-w-[50%]">{control}</div>
      {additionalControl}
    </Stack>
  )
}
