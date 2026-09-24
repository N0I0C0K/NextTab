import { cn } from '@/utils/cn'

export function Space({ className }: { className?: string }) {
  return <span className={cn('flex-1', className)} />
}
