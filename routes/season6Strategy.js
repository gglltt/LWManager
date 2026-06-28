const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const weeks = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

const labels = {
  it: { title: "Strategia S6", kpis: "Indicatori chiave", map: "Mappa e fronti", position: "Note posizione", factions: "Forza delle fazioni", reading: "Lettura strategica", fronts: "I due fronti", priorities: "Priorità operative [BISS]", gantt: "Gantt attività per settimana di stagione", inline: "Eventi ricorrenti: giorni di guerra = mercoledì e sabato ogni settimana. Altari = martedì dalla terza settimana. Le date esatte vanno verificate in-game.", category: "Categoria", activity: "Attività", notes: "Note", mobile: "Vista mobile Gantt", weeks: "Settimane", legend: "Legenda categorie", milestone: "◆ = evento puntuale / milestone", dataNotes: "Note sui dati", toggle: "Mostra/Nascondi note" },
  en: { title: "S6 Strategy", kpis: "Key indicators", map: "Map and fronts", position: "Position notes", factions: "Faction strength", reading: "Strategic reading", fronts: "The two fronts", priorities: "Operational priorities [BISS]", gantt: "Season weekly activity Gantt", inline: "Recurring events: war days = Wednesday and Saturday every week. Altars = Tuesday from the third week. Exact dates must be checked in-game.", category: "Category", activity: "Activity", notes: "Notes", mobile: "Mobile Gantt view", weeks: "Weeks", legend: "Category legend", milestone: "◆ = one-time event / milestone", dataNotes: "Data notes", toggle: "Show/Hide notes" },
  fr: { title: "Stratégie S6", kpis: "Indicateurs clés", map: "Carte et fronts", position: "Notes de position", factions: "Force des factions", reading: "Lecture stratégique", fronts: "Les deux fronts", priorities: "Priorités opérationnelles [BISS]", gantt: "Gantt hebdomadaire des activités de saison", inline: "Événements récurrents : jours de guerre = mercredi et samedi chaque semaine. Autels = mardi à partir de la troisième semaine. Les dates exactes doivent être vérifiées en jeu.", category: "Catégorie", activity: "Activité", notes: "Notes", mobile: "Vue mobile Gantt", weeks: "Semaines", legend: "Légende des catégories", milestone: "◆ = événement ponctuel / jalon", dataNotes: "Notes sur les données", toggle: "Afficher/Masquer les notes" }
};

