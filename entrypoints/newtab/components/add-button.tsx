import { Popover, Center, PopoverTrigger, Button, PopoverContent } from '@/components/shared'
import { Plus } from 'lucide-react'
import { addQuickUrl } from '@/utils/storage'
import { nanoid } from 'nanoid'
import type { FC } from 'react'
import { cn } from '@/entrypoints/newtab/lib/utils'
import type { IAddQuickUrlItemShema } from './quick-item-edit-form'
import { QuickItemEditForm } from './quick-item-edit-form'

function onSubmit(value: IAddQuickUrlItemShema) {
  addQuickUrl({
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
            <Button
              size={'icon'}
              variant={'ghost'}
              className={cn('rounded-full', className)}
              aria-label="Add quick link"
              data-testid="add-quick-link">
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
