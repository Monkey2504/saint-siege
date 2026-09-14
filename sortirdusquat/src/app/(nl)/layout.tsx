import type { Metadata, Viewport } from 'next';
import Shell from '@/components/Shell';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('nl').meta.title,
  description: t('nl').meta.description,
};

export const viewport: Viewport = { themeColor: '#06140f' };

export default function NlLayout({ children }: { children: React.ReactNode }) {
  return <Shell locale="nl">{children}</Shell>;
}
