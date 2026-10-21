import type { FC } from 'react'
import { t } from '@/utils/i18n'

import { Button, Stack, Input } from '@/components/shared'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
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
  onSubmit: (item: IAddQuickUrlItemShema) => void | Promise<void>
  submitButtonTitle: string
  defaultValue?: IAddQuickUrlItemShema
  suggestions?: IAddQuickUrlItemShema[]
  suggestionsLoading?: boolean
  submitError?: string
}

export const QuickItemEditForm: FC<QuickItemEditFormProps> = ({
  onSubmit,
  submitButtonTitle,
  defaultValue,
  suggestions,
  suggestionsLoading = false,
  submitError,
}) => {
  const addQuickUrlItemform = useForm<IAddQuickUrlItemShema>({
    resolver: zodResolver(addQuickUrlItemShema),
    defaultValues: defaultValue ?? { title: '', url: '' },
  })
  const values = addQuickUrlItemform.watch()
  const submitting = addQuickUrlItemform.formState.isSubmitting
  return (
    <Form {...addQuickUrlItemform}>
      <form className="min-w-0" onSubmit={addQuickUrlItemform.handleSubmit(onSubmit)}>
        {(suggestionsLoading || !!suggestions?.length) && (
          <section
            className="nt-add-suggestions"
            aria-labelledby="quick-link-suggestions-heading"
            aria-busy={suggestionsLoading}>
            <div className="nt-add-suggestions-heading">
              <h3 id="quick-link-suggestions-heading">{t('recentPagesHeading')}</h3>
              <span>{t('quickLinkSuggestionHint')}</span>
            </div>
            {suggestionsLoading ? (
              <p className="text-muted-foreground text-sm" role="status">
                {t('loading')}
              </p>
            ) : (
              <div className="nt-add-suggestion-list">
                {suggestions?.map(site => (
                  <button
                    key={site.url}
                    type="button"
                    disabled={submitting}
                    className="nt-add-suggestion"
                    data-testid="quick-link-suggestion"
                    aria-pressed={values.title === site.title && values.url === site.url}
                    title={`${site.title}\n${site.url}`}
                    onClick={event => {
                      addQuickUrlItemform.setValue('title', site.title, { shouldDirty: true, shouldValidate: true })
                      addQuickUrlItemform.setValue('url', site.url, { shouldDirty: true, shouldValidate: true })
                      event.currentTarget.form?.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
                    }}>
                    <QuickLinkIcon title={site.title} url={site.url} className="nt-add-suggestion-icon" />
                    <span className="min-w-0 truncate">{site.title}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        <Stack direction={'column'} className="gap-4">
          <FormField
            control={addQuickUrlItemform.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('siteName')}</FormLabel>
                <FormControl>
                  <Input id="quick-link-title" placeholder="e.g. GitHub" readOnly={submitting} {...field} />
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
                  <Input id="quick-link-url" placeholder="https://example.com" readOnly={submitting} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {submitError && (
            <p className="text-destructive text-sm" role="alert">
              {submitError}
            </p>
          )}
          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitButtonTitle}
          </Button>
        </Stack>
      </form>
    </Form>
  )
}