const localized = {
  it: {
    title: "Shadow Rainforest — Strategia S6",
    subtitle: "Guida strategica sintetica per l'alleanza · piano operativo 4 vs 4",
    intro: "La Stagione 6 di Last War Survival richiede coordinamento di fazione, controllo del territorio e gestione intelligente delle risorse. L’obiettivo non è vincere con la forza del singolo, ma massimizzare l’Influenza della fazione attraverso diplomazia, crescita ordinata, difesa dei fronti corretti e uso mirato degli eventi settimanali.",
    updatedAt: "Aggiornato al 24/06/2026",
    ally: "alleato", self: "NOI", enemy: "nemico", center: "Altari",
    mapNotes: ["Nostro unico confine nemico: 921, a destra.", "Confiniamo con il Centro 813, quindi abbiamo vantaggio posizionale nella contesa degli Altari.", "Patto naturale: 846, alleato adiacente a sinistra."],
    strategicReading: "La nostra fazione è più profonda: circa 716B contro 561B. Attenzione però: 860 è molto top-heavy, con una sola grande alleanza [RCo] da 32,8B e l’individuo più forte della mappa, Bandit87, da 659M. Questo significa che la forza complessiva va sfruttata con coordinamento e non con azioni isolate.",
    fronts: [{ title: "FRONTE ALTO — DURO", text: "Noi 833 + 846 contro 921 + 848, cioè contro i due server nemici più forti. Qui ci siamo noi. Il nostro compito è tenere la linea sul confine 921, difendere bene e contendere gli Altari nel centro 813. Non dobbiamo sbilanciarci in attacco." }, { title: "FRONTE BASSO — FAVOREVOLE", text: "860 + 863 contro 849 + 898, cioè contro i due server nemici più deboli. È il fronte dove la fazione può sfondare, soprattutto con 860 come punta offensiva. La stagione si vince spingendo in basso e tenendo la linea in alto." }],
    priorities: [["Difesa del confine 921", "È il nostro unico fronte nemico diretto. 921 è il server nemico più profondo e sarà il fronte più delicato."], ["Contesa Altari (813)", "Confiniamo con il centro della mappa. Questo ci dà un vantaggio posizionale da sfruttare soprattutto dalla terza settimana."], ["Patto con 846", "846 è alleato adiacente e server più profondo, con circa 227B. Una possibile alleanza di riferimento è [NukE] Sinners, circa 28,9B."], ["Coordinamento sotto [2HOT]", "[2HOT] è il riferimento principale del server 833. Serve allineamento sul fronte alto, soprattutto contro 921."], ["Crescita → poi Warlord", "Tutti Ingegnere nelle settimane W1-W4. Il core combat passerà a Warlord prima della W5, quando inizia la parte più dura della guerra."]],
    categories: ["CRESCITA", "PESCA", "ALTARI", "DIPLOMAZIA", "PROFESSIONE", "GUERRA", "FINALE"],
    dataNotes: "Le somme sono parziali e basate sulle principali alleanze rilevate per server. Le classifiche individuali considerano solo i player presenti nei dati disponibili. I valori vanno aggiornati quando arrivano nuovi export o screenshot in-game."
  },
  en: {
    title: "Shadow Rainforest — S6 Strategy", subtitle: "Concise alliance strategy guide · 4 vs 4 operational plan", intro: "Season 6 of Last War Survival requires faction coordination, territory control and smart resource management. The goal is not to win through individual strength, but to maximize faction Influence through diplomacy, ordered growth, defense of the correct fronts and targeted weekly events.", updatedAt: "Updated on 24/06/2026", ally: "ally", self: "US", enemy: "enemy", center: "Altars", mapNotes: ["Our only enemy border: 921, on the right.", "We border Center 813, so we have positional advantage in the Altar contest.", "Natural pact: 846, adjacent ally on the left."], strategicReading: "Our faction is deeper: about 716B versus 561B. Be careful: 860 is very top-heavy, with one major alliance [RCo] at 32.8B and the strongest individual on the map, Bandit87, at 659M. Overall strength must be used with coordination, not isolated actions.", fronts: [{ title: "UPPER FRONT — HARD", text: "833 + 846 against 921 + 848: the two strongest enemy servers. This is our front. Our task is to hold the 921 border, defend well and contest the Altars in center 813 without overextending." }, { title: "LOWER FRONT — FAVORABLE", text: "860 + 863 against 849 + 898: the two weaker enemy servers. This is where the faction can break through, especially with 860 as the offensive spearhead. Win by pushing lower and holding upper." }], priorities: [["Defend the 921 border", "It is our only direct enemy front and will be the most delicate one."], ["Contest Altars (813)", "We border the center, giving us positional advantage from week three onward."], ["Pact with 846", "846 is an adjacent ally and the deepest server at about 227B; [NukE] Sinners may be a reference alliance."], ["Coordinate under [2HOT]", "[2HOT] is the main reference for server 833; alignment is needed on the upper front."], ["Growth → then Warlord", "Everyone Engineer in W1-W4. The combat core switches to Warlord before W5."]], categories: ["GROWTH", "FISHING", "ALTARS", "DIPLOMACY", "PROFESSION", "WAR", "FINAL"], dataNotes: "Totals are partial and based on the main alliances detected per server. Individual rankings only include players available in the data. Values should be updated when new exports or in-game screenshots arrive."
  }
};
localized.fr = { ...localized.en, title: "Shadow Rainforest — Stratégie S6", subtitle: "Guide stratégique synthétique pour l’alliance · plan opérationnel 4 contre 4", intro: "La Saison 6 de Last War Survival exige coordination de faction, contrôle du territoire et gestion intelligente des ressources. L’objectif n’est pas de gagner par la seule force individuelle, mais de maximiser l’Influence de faction par la diplomatie, une croissance ordonnée, la défense des bons fronts et l’usage ciblé des événements hebdomadaires.", updatedAt: "Mis à jour le 24/06/2026", ally: "allié", self: "NOUS", enemy: "ennemi", center: "Autels", mapNotes: ["Notre seule frontière ennemie : 921, à droite.", "Nous touchons le Centre 813, donc nous avons un avantage de position pour les Autels.", "Pacte naturel : 846, allié adjacent à gauche."], strategicReading: "Notre faction est plus profonde : environ 716B contre 561B. Attention : 860 est très concentré en haut, avec une grande alliance [RCo] à 32,8B et le joueur le plus fort de la carte, Bandit87, à 659M. Cette force doit être utilisée avec coordination, pas par actions isolées.", fronts: [{ title: "FRONT HAUT — DIFFICILE", text: "833 + 846 contre 921 + 848 : les deux serveurs ennemis les plus forts. C’est notre front. Nous devons tenir la frontière 921, bien défendre et contester les Autels du centre 813 sans trop nous exposer." }, { title: "FRONT BAS — FAVORABLE", text: "860 + 863 contre 849 + 898 : les deux serveurs ennemis les plus faibles. C’est là que la faction peut percer, surtout avec 860 comme pointe offensive. La saison se gagne en poussant en bas et en tenant en haut." }], priorities: [["Défense de la frontière 921", "C’est notre seul front ennemi direct et le plus délicat."], ["Contestation des Autels (813)", "Nous touchons le centre, ce qui donne un avantage de position dès la troisième semaine."], ["Pacte avec 846", "846 est un allié adjacent et le serveur le plus profond, environ 227B."], ["Coordination sous [2HOT]", "[2HOT] est la référence principale du serveur 833; il faut s’aligner sur le front haut."], ["Croissance → puis Warlord", "Tous Ingénieur en W1-W4. Le noyau combat passe Warlord avant W5."]], categories: ["CROISSANCE", "PÊCHE", "AUTELS", "DIPLOMATIE", "PROFESSION", "GUERRE", "FINAL"], dataNotes: "Les totaux sont partiels et basés sur les principales alliances relevées par serveur. Les classements individuels incluent seulement les joueurs disponibles dans les données. Les valeurs doivent être mises à jour avec les nouveaux exports ou captures en jeu." };

