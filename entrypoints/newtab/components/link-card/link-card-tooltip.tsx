import { Stack, Text, toast } from '@/components/shared'
import { Copy } from 'lucide-react'

interface LinkCardTooltipContentProps {
  title: string
  url: string
  id: string
}

/**
 * LinkCardTooltipContent - The tooltip content showing title and URL
 */
export const LinkCardTooltipContent = ({ title, url }: LinkCardTooltipContentProps) => {
  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Copy success', { description: url })
    } catch {
      // Fallback: just show the URL in toast even if copy failed
      toast.success('URL', { description: url })
    }
  }

  return (
    <Stack direction={'column'}>
      <Text>{title}</Text>
      <Stack className="gap-1" center>
        <Text level="s" gray className="">
          {url}
        </Text>
        <Copy className="size-4 cursor-pointer" onClick={handleCopyClick} />
      </Stack>
    </Stack>
  )
}

LinkCardTooltipContent.displayName = 'LinkCardTooltipContent'
