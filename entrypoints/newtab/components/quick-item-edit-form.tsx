import type { FC } from 'react'
import { t } from '@/utils/i18n'

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
    defaultValues: defaultValue ?? { title: '', url: '' },
  })
  return (
    <Form {...addQuickUrlItemform}>
      <form onSubmit={addQuickUrlItemform.handleSubmit(onSubmit)}>
        <Stack direction={'column'} className="gap-4">
          <FormField
            control={addQuickUrlItemform.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('siteName')}</FormLabel>
                <FormControl>
                  <Input id="quick-link-title" placeholder="e.g. GitHub" {...field} />
                </FormControl>
                <FormDescription>{t('siteNameDescription')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={addQuickUrlItemform.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('websiteUrl')}</FormLabel>
                <FormControl>
                  <Input id="quick-link-url" placeholder="https://example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="mt-2 w-full">
            {submitButtonTitle}
          </Button>
        </Stack>
      </form>
    </Form>
  )
}