function buildData(lang) {
  const base = localized[lang] || localized.en;
  return {
    ...base,
    labels: labels[lang] || labels.en,
    kpis: [{ label: lang === "fr" ? "Notre faction" : lang === "it" ? "Nostra fazione" : "Our faction", value: "≈ 716B" }, { label: lang === "fr" ? "Ennemis" : lang === "it" ? "Nemici" : "Enemies", value: "≈ 561B" }, { label: lang === "fr" ? "Frontière clé" : lang === "it" ? "Confine chiave" : "Key border", value: "921" }, { label: lang === "fr" ? "Centre/Autels" : lang === "it" ? "Centro/Altari" : "Center/Altars", value: "813" }, { label: lang === "fr" ? "Partenaire naturel" : lang === "it" ? "Partner naturale" : "Natural partner", value: "846" }],
    mapRows: [[{ server: "846", label: base.ally, type: "ally" }, { server: "833", label: base.self, type: "self" }, { server: "921", label: base.enemy, type: "enemy" }], [{ server: "848", label: base.enemy, type: "enemy" }, { server: "813", label: base.center, type: "center" }, { server: "898", label: base.enemy, type: "enemy" }], [{ server: "849", label: base.enemy, type: "enemy" }, { server: "863", label: base.ally, type: "ally" }, { server: "860", label: base.ally, type: "ally" }]],
    factions: [{ title: lang === "fr" ? "FORÊT DENSE (NOUS)" : lang === "it" ? "FORESTA FITTA (NOI)" : "DENSE FOREST (US)", modifier: "friendly", rows: ["846 (3°): ≈ 227B", "833 (2°): ≈ 222B", "863 (4°): ≈ 166B", "860 (1°): ≈ 102B (top-heavy)"], total: "≈ 716B" }, { title: lang === "fr" ? "MARAIS (ENNEMIS)" : lang === "it" ? "PALUDI (NEMICI)" : "SWAMPS (ENEMIES)", modifier: "enemy", rows: ["921 (2°): ≈ 171B", "848 (1°): ≈ 164B", "898 (3°): ≈ 114B", "849 (4°): ≈ 112B"], total: "≈ 561B" }]
  };
}

