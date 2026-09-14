import type { Metadata } from 'next';
import UnsubscribePage from '@/components/UnsubscribePage';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: t('nl').unsubscribe.title, robots: { index: false } };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { token } = await params;
  const { state } = await searchParams;
  return <UnsubscribePage locale="nl" token={token} state={state} />;
}
