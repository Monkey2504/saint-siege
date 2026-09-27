/*! Saint-Siège — les règles du récit © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
//
// Ce que trois parties rejouées ont montré du récit, et ce qui le corrige. Le
// moteur tenait les chiffres ; le récit, lui, faisait agir le pape sans ordre
// (une encyclique que personne n'avait demandée), oubliait les trois conseillers
// que le joueur venait de choisir, prêtait des citations inventées à des
// cardinaux vivants, écrivait « quarante-deux » et « deux mille vingt-trois »,
// terminait un article sur quatre par une phrase de bilan, et accueillait
// « vendre la chapelle Sixtine » d'une note technique.

import { describeCabinet } from "./advisors.js";

export const REGLES_DU_RECIT = [
  "[Règles du récit — Saint-Siège]",
  "1. Le pape n'agit que par les ordres du joueur. N'attribuez au pape, ni au Saint-Siège en son nom, aucune décision, encyclique, nomination, voyage ou déclaration qu'aucun ordre de ce tour ne contient. Les autres acteurs agissent librement ; la Curie peut préparer, proposer, freiner — elle ne décide pas à la place du pape.",
  "2. Personnes réelles vivantes : ne leur prêtez aucune citation entre guillemets ni aucun acte inventé. Désignez-les par leur fonction ou leur groupe (« un cardinal signataire des dubia », « le préfet du Dicastère pour la doctrine de la foi », « un évêque allemand »). Les personnages inventés du jeu — le cabinet ci-dessous — peuvent être nommés et cités.",
  "3. Écrivez les nombres en chiffres, comme un journal : 42 voix, 81 requises, 2023, 50 millions d'euros. Jamais « quarante-deux » ni « deux mille vingt-trois ».",
  "4. Style de journal, pas de communiqué. Ne terminez pas un article par une phrase de bilan (« marquant une étape décisive », « illustrant », « soulignant », « s'inscrivant dans »). Terminez sur un fait, une réaction ou une conséquence concrète. Variez les ouvertures. Racontez au moins un événement par édition à hauteur de personne : un témoin, un évêque de terrain, un fonctionnaire, un fidèle.",
  "5. Un ordre absurde, grotesque ou indigne de la charge n'est pas accueilli d'une note technique : la presse s'en moque, des évêques s'en indignent publiquement, les fidèles doutent, et le récit le montre à la mesure de l'énormité.",
  "6. Pour chaque ordre de ce tour, renseignez impacts.actionOutcomes avec son identifiant. Si le récit raconte un échec (vote perdu, rejet, refus, report), l'issue est \"failure\" ; un résultat obtenu en partie est \"partial\".",
  "7. Les courants et organismes ne répètent pas d'une édition à l'autre la même déclaration. Chacun manœuvre : il négocie, recrute, fuit une information, change de ligne, ou se tait.",
].join("\n");

/** Le cabinet du pape, pour l'invite : qui ils sont, ce qu'ils apportent et ce qu'ils coûtent. */
export const describeCabinetPourLeRecit = (world) => {
  const lignes = describeCabinet(world);
  if (!lignes.length) return "";
  return [
    "[Le cabinet du pape — les trois conseillers que le joueur a choisis]",
    ...lignes.map((l) => `- ${l}`),
    "Quand un ordre touche le domaine de l'un d'eux, il apparaît dans l'édition : il l'exécute, le freine, le critique ou s'y trompe, conformément à sa qualité et à son défaut ci-dessus. Au moins un conseiller paraît dans chaque édition où un ordre touche une charge du cabinet.",
  ].join("\n");
};
