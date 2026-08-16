import { Popover, Center, PopoverTrigger, Button, PopoverContent } from '@extension/ui'
import { Plus } from 'lucide-react'
import { quickUrlItemsStorage } from '@extension/storage'
import { nanoid } from 'nanoid'
import type { FC } from 'react'
import { cn } from '@newtab/lib/utils'
import type { IAddQuickUrlItemShema } from './quick-item-edit-form'
import { QuickItemEditForm } from './quick-item-edit-form'

function onSubmit(value: IAddQuickUrlItemShema) {
  quickUrlItemsStorage.add({
    title: value.title,
    url: value.url,
    id: nanoid(),
  })
}

export const AddButton: FC<{ className?: string }> = ({ className }) => {
  return (
    <>
      <Popover>
        <Center column>
          <PopoverTrigger asChild>
            <Button size={'icon'} variant={'ghost'} className={cn('rounded-full', className)}>
              <Plus />
            </Button>
          </PopoverTrigger>
        </Center>
        <PopoverContent className="">
          <QuickItemEditForm onSubmit={onSubmit} submitButtonTitle="Add" />
        </PopoverContent>
      </Popover>
    </>
  )
}
