import type { FC } from 'react'

import { Button, Stack, Input } from '@/components/shared'
import {
  z,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
  zodResolver,
} from '@/components/shared/ui/form'

const addQuickUrlItemShema = z.object({
  title: z.string(),
  url: z.string().url(),
})

export interface IAddQuickUrlItemShema extends z.infer<typeof addQuickUrlItemShema> {}

export interface QuickItemEditFormProps {
  onSubmit: (item: IAddQuickUrlItemShema) => void
  submitButtonTitle: string
  defaultValue?: IAddQuickUrlItemShema
}

export const QuickItemEditForm: FC<QuickItemEditFormProps> = ({ onSubmit, submitButtonTitle, defaultValue }) => {
  const addQuickUrlItemform = useForm<IAddQuickUrlItemShema>({
    resolver: zodResolver(addQuickUrlItemShema),
    values: defaultValue,
  })
  return (
    <Form {...addQuickUrlItemform}>
      <form onSubmit={addQuickUrlItemform.handleSubmit(onSubmit)}>
        <Stack direction={'column'} className="gap-2">
          <FormField
            control={addQuickUrlItemform.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input id="quick-link-title" className="h-8" {...field} />
                </FormControl>
                <FormDescription>Specify a name to display</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={addQuickUrlItemform.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Url</FormLabel>
                <FormControl>
                  <Input id="quick-link-url" className="h-8" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="mt-4">
            {submitButtonTitle}
          </Button>
        </Stack>
      </form>
    </Form>
  )
}
