/*! Saint-Siège — les noms de pays en français © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Le carnet d'adresses du Courrier listait « Afghanistan, Akrotiri and
// Dhekelia, Åland, Albania, American Samoa, Antarctica… » : les noms du moteur,
// en anglais. Le moteur garde ses noms (ce sont des identifiants que le modèle
// lit) ; seul l'AFFICHAGE passe en français, par le code ISO et l'annuaire du
// navigateur (Intl.DisplayNames), sans table de noms à maintenir.
const ALPHA3_VERS_ALPHA2 = Object.freeze({"CAN":"CA","USA":"US","MEX":"MX","GTM":"GT","GRL":"GL","SPM":"PM","BHS":"BS","BLZ":"BZ","SLV":"SV","HND":"HN","NIC":"NI","CYM":"KY","CUB":"CU","CRI":"CR","PAN":"PA","JAM":"JM","TCA":"TC","HTI":"HT","DOM":"DO","ABW":"AW","CUW":"CW","BES":"BQ","COL":"CO","BMU":"BM","PRI":"PR","VIR":"VI","VGB":"VG","AIA":"AI","KNA":"KN","ATG":"AG","MSR":"MS","GLP":"GP","BLM":"BL","DMA":"DM","MTQ":"MQ","VCT":"VC","LCA":"LC","GRD":"GD","BRB":"BB","VEN":"VE","TTO":"TT","GUY":"GY","SUR":"SR","GUF":"GF","ISL":"IS","FRO":"FO","IRL":"IE","IMN":"IM","GBR":"GB","GGY":"GG","JEY":"JE","KIR":"KI","CPV":"CV","ESH":"EH","PRT":"PT","ESP":"ES","MAR":"MA","SEN":"SN","GMB":"GM","GNB":"GW","SLE":"SL","MRT":"MR","MLI":"ML","BFA":"BF","GIN":"GN","LBR":"LR","CIV":"CI","GHA":"GH","TKL":"TK","TON":"TO","WSM":"WS","ASM":"AS","COK":"CK","PYF":"PF","ECU":"EC","PER":"PE","CHL":"CL","BOL":"BO","BRA":"BR","PRY":"PY","ARG":"AR","URY":"UY","FLK":"FK","SHN":"SH","SGS":"GS","SJM":"SJ","ATA":"AQ","DNK":"DK","NOR":"NO","SWE":"SE","ALA":"AX","NLD":"NL","BEL":"BE","LUX":"LU","DEU":"DE","FRA":"FR","AND":"AD","CHE":"CH","LIE":"LI","SMR":"SM","CZE":"CZ","POL":"PL","AUT":"AT","SVN":"SI","ITA":"IT","HRV":"HR","SVK":"SK","HUN":"HU","BIH":"BA","MNE":"ME","SRB":"RS","ALB":"AL","MKD":"MK","FIN":"FI","LVA":"LV","EST":"EE","LTU":"LT","BLR":"BY","UKR":"UA","ROU":"RO","BGR":"BG","MDA":"MD","GEO":"GE","TUN":"TN","DZA":"DZ","MLT":"MT","LBY":"LY","NER":"NE","TGO":"TG","BEN":"BJ","NGA":"NG","STP":"ST","GNQ":"GQ","TCD":"TD","CMR":"CM","CAF":"CF","GRC":"GR","CYP":"CY","EGY":"EG","TUR":"TR","LBN":"LB","SYR":"SY","ARM":"AM","IRQ":"IQ","ISR":"IL","PSE":"PS","JOR":"JO","SAU":"SA","SDN":"SD","SSD":"SS","UGA":"UG","ERI":"ER","DJI":"DJ","KEN":"KE","ETH":"ET","KAZ":"KZ","UZB":"UZ","KGZ":"KG","AZE":"AZ","IRN":"IR","KWT":"KW","BHR":"BH","QAT":"QA","ARE":"AE","TKM":"TM","AFG":"AF","YEM":"YE","OMN":"OM","SOM":"SO","TJK":"TJ","PAK":"PK","NPL":"NP","IND":"IN","MDV":"MV","LKA":"LK","RUS":"RU","MNG":"MN","BTN":"BT","BGD":"BD","CHN":"CN","MMR":"MM","THA":"TH","LAO":"LA","VNM":"VN","KHM":"KH","MYS":"MY","TWN":"TW","PRK":"KP","KOR":"KR","PHL":"PH","BRN":"BN","SGP":"SG","PLW":"PW","JPN":"JP","MNP":"MP","GUM":"GU","FSM":"FM","MHL":"MH","NRU":"NR","GAB":"GA","COG":"CG","AGO":"AO","NAM":"NA","COD":"CD","RWA":"RW","BDI":"BI","ZMB":"ZM","ZWE":"ZW","TZA":"TZ","MWI":"MW","MOZ":"MZ","COM":"KM","BWA":"BW","ZAF":"ZA","SWZ":"SZ","LSO":"LS","BVT":"BV","SYC":"SC","MYT":"YT","MDG":"MG","REU":"RE","MUS":"MU","ATF":"TF","HMD":"HM","IDN":"ID","TLS":"TL","AUS":"AU","PNG":"PG","SLB":"SB","FJI":"FJ","VUT":"VU","TUV":"TV","UMI":"UM","WLF":"WF","NCL":"NC","NZL":"NZ"});

const HORS_ISO = Object.freeze({ XKO: "Kosovo", ZNC: "Chypre du Nord", XAD: "Akrotiri et Dhekelia", XCA: "Mer Caspienne" });

let annuaire = null;
const regions = () => {
  if (annuaire !== null) return annuaire;
  try { annuaire = new Intl.DisplayNames(["fr"], { type: "region" }); } catch { annuaire = false; }
  return annuaire;
};

/** Le nom français d'un pays, à partir de son code à trois lettres ; à défaut, le nom reçu. */
export const nomFrancaisDuPays = (nom, code = "") => {
  const c = String(code ?? "").trim().toUpperCase();
  if (HORS_ISO[c]) return HORS_ISO[c];
  const a2 = ALPHA3_VERS_ALPHA2[c];
  const r = a2 ? regions() : null;
  if (r) {
    try {
      const fr = r.of(a2);
      if (fr && fr !== a2) return fr;
    } catch { /* code inconnu du navigateur */ }
  }
  return String(nom ?? "");
};

