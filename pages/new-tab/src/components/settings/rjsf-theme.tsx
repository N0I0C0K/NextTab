import type { ArrayFieldTemplateProps, FieldTemplateProps, ObjectFieldTemplateProps, WidgetProps } from '@rjsf/utils'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Text,
} from '@extension/ui'
import { cn } from '@/lib/utils'

const RjsfFieldTemplate = ({
  children,
  classNames,
  description,
  displayLabel,
  errors,
  hidden,
  id,
  label,
  required,
}: FieldTemplateProps) => {
  if (hidden) {
    return <div className="hidden">{children}</div>
  }

  return (
    <div className={cn(classNames, 'space-y-2')}>
      {displayLabel && label && (
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {required ? '*' : ''}
        </label>
      )}
      {children}
      {description}
      {errors}
    </div>
  )
}

const RjsfObjectFieldTemplate = ({ description, properties, title }: ObjectFieldTemplateProps) => {
  return (
    <div className="space-y-3">
      {title ? (
        <Text level="s" className="font-medium">
          {title}
        </Text>
      ) : null}
      {description}
      {properties.map(property => (
        <div key={property.name}>{property.content}</div>
      ))}
    </div>
  )
}

const RjsfArrayFieldTemplate = ({ canAdd, items, onAddClick, title }: ArrayFieldTemplateProps) => {
  return (
    <div className="space-y-3">
      {title ? (
        <Text level="s" className="font-medium">
          {title}
        </Text>
      ) : null}
      {items.map(item => (
        <div key={item.key} className="space-y-3 rounded-md border border-border p-3">
          {item.children}
          {item.hasRemove ? (
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={item.onDropIndexClick(item.index)}>
                Remove
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {canAdd ? (
        <Button type="button" size="sm" variant="secondary" onClick={onAddClick}>
          Add Item
        </Button>
      ) : null}
    </div>
  )
}

const RjsfTextWidget = ({
  disabled,
  id,
  onBlur,
  onChange,
  onFocus,
  options,
  placeholder,
  rawErrors,
  readonly,
  value,
}: WidgetProps) => {
  return (
    <Input
      id={id}
      type={typeof options.inputType === 'string' ? options.inputType : 'text'}
      value={typeof value === 'string' ? value : ''}
      placeholder={placeholder}
      disabled={disabled || readonly}
      onChange={event => onChange(event.target.value)}
      onBlur={event => onBlur(id, event.target.value)}
      onFocus={event => onFocus(id, event.target.value)}
      className={cn(rawErrors && rawErrors.length > 0 ? 'border-destructive focus-visible:ring-destructive' : '')}
    />
  )
}

const RjsfSelectWidget = ({ disabled, id, onChange, options, placeholder, readonly, value }: WidgetProps) => {
  const enumOptions = options.enumOptions ?? []

  return (
    <Select
      value={typeof value === 'string' ? value : ''}
      onValueChange={nextValue => onChange(nextValue)}
      disabled={disabled || readonly}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder || 'Select'} />
      </SelectTrigger>
      <SelectContent>
        {enumOptions.map(option => (
          <SelectItem key={String(option.value)} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const RjsfCheckboxWidget = ({ disabled, id, label, onChange, readonly, value }: WidgetProps) => {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch
        id={id}
        checked={Boolean(value)}
        disabled={disabled || readonly}
        onCheckedChange={checked => onChange(checked)}
      />
    </label>
  )
}

export const rjsfTemplates = {
  ArrayFieldTemplate: RjsfArrayFieldTemplate,
  FieldTemplate: RjsfFieldTemplate,
  ObjectFieldTemplate: RjsfObjectFieldTemplate,
}

export const rjsfWidgets = {
  CheckboxWidget: RjsfCheckboxWidget,
  SelectWidget: RjsfSelectWidget,
  TextWidget: RjsfTextWidget,
  URLWidget: RjsfTextWidget,
}
