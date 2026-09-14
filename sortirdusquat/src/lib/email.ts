import 'server-only';
import { org, siteUrl } from './config';
import { localePrefix, type Locale } from './i18n';

/**
 * Accusé de réception, envoyé par Resend. Sans clé d'API, l'envoi est
 * simplement ignoré : un formulaire ne doit jamais échouer parce que
 * l'email ne part pas.
 */

type Confirmation = {
  to: string;
  name: string;
  locale: Locale;
  kind: 'pledge' | 'lead';
  token: string;
};

type Copy = {
  subject: string;
  greeting: (name: string) => string;
  recorded: string;
  noPayment: string;
  calendar: string;
  unsubscribe: string;
  signature: string;
};

const copy: Record<Locale, Record<'pledge' | 'lead', Copy>> = {
  fr: {
    pledge: {
      subject: 'Votre engagement est enregistré — Sortir du squat',
      greeting: (name) => `Bonjour ${name},`,
      recorded:
        "Votre engagement à prêter 1 000 € à 0 % est enregistré. Il rejoint la liste des 120, qui sert de preuve d'apport auprès de la banque.",
      noPayment:
        "Aucun paiement ne vous est demandé aujourd'hui, et cet engagement n'est pas juridiquement contraignant.",
      calendar:
        "La campagne ouvre après validation du dossier, soit 18 à 21 mois. Nous ne collectons rien avant.",
      unsubscribe: 'Supprimer mes données à tout moment :',
      signature: `${org.name} — ${org.city}`,
    },
    lead: {
      subject: 'Votre piste est enregistrée — Sortir du squat',
      greeting: (name) => `Bonjour ${name},`,
      recorded: 'Votre piste est enregistrée. Nous revenons vers vous si elle est exploitable.',
      noPayment: "Ce site ne collecte aucun paiement et n'en traite aucun.",
      calendar:
        'Les deux premières étapes du projet — position du CPAS, recherche de bâtiment — ne coûtent rien et dépendent de pistes comme la vôtre.',
      unsubscribe: 'Supprimer mes données à tout moment :',
      signature: `${org.name} — ${org.city}`,
    },
  },
  nl: {
    pledge: {
      subject: 'Uw toezegging is geregistreerd — Uit de kraakpanden',
      greeting: (name) => `Dag ${name},`,
      recorded:
        'Uw toezegging om 1 000 € tegen 0 % te lenen is geregistreerd. Ze komt bij de lijst van 120, die als bewijs van inbreng bij de bank dient.',
      noPayment:
        'Vandaag wordt u geen enkele betaling gevraagd, en deze toezegging is juridisch niet bindend.',
      calendar:
        'De campagne opent na validatie van het dossier, dus binnen 18 tot 21 maanden. Daarvoor innen wij niets.',
      unsubscribe: 'Mijn gegevens op elk moment verwijderen:',
      signature: `${org.name} — ${org.city}`,
    },
    lead: {
      subject: 'Uw spoor is geregistreerd — Uit de kraakpanden',
      greeting: (name) => `Dag ${name},`,
      recorded: 'Uw spoor is geregistreerd. Wij nemen opnieuw contact op als het bruikbaar is.',
      noPayment: 'Deze site int geen enkele betaling en verwerkt er ook geen.',
      calendar:
        'De eerste twee stappen van het project — standpunt van het OCMW, zoektocht naar een gebouw — kosten niets en hangen af van sporen zoals het uwe.',
      unsubscribe: 'Mijn gegevens op elk moment verwijderen:',
      signature: `${org.name} — ${org.city}`,
    },
  },
  en: {
    pledge: {
      subject: 'Your pledge has been recorded — Out of the squat',
      greeting: (name) => `Hello ${name},`,
      recorded:
        'Your pledge to lend €1,000 at 0% has been recorded. It joins the list of 120, which serves as proof of equity for the bank.',
      noPayment: 'No payment is requested from you today, and this pledge is not legally binding.',
      calendar:
        'The campaign opens once the file is validated, in 18 to 21 months. We collect nothing before then.',
      unsubscribe: 'Delete my data at any time:',
      signature: `${org.name} — ${org.city}`,
    },
    lead: {
      subject: 'Your lead has been recorded — Out of the squat',
      greeting: (name) => `Hello ${name},`,
      recorded: 'Your lead has been recorded. We will come back to you if it can be taken further.',
      noPayment: 'This site collects no payment and processes none.',
      calendar:
        'The first two stages of the project — the welfare centre’s position, the search for a building — cost nothing and depend on leads like yours.',
      unsubscribe: 'Delete my data at any time:',
      signature: `${org.name} — ${org.city}`,
    },
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendConfirmation({ to, name, locale, kind, token }: Confirmation): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const c = copy[locale][kind];
  const link = `${siteUrl()}${localePrefix[locale]}/unsubscribe/${token}`;

  const text = [
    c.greeting(name),
    '',
    c.recorded,
    '',
    c.noPayment,
    '',
    c.calendar,
    '',
    `${c.unsubscribe} ${link}`,
    '',
    c.signature,
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;color:#12231c">',
    `<p>${escapeHtml(c.greeting(name))}</p>`,
    `<p>${escapeHtml(c.recorded)}</p>`,
    `<p><strong>${escapeHtml(c.noPayment)}</strong></p>`,
    `<p>${escapeHtml(c.calendar)}</p>`,
    `<p>${escapeHtml(c.unsubscribe)} <a href="${link}">${link}</a></p>`,
    `<p style="color:#5b6b63">${escapeHtml(c.signature)}</p>`,
    '</div>',
  ].join('');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject: c.subject, text, html }),
    });
    if (!res.ok) {
      console.error('Envoi de l’accusé de réception refusé :', res.status, await res.text());
    }
  } catch (error) {
    console.error('Envoi de l’accusé de réception impossible :', error);
  }
}
