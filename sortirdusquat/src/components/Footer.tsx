import Link from 'next/link';
import { org } from '@/lib/config';
import { privacyPath, t, type Locale } from '@/lib/i18n';

export default function Footer({ locale }: { locale: Locale }) {
  const copy = t(locale).footer;

  return (
    <footer className="border-t border-line px-5 py-10 text-sm text-muted sm:px-8">
      <div className="mx-auto max-w-3xl space-y-2">
        <p className="font-semibold text-paper">{copy.org}</p>
        <p>{copy.address}</p>
        {org.companyNumber ? (
          <p>
            {copy.companyNumberLabel} : {org.companyNumber}
          </p>
        ) : null}
        <p>
          {copy.contact} :{' '}
          <a href={`mailto:${org.contactEmail}`} className="text-gold underline underline-offset-4">
            {org.contactEmail}
          </a>
        </p>
        <p>
          <Link href={privacyPath[locale]} className="text-gold underline underline-offset-4">
            {copy.privacy}
          </Link>
        </p>
        <p className="pt-2">{copy.noPayment}</p>
      </div>
    </footer>
  );
}
