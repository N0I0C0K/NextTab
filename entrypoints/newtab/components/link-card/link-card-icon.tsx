import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'

interface LinkCardIconProps {
  url: string
  title: string
}

export const LinkCardIcon = ({ url, title }: LinkCardIconProps) => (
  <QuickLinkIcon url={url} title={title} className="nt-link-icon" />
)
