import type { Metadata, Viewport } from 'next';
import Shell from '@/components/Shell';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('fr').meta.title,
  description: t('fr').meta.description,
};

export const viewport: Viewport = { themeColor: '#06140f' };

export default function FrLayout({ children }: { children: React.ReactNode }) {
  return <Shell locale="fr">{children}</Shell>;
}
