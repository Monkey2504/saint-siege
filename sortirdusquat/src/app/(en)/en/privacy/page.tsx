import type { Metadata } from 'next';
import PrivacyPage from '@/components/PrivacyPage';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: t('en').privacy.title };

export default function Page() {
  return <PrivacyPage locale="en" />;
}
