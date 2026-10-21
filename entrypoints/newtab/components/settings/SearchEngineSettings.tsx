import { useCallback, useId, useState } from 'react'
import { ArrowDown, ArrowUp, Globe, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { Button, Input, Switch, useDialogCloseGuard } from '@/components/shared'
import {
  saveSearchEngine,
  updateSearchEngine,
  moveSearchEngine,
  removeSearchEngine,
  restoreSearchEngine,
} from '@/utils/storage'
import { useSearchEngines } from '@/hooks/useSearchEngines'
import {
  buildSearchUrl,
  MAX_SEARCH_ENGINES,
  usableSearchEngines,
  validateEngineInput,
  type SearchEngine,
} from '@/utils/search-engines'
import { t } from '@/utils/i18n'

type Draft = { id?: string; name: string; url: string; enabled: boolean }

export function SearchEngineSettings() {
  const { value: stored, loading, error, retry } = useSearchEngines()
  const engines = usableSearchEngines(stored)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [initial, setInitial] = useState('')
  const [preview, setPreview] = useState('nexttab')
  const [discard, setDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<string>()
  const id = useId()
  useDialogCloseGuard(
    useCallback(() => {
      if (!draft) return true
      if (JSON.stringify(draft) === initial) setDraft(null)
      else setDiscard(true)
      return false
    }, [draft, initial]),
  )
  const operation = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch {
      toast.error(t('engineSaveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const edit = (engine?: SearchEngine) => {
    const value: Draft = engine ?? { name: '', url: '', enabled: true }
    setDraft(value)
    setInitial(JSON.stringify(value))
    setDiscard(false)
  }
  const cancel = () => {
    if (!draft) return
    if (JSON.stringify(draft) !== initial) setDiscard(true)
    else setDraft(null)
  }
  if (loading && !engines.length) return <p role="status">{t('loading')}</p>
  if (error)
    return (
      <p role="status">
        {t('navigationReadFailed')}{' '}
        <Button variant="outline" type="button" onClick={retry}>
          {t('retryAction')}
        </Button>
      </p>
    )
  if (draft) {
    const errors = validateEngineInput(draft, engines, draft.id)
    const valid = !errors.name && !errors.url
    return (
      <form
        className="nt-engine-editor"
        data-testid="engine-editor"
        onSubmit={event => {
          event.preventDefault()
          if (!valid || busy) return
          void operation(async () => {
            await saveSearchEngine({ ...draft, id: draft.id ?? nanoid() }, !!draft.id)
            setDraft(null)
            setMenu(undefined)
            toast.success(t('engineSaved'))
          })
        }}>
        <h3>{t(draft.id ? 'engineEdit' : 'engineAdd')}</h3>
        <label htmlFor={id + '-name'}>{t('engineName')}</label>
        <Input
          id={id + '-name'}
          data-testid="engine-name"
          value={draft.name}
          maxLength={40}
          aria-invalid={!!errors.name}
          aria-describedby={id + '-name-error'}
          disabled={busy}
          onChange={event => setDraft({ ...draft, name: event.target.value })}
        />
        <p id={id + '-name-error'} className="nt-engine-error" role="status">
          {errors.name ? t(errors.name) : ''}
        </p>
        <label htmlFor={id + '-url'}>{t('engineUrl')}</label>
        <Input
          id={id + '-url'}
          data-testid="engine-url"
          value={draft.url}
          placeholder="https://github.com/search?q=%s"
          aria-invalid={!!errors.url}
          aria-describedby={id + '-url-help ' + id + '-url-error'}
          disabled={busy}
          onChange={event => setDraft({ ...draft, url: event.target.value })}
        />
        <p id={id + '-url-help'} className="text-muted-foreground text-xs">
          {t('engineTemplateHelp')}
        </p>
        <p id={id + '-url-error'} className="nt-engine-error" role="status">
          {errors.url ? t(errors.url) : ''}
        </p>
        <label htmlFor={id + '-preview'}>{t('enginePreviewQuery')}</label>
        <Input id={id + '-preview'} value={preview} onChange={event => setPreview(event.target.value)} />
        <output className="nt-engine-preview" data-testid="engine-url-preview">
          {valid && preview.trim() ? buildSearchUrl(draft.url, preview) : t('enginePreviewPlaceholder')}
        </output>
        {discard && (
          <div className="nt-engine-discard" role="alert">
            <p>{t('engineDiscardQuestion')}</p>
            <Button type="button" variant="outline" onClick={() => setDiscard(false)}>
              {t('engineContinueEditing')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(null)
                setDiscard(false)
              }}>
              {t('engineDiscard')}
            </Button>
          </div>
        )}
        <div className="nt-engine-form-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" data-testid="engine-save" disabled={!valid || busy}>
            {t('engineSave')}
          </Button>
        </div>
      </form>
    )
  }
  return (
    <section className="nt-engine-settings" data-testid="engine-settings">
      <h3>{t('engineManage')}</h3>
      <div className="nt-engine-row">
        <Globe size={20} />
        <div className="nt-engine-copy">
          <strong>{t('engineBrowserDefault')}</strong>
          <span>{t('engineBrowserDescription')}</span>
        </div>
        <span className="nt-engine-badge">{t('engineDefault')}</span>
      </div>
      {engines.length !== (Array.isArray(stored) ? stored.length : 0) && (
        <p role="status" className="nt-engine-error">
          {t('engineInvalidConfig')}
        </p>
      )}
      {engines.map((engine, index) => (
        <div className="nt-engine-row" key={engine.id} data-testid="engine-row">
          <Search size={20} />
          <div className="nt-engine-copy">
            <strong>{engine.name}</strong>
            <span title={engine.url}>{new URL(engine.url.replaceAll('%s', 'query')).hostname}</span>
          </div>
          <Switch
            checked={engine.enabled}
            disabled={busy}
            aria-label={t('engineToggle', engine.name)}
            onCheckedChange={enabled => void operation(() => updateSearchEngine(engine.id, { enabled }))}
          />
          <button
            className="nt-engine-more"
            type="button"
            aria-label={t('engineActions', engine.name)}
            aria-expanded={menu === engine.id}
            onClick={() => setMenu(menu === engine.id ? undefined : engine.id)}>
            <MoreHorizontal size={16} />
          </button>
          {menu === engine.id && (
            <div className="nt-engine-actions">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => edit(engine)}>
                <Pencil size={14} />
                {t('engineEdit')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || index === 0}
                aria-label={t('engineMoveUp')}
                onClick={() => void operation(() => moveSearchEngine(engine.id, -1))}>
                <ArrowUp size={14} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || index === engines.length - 1}
                aria-label={t('engineMoveDown')}
                onClick={() => void operation(() => moveSearchEngine(engine.id, 1))}>
                <ArrowDown size={14} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void operation(async () => {
                    await removeSearchEngine(engine.id)
                    setMenu(undefined)
                    toast(t('engineDeleted', engine.name), {
                      action: {
                        label: t('undoAction'),
                        onClick: () =>
                          void restoreSearchEngine(engine, index).catch(() => toast.error(t('engineSaveFailed'))),
                      },
                    })
                  })
                }>
                <Trash2 size={14} />
                {t('engineDelete')}
              </Button>
            </div>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={engines.length >= MAX_SEARCH_ENGINES || busy}
        onClick={() => edit()}
        data-testid="engine-add">
        <Plus size={16} />
        {t('engineAdd')}
      </Button>
      {engines.length >= MAX_SEARCH_ENGINES && (
        <p className="text-xs text-muted-foreground">{t('engineLimit', String(MAX_SEARCH_ENGINES))}</p>
      )}
    </section>
  )
}
