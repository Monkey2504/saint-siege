export const locales = ['fr', 'nl', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Préfixe d'URL de chaque langue. Le français est à la racine. */
export const localePrefix: Record<Locale, string> = {
  fr: '',
  nl: '/nl',
  en: '/en',
};

export const localeLabel: Record<Locale, string> = {
  fr: 'FR',
  nl: 'NL',
  en: 'EN',
};

export const localeName: Record<Locale, string> = {
  fr: 'Français',
  nl: 'Nederlands',
  en: 'English',
};

/** Chemin de la page de confidentialité par langue. */
export const privacyPath: Record<Locale, string> = {
  fr: '/vie-privee',
  nl: '/nl/privacy',
  en: '/en/privacy',
};

export const TOTAL_BRICKS = 120;

export type LeadKind = 'batiment' | 'commune' | 'congregation' | 'architecte' | 'autre';

export const leadKinds: LeadKind[] = [
  'batiment',
  'commune',
  'congregation',
  'architecte',
  'autre',
];

type Dict = {
  meta: { title: string; description: string };
  langSwitch: string;
  hero: {
    kicker: string;
    title: string;
    lead: string;
    countLine: (n: number, total: number) => string;
    empty: string;
    missing: (n: number) => string;
    complete: string;
    gridLabel: string;
    brickFilled: string;
    brickEmpty: string;
  };
  mechanism: { title: string; items: string[]; note: string };
  pledge: {
    title: string;
    intro: string;
    name: string;
    email: string;
    phone: string;
    phoneOptional: string;
    contactLang: string;
    message: string;
    messageOptional: string;
    commitment: string;
    consent: string;
    notice: string;
    submit: string;
    sending: string;
    success: string;
    successNote: string;
    errorGeneric: string;
    errorRequired: string;
    errorEmail: string;
    errorRate: string;
  };
  lead: {
    title: string;
    intro: string;
    name: string;
    email: string;
    kind: string;
    kindPlaceholder: string;
    kinds: Record<LeadKind, string>;
    description: string;
    consent: string;
    submit: string;
    sending: string;
    success: string;
    errorGeneric: string;
    errorRequired: string;
    errorEmail: string;
    errorRate: string;
  };
  downloads: { title: string; intro: string; missing: string; pdf: string };
  limits: { title: string; intro: string; items: { period: string; text: string }[]; note: string };
  footer: {
    org: string;
    address: string;
    companyNumber: string;
    companyNumberLabel: string;
    contact: string;
    privacy: string;
    noPayment: string;
  };
  privacy: {
    title: string;
    back: string;
    sections: { heading: string; body: string[] }[];
  };
  unsubscribe: {
    title: string;
    intro: string;
    confirm: string;
    done: string;
    notFound: string;
    back: string;
  };
};

const fr: Dict = {
  meta: {
    title: 'Sortir du squat — 120 personnes, 1 000 € chacune',
    description:
      "120 prêts citoyens de 1 000 € à 0 % pour rendre possible un emprunt de 900 000 € et un bâtiment de 50 logements de transition à Bruxelles. Aucun paiement aujourd'hui.",
  },
  langSwitch: 'Langue',
  hero: {
    kicker: 'Ballal ASBL · Molenbeek',
    title: 'Il ne manque que 120 personnes',
    lead: "Une brique, c'est 1 000 € prêtés à 0 %. Cent vingt briques, et la banque suit.",
    countLine: (n, total) => `${n} engagements sur ${total}`,
    empty: 'La liste ouvre bientôt',
    missing: (n) => `Il manque ${n} personnes pour en loger 50.`,
    complete: 'Les 120 engagements sont réunis.',
    gridLabel: 'Grille des 120 engagements',
    brickFilled: 'Engagement enregistré',
    brickEmpty: 'Place libre',
  },
  mechanism: {
    title: 'Le mécanisme',
    items: [
      '120 prêts de 1 000 € à 0 %',
      'un emprunt bancaire de 900 000 €',
      'un bâtiment de 50 chambres privatives à 300 €/mois',
      "l'argent revient entre la 6ᵉ et la 10ᵉ année",
      'il repart sur un deuxième bâtiment',
    ],
    note: "Ce n'est pas un don. C'est un prêt subordonné à 0 % : la banque est servie avant les citoyens en cas de difficulté, et c'est ce qui permet de maintenir le levier à 900 000 €.",
  },
  pledge: {
    title: "Je m'engage",
    intro:
      "Votre nom rejoint la liste des 120. Elle sert de preuve d'apport auprès de la banque.",
    name: 'Prénom et nom',
    email: 'Email',
    phone: 'Téléphone',
    phoneOptional: 'facultatif',
    contactLang: 'Langue de contact',
    message: 'Message',
    messageOptional: 'facultatif',
    commitment:
      "Je m'engage à prêter 1 000 € le jour où le bâtiment sera identifié et le crédit accordé. Je comprends qu'aucun euro n'est versé aujourd'hui et que cet engagement n'est pas juridiquement contraignant.",
    consent:
      "J'accepte que Ballal ASBL conserve ces données pour tenir la liste des engagements et me recontacter à ce sujet.",
    notice:
      "Aucun paiement n'est demandé aujourd'hui. La campagne ouvre après validation du dossier, soit 18 à 21 mois.",
    submit: "Ajouter mon engagement",
    sending: 'Envoi…',
    success: 'Votre engagement est enregistré.',
    successNote:
      "Un accusé de réception part vers votre adresse. Il contient le lien qui supprime vos données à tout moment.",
    errorGeneric: "L'enregistrement a échoué. Réessayez dans un instant.",
    errorRequired: 'Merci de compléter les champs obligatoires et les deux cases.',
    errorEmail: "L'adresse email ne semble pas valide.",
    errorRate: 'Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes.',
  },
  lead: {
    title: 'Je connais une piste',
    intro:
      "Un bâtiment vide, un contact en commune, une congrégation, un bureau d'études. Les deux premières étapes du projet ne coûtent rien et dépendent de ces réseaux.",
    name: 'Nom',
    email: 'Email',
    kind: 'Type de piste',
    kindPlaceholder: 'Choisir…',
    kinds: {
      batiment: 'Bâtiment vacant',
      commune: 'Contact en commune ou CPAS',
      congregation: 'Congrégation',
      architecte: "Architecte ou bureau d'études",
      autre: 'Autre',
    },
    description: 'Description',
    consent:
      "J'accepte que Ballal ASBL conserve ces données pour étudier cette piste et me recontacter à ce sujet.",
    submit: 'Envoyer la piste',
    sending: 'Envoi…',
    success: 'Votre piste est enregistrée. Merci.',
    errorGeneric: "L'envoi a échoué. Réessayez dans un instant.",
    errorRequired: 'Merci de compléter les champs obligatoires et la case de consentement.',
    errorEmail: "L'adresse email ne semble pas valide.",
    errorRate: 'Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes.',
  },
  downloads: {
    title: 'Le dossier complet',
    intro:
      'Les chiffres, les hypothèses, les risques et les quatre points d’arrêt, en onze pages.',
    missing: 'Le dossier sera déposé ici sous peu.',
    pdf: 'PDF',
  },
  limits: {
    title: "Où ça s'arrête",
    intro:
      "Le pari est borné : 30 000 € d'exposition maximale, dont l'essentiel subventionnable, et quatre endroits où le projet s'arrête proprement avant qu'un euro citoyen soit engagé.",
    items: [
      {
        period: 'Mois 0–3',
        text: 'Si le CPAS refuse le statut isolé, le modèle à 300 € ne tient pas. Arrêt, coût nul.',
      },
      {
        period: 'Mois 3–9',
        text: "Si aucun propriétaire n'ouvre une discussion d'emphytéose, arrêt, coût nul.",
      },
      {
        period: 'Mois 9–15',
        text: "Si l'étude de faisabilité chiffre un écart de travaux non couvrable, arrêt. Seule l'étude, subventionnée, aura été engagée.",
      },
      {
        period: 'Mois 15–21',
        text: 'Si les banques refusent, arrêt ou bascule sur la variante en parts de coopérateur.',
      },
    ],
    note: "La campagne citoyenne vient après ces quatre étapes. C'est la partie la plus facile du projet, et la seule qu'on ne peut faire qu'une fois.",
  },
  footer: {
    org: 'Ballal ASBL',
    address: 'Molenbeek-Saint-Jean, Bruxelles',
    companyNumberLabel: "Numéro d'entreprise",
    companyNumber: '',
    contact: 'Contact',
    privacy: 'Politique de confidentialité',
    noPayment: "Ce site ne collecte aucun paiement et n'en traite aucun.",
  },
  privacy: {
    title: 'Politique de confidentialité',
    back: "Retour à l'accueil",
    sections: [
      {
        heading: 'Responsable de traitement',
        body: [
          "Ballal ASBL, Molenbeek-Saint-Jean, Bruxelles. Numéro d'entreprise : voir le pied de page du site.",
          'Contact pour toute question relative aux données : fhzegert@gmail.com.',
        ],
      },
      {
        heading: 'Finalité',
        body: [
          "Constituer la liste des engagements citoyens et recueillir des pistes de bâtiment. Aucune autre finalité, aucune revente, aucun profilage.",
        ],
      },
      {
        heading: 'Base légale',
        body: ['Votre consentement, donné au moment de l’envoi du formulaire.'],
      },
      {
        heading: 'Données collectées',
        body: [
          "Engagement : prénom et nom, email, téléphone si vous le donnez, langue de contact, message libre si vous en écrivez un, date du consentement.",
          "Piste : nom, email, type de piste, description, date du consentement.",
          "Le site ne collecte aucune donnée relative aux futurs résidents, ni aucune information sur une situation personnelle. Cette règle est stricte.",
        ],
      },
      {
        heading: 'Durée de conservation',
        body: [
          'Vingt-quatre mois à compter de l’enregistrement. La suppression est automatique : une tâche planifiée purge chaque jour les enregistrements qui dépassent ce délai.',
        ],
      },
      {
        heading: 'Vos droits',
        body: [
          "Vous disposez d'un droit d'accès, de rectification et d'effacement. L'accusé de réception envoyé à l'enregistrement contient un lien de suppression immédiate, sans mot de passe ni justification.",
          "Vous pouvez aussi écrire à fhzegert@gmail.com. Vous avez le droit d'introduire une réclamation auprès de l'Autorité de protection des données (autoriteprotectiondonnees.be).",
        ],
      },
      {
        heading: 'Hébergement et sous-traitants',
        body: [
          "Les données sont hébergées dans une base Postgres en région européenne. L'envoi des accusés de réception passe par un prestataire d'email. Aucun transfert hors Union européenne n'est organisé.",
        ],
      },
      {
        heading: 'Cookies et mesure d’audience',
        body: [
          "Aucun cookie non essentiel, aucun traceur, aucun outil de mesure d'audience, aucune police ni script chargés depuis un serveur tiers. C'est pourquoi ce site n'affiche pas de bandeau cookies.",
        ],
      },
    ],
  },
  unsubscribe: {
    title: 'Suppression de vos données',
    intro:
      'Ce lien supprime définitivement votre enregistrement : votre nom, votre email et, le cas échéant, votre message ou votre piste.',
    confirm: 'Supprimer mes données',
    done: 'Vos données ont été supprimées. Aucune trace ne subsiste dans la liste.',
    notFound: "Ce lien n'est plus valide : les données ont déjà été supprimées, ou le lien est incorrect.",
    back: "Retour à l'accueil",
  },
};

const nl: Dict = {
  meta: {
    title: 'Uit de kraakpanden — 120 mensen, elk 1 000 €',
    description:
      '120 burgerleningen van 1 000 € tegen 0 % om een banklening van 900 000 € mogelijk te maken en een gebouw met 50 transitwoningen in Brussel. Vandaag geen enkele betaling.',
  },
  langSwitch: 'Taal',
  hero: {
    kicker: 'Ballal vzw · Molenbeek',
    title: 'Er ontbreken enkel 120 mensen',
    lead: 'Eén steen is 1 000 € geleend tegen 0 %. Honderdtwintig stenen, en de bank volgt.',
    countLine: (n, total) => `${n} toezeggingen op ${total}`,
    empty: 'De lijst opent binnenkort',
    missing: (n) => `Er ontbreken ${n} mensen om er 50 te huisvesten.`,
    complete: 'De 120 toezeggingen zijn samen.',
    gridLabel: 'Raster van de 120 toezeggingen',
    brickFilled: 'Toezegging geregistreerd',
    brickEmpty: 'Vrije plaats',
  },
  mechanism: {
    title: 'Het mechanisme',
    items: [
      '120 leningen van 1 000 € tegen 0 %',
      'een banklening van 900 000 €',
      'een gebouw met 50 privékamers aan 300 €/maand',
      'het geld keert terug tussen het 6de en het 10de jaar',
      'het vertrekt opnieuw voor een tweede gebouw',
    ],
    note: 'Het is geen gift. Het is een achtergestelde lening tegen 0 %: bij moeilijkheden wordt de bank vóór de burgers betaald, en net daardoor blijft de hefboom op 900 000 € staan.',
  },
  pledge: {
    title: 'Ik zeg toe',
    intro:
      'Uw naam komt bij de lijst van 120. Die lijst dient als bewijs van inbreng bij de bank.',
    name: 'Voornaam en naam',
    email: 'E-mail',
    phone: 'Telefoon',
    phoneOptional: 'optioneel',
    contactLang: 'Contacttaal',
    message: 'Bericht',
    messageOptional: 'optioneel',
    commitment:
      'Ik verbind mij ertoe 1 000 € te lenen op de dag dat het gebouw is gevonden en het krediet is toegekend. Ik begrijp dat er vandaag geen euro wordt gestort en dat deze toezegging juridisch niet bindend is.',
    consent:
      'Ik ga ermee akkoord dat Ballal vzw deze gegevens bewaart om de lijst van toezeggingen bij te houden en mij hierover opnieuw te contacteren.',
    notice:
      'Vandaag wordt geen enkele betaling gevraagd. De campagne opent na validatie van het dossier, dus binnen 18 tot 21 maanden.',
    submit: 'Mijn toezegging toevoegen',
    sending: 'Versturen…',
    success: 'Uw toezegging is geregistreerd.',
    successNote:
      'Een ontvangstbevestiging vertrekt naar uw adres. Ze bevat de link die uw gegevens op elk moment verwijdert.',
    errorGeneric: 'De registratie is mislukt. Probeer het zo meteen opnieuw.',
    errorRequired: 'Vul de verplichte velden en de twee vakjes in.',
    errorEmail: 'Dit e-mailadres lijkt niet geldig.',
    errorRate: 'Te veel pogingen vanaf deze verbinding. Probeer het over enkele minuten opnieuw.',
  },
  lead: {
    title: 'Ik ken een spoor',
    intro:
      'Een leegstaand gebouw, een contact bij een gemeente of OCMW, een congregatie, een studiebureau. De eerste twee stappen van het project kosten niets en hangen van die netwerken af.',
    name: 'Naam',
    email: 'E-mail',
    kind: 'Soort spoor',
    kindPlaceholder: 'Kiezen…',
    kinds: {
      batiment: 'Leegstaand gebouw',
      commune: 'Contact bij gemeente of OCMW',
      congregation: 'Congregatie',
      architecte: 'Architect of studiebureau',
      autre: 'Andere',
    },
    description: 'Beschrijving',
    consent:
      'Ik ga ermee akkoord dat Ballal vzw deze gegevens bewaart om dit spoor te onderzoeken en mij hierover opnieuw te contacteren.',
    submit: 'Spoor versturen',
    sending: 'Versturen…',
    success: 'Uw spoor is geregistreerd. Dank u.',
    errorGeneric: 'Het versturen is mislukt. Probeer het zo meteen opnieuw.',
    errorRequired: 'Vul de verplichte velden en het toestemmingsvakje in.',
    errorEmail: 'Dit e-mailadres lijkt niet geldig.',
    errorRate: 'Te veel pogingen vanaf deze verbinding. Probeer het over enkele minuten opnieuw.',
  },
  downloads: {
    title: 'Het volledige dossier',
    intro:
      'De cijfers, de hypotheses, de risico’s en de vier stoppunten, in elf bladzijden.',
    missing: 'Het dossier wordt hier binnenkort geplaatst.',
    pdf: 'PDF',
  },
  limits: {
    title: 'Waar het stopt',
    intro:
      'De inzet is begrensd: maximaal 30 000 € blootstelling, grotendeels subsidieerbaar, en vier plekken waar het project netjes stopt vóór er één burgereuro wordt ingezet.',
    items: [
      {
        period: 'Maand 0–3',
        text: 'Weigert het OCMW het statuut van alleenstaande, dan houdt het model aan 300 € geen stand. Stop, kosten nul.',
      },
      {
        period: 'Maand 3–9',
        text: 'Opent geen enkele eigenaar een gesprek over erfpacht, dan stop, kosten nul.',
      },
      {
        period: 'Maand 9–15',
        text: 'Becijfert de haalbaarheidsstudie een niet te dekken verschil in werken, dan stop. Enkel de studie, gesubsidieerd, zal zijn ingezet.',
      },
      {
        period: 'Maand 15–21',
        text: 'Weigeren de banken, dan stop of overschakeling op de variant met coöperatieve aandelen.',
      },
    ],
    note: 'De burgercampagne komt na deze vier stappen. Het is het makkelijkste deel van het project, en het enige dat je maar één keer kunt doen.',
  },
  footer: {
    org: 'Ballal vzw',
    address: 'Sint-Jans-Molenbeek, Brussel',
    companyNumberLabel: 'Ondernemingsnummer',
    companyNumber: '',
    contact: 'Contact',
    privacy: 'Privacybeleid',
    noPayment: 'Deze site int geen enkele betaling en verwerkt er ook geen.',
  },
  privacy: {
    title: 'Privacybeleid',
    back: 'Terug naar de startpagina',
    sections: [
      {
        heading: 'Verwerkingsverantwoordelijke',
        body: [
          'Ballal vzw, Sint-Jans-Molenbeek, Brussel. Ondernemingsnummer: zie de voettekst van de site.',
          'Contact voor elke vraag over gegevens: fhzegert@gmail.com.',
        ],
      },
      {
        heading: 'Doel',
        body: [
          'De lijst van burgertoezeggingen samenstellen en sporen naar een gebouw verzamelen. Geen ander doel, geen doorverkoop, geen profilering.',
        ],
      },
      {
        heading: 'Rechtsgrond',
        body: ['Uw toestemming, gegeven op het ogenblik dat u het formulier verstuurt.'],
      },
      {
        heading: 'Verzamelde gegevens',
        body: [
          'Toezegging: voornaam en naam, e-mail, telefoon indien u die geeft, contacttaal, vrij bericht indien u er een schrijft, datum van de toestemming.',
          'Spoor: naam, e-mail, soort spoor, beschrijving, datum van de toestemming.',
          'De site verzamelt geen enkel gegeven over de toekomstige bewoners, en geen enkele informatie over een persoonlijke situatie. Die regel is strikt.',
        ],
      },
      {
        heading: 'Bewaartermijn',
        body: [
          'Vierentwintig maanden vanaf de registratie. De verwijdering is automatisch: een geplande taak wist elke dag de records die deze termijn overschrijden.',
        ],
      },
      {
        heading: 'Uw rechten',
        body: [
          'U hebt recht op inzage, verbetering en wissing. De ontvangstbevestiging die bij registratie wordt verstuurd, bevat een link die onmiddellijk wist, zonder wachtwoord of motivering.',
          'U kunt ook schrijven naar fhzegert@gmail.com. U hebt het recht klacht in te dienen bij de Gegevensbeschermingsautoriteit (gegevensbeschermingsautoriteit.be).',
        ],
      },
      {
        heading: 'Hosting en verwerkers',
        body: [
          'De gegevens staan in een Postgres-databank in een Europese regio. De ontvangstbevestigingen vertrekken via een e-maildienstverlener. Er is geen doorgifte buiten de Europese Unie georganiseerd.',
        ],
      },
      {
        heading: 'Cookies en publieksmeting',
        body: [
          'Geen niet-essentiële cookies, geen trackers, geen publieksmeting, geen lettertypes of scripts van een externe server. Daarom toont deze site geen cookiebanner.',
        ],
      },
    ],
  },
  unsubscribe: {
    title: 'Verwijdering van uw gegevens',
    intro:
      'Deze link verwijdert uw registratie definitief: uw naam, uw e-mail en, in voorkomend geval, uw bericht of uw spoor.',
    confirm: 'Mijn gegevens verwijderen',
    done: 'Uw gegevens zijn verwijderd. Er blijft niets van over in de lijst.',
    notFound: 'Deze link is niet meer geldig: de gegevens zijn al verwijderd, of de link klopt niet.',
    back: 'Terug naar de startpagina',
  },
};

const en: Dict = {
  meta: {
    title: 'Out of the squat — 120 people, €1,000 each',
    description:
      '120 citizen loans of €1,000 at 0% to unlock a €900,000 bank loan and a building with 50 transitional homes in Brussels. No payment today.',
  },
  langSwitch: 'Language',
  hero: {
    kicker: 'Ballal ASBL · Molenbeek',
    title: 'Only 120 people are missing',
    lead: 'One brick is €1,000 lent at 0%. One hundred and twenty bricks, and the bank follows.',
    countLine: (n, total) => `${n} pledges out of ${total}`,
    empty: 'The list opens soon',
    missing: (n) => `${n} people are missing to house 50.`,
    complete: 'All 120 pledges are in.',
    gridLabel: 'Grid of the 120 pledges',
    brickFilled: 'Pledge recorded',
    brickEmpty: 'Open slot',
  },
  mechanism: {
    title: 'How it works',
    items: [
      '120 loans of €1,000 at 0%',
      'a €900,000 bank loan',
      'a building with 50 private rooms at €300 a month',
      'the money comes back between year 6 and year 10',
      'it moves on to a second building',
    ],
    note: 'This is not a donation. It is a subordinated loan at 0%: if things go wrong the bank is repaid before the citizens, and that is exactly what keeps the €900,000 leverage in place.',
  },
  pledge: {
    title: 'I pledge',
    intro: 'Your name joins the list of 120. That list is the proof of equity shown to the bank.',
    name: 'First and last name',
    email: 'Email',
    phone: 'Phone',
    phoneOptional: 'optional',
    contactLang: 'Contact language',
    message: 'Message',
    messageOptional: 'optional',
    commitment:
      'I commit to lending €1,000 on the day the building is identified and the credit granted. I understand that no euro is paid today and that this pledge is not legally binding.',
    consent:
      'I agree that Ballal ASBL keeps this data to maintain the list of pledges and to contact me about it.',
    notice:
      'No payment is requested today. The campaign opens once the file is validated, in 18 to 21 months.',
    submit: 'Add my pledge',
    sending: 'Sending…',
    success: 'Your pledge has been recorded.',
    successNote:
      'An acknowledgement is on its way to your address. It carries the link that deletes your data at any time.',
    errorGeneric: 'Recording failed. Please try again in a moment.',
    errorRequired: 'Please complete the required fields and both checkboxes.',
    errorEmail: 'That email address does not look valid.',
    errorRate: 'Too many attempts from this connection. Please try again in a few minutes.',
  },
  lead: {
    title: 'I know of a lead',
    intro:
      'An empty building, a contact in a municipality or public welfare centre, a congregation, an engineering office. The first two stages of the project cost nothing and depend on those networks.',
    name: 'Name',
    email: 'Email',
    kind: 'Type of lead',
    kindPlaceholder: 'Choose…',
    kinds: {
      batiment: 'Vacant building',
      commune: 'Contact in a municipality or public welfare centre',
      congregation: 'Congregation',
      architecte: 'Architect or engineering office',
      autre: 'Other',
    },
    description: 'Description',
    consent:
      'I agree that Ballal ASBL keeps this data to look into this lead and to contact me about it.',
    submit: 'Send the lead',
    sending: 'Sending…',
    success: 'Your lead has been recorded. Thank you.',
    errorGeneric: 'Sending failed. Please try again in a moment.',
    errorRequired: 'Please complete the required fields and the consent checkbox.',
    errorEmail: 'That email address does not look valid.',
    errorRate: 'Too many attempts from this connection. Please try again in a few minutes.',
  },
  downloads: {
    title: 'The full file',
    intro: 'The figures, the assumptions, the risks and the four stopping points, in eleven pages.',
    missing: 'The file will be posted here shortly.',
    pdf: 'PDF',
  },
  limits: {
    title: 'Where it stops',
    intro:
      'The bet is bounded: €30,000 of maximum exposure, most of it eligible for grants, and four points where the project stops cleanly before a single citizen euro is committed.',
    items: [
      {
        period: 'Month 0–3',
        text: 'If the public welfare centre refuses the single-person status, the €300 model does not hold. Stop, zero cost.',
      },
      {
        period: 'Month 3–9',
        text: 'If no owner opens a long lease discussion, stop, zero cost.',
      },
      {
        period: 'Month 9–15',
        text: 'If the feasibility study prices a works gap that cannot be covered, stop. Only the study, grant-funded, will have been spent.',
      },
      {
        period: 'Month 15–21',
        text: 'If the banks refuse, stop or switch to the cooperative shares variant.',
      },
    ],
    note: 'The citizen campaign comes after these four stages. It is the easiest part of the project, and the only one that can be done just once.',
  },
  footer: {
    org: 'Ballal ASBL',
    address: 'Molenbeek-Saint-Jean, Brussels',
    companyNumberLabel: 'Company number',
    companyNumber: '',
    contact: 'Contact',
    privacy: 'Privacy policy',
    noPayment: 'This site collects no payment and processes none.',
  },
  privacy: {
    title: 'Privacy policy',
    back: 'Back to the home page',
    sections: [
      {
        heading: 'Data controller',
        body: [
          'Ballal ASBL, Molenbeek-Saint-Jean, Brussels. Company number: see the site footer.',
          'Contact for any question about data: fhzegert@gmail.com.',
        ],
      },
      {
        heading: 'Purpose',
        body: [
          'To build the list of citizen pledges and to gather leads on a building. No other purpose, no resale, no profiling.',
        ],
      },
      {
        heading: 'Legal basis',
        body: ['Your consent, given when you submit the form.'],
      },
      {
        heading: 'Data collected',
        body: [
          'Pledge: first and last name, email, phone if you give one, contact language, free message if you write one, date of consent.',
          'Lead: name, email, type of lead, description, date of consent.',
          'The site collects no data about future residents, and no information about anyone’s personal situation. That rule is strict.',
        ],
      },
      {
        heading: 'Retention',
        body: [
          'Twenty-four months from the date of recording. Deletion is automatic: a scheduled job purges records past that limit every day.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You have a right of access, rectification and erasure. The acknowledgement sent on recording carries a link that deletes immediately, with no password and no justification needed.',
          'You can also write to fhzegert@gmail.com. You have the right to lodge a complaint with the Belgian Data Protection Authority (dataprotectionauthority.be).',
        ],
      },
      {
        heading: 'Hosting and processors',
        body: [
          'Data is hosted in a Postgres database in a European region. Acknowledgements are sent through an email provider. No transfer outside the European Union is organised.',
        ],
      },
      {
        heading: 'Cookies and audience measurement',
        body: [
          'No non-essential cookies, no trackers, no audience measurement, no fonts or scripts loaded from a third-party server. That is why this site shows no cookie banner.',
        ],
      },
    ],
  },
  unsubscribe: {
    title: 'Deletion of your data',
    intro:
      'This link permanently deletes your record: your name, your email and, where applicable, your message or your lead.',
    confirm: 'Delete my data',
    done: 'Your data has been deleted. Nothing is left in the list.',
    notFound: 'This link is no longer valid: the data has already been deleted, or the link is wrong.',
    back: 'Back to the home page',
  },
};

const dictionaries: Record<Locale, Dict> = { fr, nl, en };

export function t(locale: Locale): Dict {
  return dictionaries[locale];
}
