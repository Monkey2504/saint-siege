import type { Metadata, Viewport } from 'next';
import Shell from '@/components/Shell';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('en').meta.title,
  description: t('en').meta.description,
};

export const viewport: Viewport = { themeColor: '#06140f' };

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <Shell locale="en">{children}</Shell>;
}