const ganttRowsByLang = {
  it: [
    { category: "CRESCITA", activity: "Tutti professione Ingegnere (snowball)", active: ["W1", "W2", "W3", "W4"], note: "Switch al combat dopo" },
    { category: "CRESCITA", activity: "Edifici chiave a Lv10 (uno alla volta)", active: ["W1", "W2"], note: "Sblocca gli altri" },
    { category: "CRESCITA", activity: "Fabbriche di Spore a Lv10", active: ["W1", "W2", "W3"], note: "Pass settimanale Lv10" },
    { category: "CRESCITA", activity: "Risveglio Kimberly + Scontro Città", milestone: "W1", note: "4° giorno Kimberly; 3°/5° giorno città" },
    { category: "PESCA", activity: "Zone di Pesca + donazioni (Tecn. Fazione)", active: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"], note: "Merito + EXP fazione" },
    { category: "PESCA", activity: "Pesce Benedetto → Istituto Funghi (buff)", active: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"], note: "Non donabile" },
    { category: "DIPLOMAZIA", activity: "Patto con 846 (alleato adiacente)", active: ["W2", "W3"], note: "Non nei giorni di guerra" },
    { category: "ALTARI", activity: "Altari aperti (MAR dalla 3ª settimana)", active: ["W3", "W4", "W5", "W6", "W7", "W8"], note: "Confiniamo col centro 813" },
    { category: "ALTARI", activity: "Combo Altari (Serpent Breath ecc.)", active: ["W5", "W6", "W7", "W8"], note: "Offensiva coordinata" },
    { category: "PROFESSIONE", activity: "Core combat → Warlord (prima della W5)", milestone: "W4", note: "Certificati limitati" },
    { category: "GUERRA", activity: "Difesa confine 921 (nostro fronte)", active: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"], note: "Fronte alto, duro" },
    { category: "GUERRA", activity: "Coordinamento sotto [2HOT] (fronte alto)", active: ["W3", "W4", "W5", "W6", "W7", "W8"], note: "Leader server 833" },
    { category: "GUERRA", activity: "Spinta fronte BASSO con 860 (vs 849/898)", active: ["W5", "W6", "W7", "W8"], note: "Dove si sfonda" },
    { category: "GUERRA", activity: "Difesa Santuario / città core", active: ["W5", "W6", "W7", "W8"], note: "Santuario = +100k se cade" },
    { category: "FINALE", activity: "Faction Duel — grande guerra 4v4", milestone: "W8", note: "Ranking finale" }
  ],
  en: [
    { category: "GROWTH", activity: "Everyone Engineer profession (snowball)", active: ["W1", "W2", "W3", "W4"], note: "Switch to combat later" },
    { category: "GROWTH", activity: "Key buildings to Lv10 (one at a time)", active: ["W1", "W2"], note: "Unlocks the others" },
    { category: "GROWTH", activity: "Spore Factories to Lv10", active: ["W1", "W2", "W3"], note: "Weekly Lv10 pass" },
    { category: "GROWTH", activity: "Kimberly awakening + city clash", milestone: "W1", note: "Day 4 Kimberly; day 3/5 cities" },
    { category: "FISHING", activity: "Fishing zones + donations (Faction Tech)", active: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"], note: "Merit + faction EXP" },
    { category: "FISHING", activity: "Blessed Fish → Mushroom Institute (buff)", active: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"], note: "Not donatable" },
    { category: "DIPLOMACY", activity: "Pact with 846 (adjacent ally)", active: ["W2", "W3"], note: "Not on war days" },
    { category: "ALTARS", activity: "Altars open (Tuesday from week 3)", active: ["W3", "W4", "W5", "W6", "W7", "W8"], note: "We border center 813" },
    { category: "ALTARS", activity: "Altar combo (Serpent Breath, etc.)", active: ["W5", "W6", "W7", "W8"], note: "Coordinated offense" },
    { category: "PROFESSION", activity: "Combat core → Warlord (before W5)", milestone: "W4", note: "Limited certificates" },
    { category: "WAR", activity: "Defend 921 border (our front)", active: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"], note: "Hard upper front" },
    { category: "WAR", activity: "Coordinate under [2HOT] (upper front)", active: ["W3", "W4", "W5", "W6", "W7", "W8"], note: "Server 833 leader" },
    { category: "WAR", activity: "Push LOWER front with 860 (vs 849/898)", active: ["W5", "W6", "W7", "W8"], note: "Where to break through" },
    { category: "WAR", activity: "Defend Sanctuary / core cities", active: ["W5", "W6", "W7", "W8"], note: "Sanctuary = +100k if it falls" },
    { category: "FINAL", activity: "Faction Duel — major 4v4 war", milestone: "W8", note: "Final ranking" }
  ]
};
ganttRowsByLang.fr = ganttRowsByLang.en.map((row) => ({ ...row }));
ganttRowsByLang.fr[0].category = "CROISSANCE"; ganttRowsByLang.fr[0].activity = "Tous en profession Ingénieur (snowball)"; ganttRowsByLang.fr[0].note = "Passage combat plus tard";
ganttRowsByLang.fr[1].category = "CROISSANCE"; ganttRowsByLang.fr[1].activity = "Bâtiments clés au niv. 10 (un par un)"; ganttRowsByLang.fr[1].note = "Débloque les autres";
ganttRowsByLang.fr[2].category = "CROISSANCE"; ganttRowsByLang.fr[2].activity = "Usines de Spores au niv. 10";
ganttRowsByLang.fr[3].category = "CROISSANCE"; ganttRowsByLang.fr[3].activity = "Éveil Kimberly + choc des villes";
ganttRowsByLang.fr[4].category = "PÊCHE"; ganttRowsByLang.fr[4].activity = "Zones de pêche + dons (Technologie de Faction)";
ganttRowsByLang.fr[5].category = "PÊCHE"; ganttRowsByLang.fr[5].activity = "Poisson béni → Institut du Champignon (buff)";
ganttRowsByLang.fr[6].category = "DIPLOMATIE"; ganttRowsByLang.fr[6].activity = "Pacte avec 846 (allié adjacent)";
ganttRowsByLang.fr[7].category = "AUTELS"; ganttRowsByLang.fr[7].activity = "Autels ouverts (mardi dès semaine 3)";
ganttRowsByLang.fr[8].category = "AUTELS"; ganttRowsByLang.fr[8].activity = "Combo Autels (Serpent Breath, etc.)";
ganttRowsByLang.fr[9].category = "PROFESSION"; ganttRowsByLang.fr[9].activity = "Noyau combat → Warlord (avant W5)";
ganttRowsByLang.fr[10].category = "GUERRE"; ganttRowsByLang.fr[10].activity = "Défense frontière 921 (notre front)";
ganttRowsByLang.fr[11].category = "GUERRE"; ganttRowsByLang.fr[11].activity = "Coordination sous [2HOT] (front haut)";
ganttRowsByLang.fr[12].category = "GUERRE"; ganttRowsByLang.fr[12].activity = "Poussée front BAS avec 860 (vs 849/898)";
ganttRowsByLang.fr[13].category = "GUERRE"; ganttRowsByLang.fr[13].activity = "Défense Sanctuaire / villes clés";
ganttRowsByLang.fr[14].category = "FINAL"; ganttRowsByLang.fr[14].activity = "Duel de Faction — grande guerre 4v4";

router.get("/", requireAuth, (req, res) => {
  const lang = ["it", "fr"].includes(res.locals.currentLang) ? res.locals.currentLang : "en";
  res.render("season6-strategy", { title: (labels[lang] || labels.en).title, user: req.user, extraCss: ["/css/season6-strategy.css"], extraJs: ["/js/season6-strategy.js"], strategyData: buildData(lang), ganttRows: ganttRowsByLang[lang] || ganttRowsByLang.en, weeks });
});

module.exports = router;