// Les organisations du catalogue d'origine, sous leur nom français. Comme pour
// les pays, l'identifiant du moteur ne change pas : seul l'affichage.
const ORGANISATIONS = Object.freeze({
  "Catholic Church": "Église catholique",
  "Universal Postal Union": "Union postale universelle",
  "Interpol": "Interpol",
  "Commonwealth of Nations": "Commonwealth",
  "International Monetary Fund": "Fonds monétaire international",
  "World Bank": "Banque mondiale",
  "United Nations": "Nations unies",
  "United Nations Security Council": "Conseil de sécurité des Nations unies",
  "Arab League": "Ligue arabe",
  "Organization of American States": "Organisation des États américains",
  "NATO": "OTAN",
  "OPEC": "OPEP",
  "Non-Aligned Movement": "Mouvement des non-alignés",
  "ASEAN": "ASEAN",
  "G7": "G7",
  "ECOWAS": "CEDEAO",
  "Mercosur": "Mercosur",
  "SADC": "SADC",
  "European Union": "Union européenne",
  "World Trade Organization": "Organisation mondiale du commerce",
  "Eurozone": "Zone euro",
  "G20": "G20",
  "Shanghai Cooperation Organisation": "Organisation de coopération de Shanghai",
  "African Union": "Union africaine",
  "BRICS": "BRICS",
});

/** Le nom français d'une organisation internationale ; à défaut, le nom reçu. */
export const nomFrancaisDOrganisation = (nom) => ORGANISATIONS[String(nom ?? "")] ?? String(nom ?? "");
