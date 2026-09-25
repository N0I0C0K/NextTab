import { cn } from '@/entrypoints/newtab/lib/utils'
import { Space, Stack, Text } from '@/components/shared'
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
      className={cn('items-center relative rounded-lg border border-border bg-card p-4 gap-3', className)}>
      <IconClass className="shrink-0 size-6 text-muted-foreground" aria-hidden="true" />
      <Stack direction={'column'} className="gap-0.5" data-slot="setting-item-copy">
        <Text className="font-medium" level="md">
          {title}
        </Text>
        <Text gray className="-mt-1 max-w-[20em]" level="s">
          {description}
        </Text>
      </Stack>
      <Space className="mx-1" />
      <div className="max-w-[50%]" data-slot="setting-item-control">
        {control}
      </div>
      {additionalControl}
    </Stack>
  )
}
