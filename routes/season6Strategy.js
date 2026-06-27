const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const weeks = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

const strategyData = {
  title: "Shadow Rainforest — Strategia S6",
  subtitle: "Guida strategica sintetica per l'alleanza · piano operativo 4 vs 4",
  intro:
    "La Stagione 6 di Last War Survival richiede coordinamento di fazione, controllo del territorio e gestione intelligente delle risorse. L’obiettivo non è vincere con la forza del singolo, ma massimizzare l’Influenza della fazione attraverso diplomazia, crescita ordinata, difesa dei fronti corretti e uso mirato degli eventi settimanali.",
  updatedAt: "Aggiornato al 24/06/2026",
  kpis: [
    { label: "Nostra fazione", value: "≈ 716B" },
    { label: "Nemici", value: "≈ 561B" },
    { label: "Confine chiave", value: "921" },
    { label: "Centro/Altari", value: "813" },
    { label: "Partner naturale", value: "846" }
  ],
  mapRows: [
    [
      { server: "846", label: "alleato", type: "ally" },
      { server: "833", label: "NOI", type: "self" },
      { server: "921", label: "nemico", type: "enemy" }
    ],
    [
      { server: "848", label: "nemico", type: "enemy" },
      { server: "813", label: "Altari", type: "center" },
      { server: "898", label: "nemico", type: "enemy" }
    ],
    [
      { server: "849", label: "nemico", type: "enemy" },
      { server: "863", label: "alleato", type: "ally" },
      { server: "860", label: "alleato", type: "ally" }
    ]
  ],
  mapNotes: [
    "Nostro unico confine nemico: 921, a destra.",
    "Confiniamo con il Centro 813, quindi abbiamo vantaggio posizionale nella contesa degli Altari.",
    "Patto naturale: 846, alleato adiacente a sinistra."
  ],
  factions: [
    {
      title: "FORESTA FITTA (NOI)",
      modifier: "friendly",
      rows: ["846 (3°): ≈ 227B", "833 (2° · NOI): ≈ 222B", "863 (4°): ≈ 166B", "860 (1°): ≈ 102B (top-heavy)"],
      total: "≈ 716B"
    },
    {
      title: "PALUDI (NEMICI)",
      modifier: "enemy",
      rows: ["921 (2°): ≈ 171B", "848 (1°): ≈ 164B", "898 (3°): ≈ 114B", "849 (4°): ≈ 112B"],
      total: "≈ 561B"
    }
  ],
  strategicReading:
    "La nostra fazione è più profonda: circa 716B contro 561B. Attenzione però: 860 è molto top-heavy, con una sola grande alleanza [RCo] da 32,8B e l’individuo più forte della mappa, Bandit87, da 659M. Questo significa che la forza complessiva va sfruttata con coordinamento e non con azioni isolate.",
  fronts: [
    {
      title: "FRONTE ALTO — DURO",
      text:
        "Noi 833 + 846 contro 921 + 848, cioè contro i due server nemici più forti. Qui ci siamo noi. Il nostro compito è tenere la linea sul confine 921, difendere bene e contendere gli Altari nel centro 813. Non dobbiamo sbilanciarci in attacco."
    },
    {
      title: "FRONTE BASSO — FAVOREVOLE",
      text:
        "860 + 863 contro 849 + 898, cioè contro i due server nemici più deboli. È il fronte dove la fazione può sfondare, soprattutto con 860 come punta offensiva. La stagione si vince spingendo in basso e tenendo la linea in alto."
    }
  ],
  priorities: [
    ["Difesa del confine 921", "È il nostro unico fronte nemico diretto. 921 è il server nemico più profondo e sarà il fronte più delicato."],
    ["Contesa Altari (813)", "Confiniamo con il centro della mappa. Questo ci dà un vantaggio posizionale da sfruttare soprattutto dalla terza settimana."],
    ["Patto con 846", "846 è alleato adiacente e server più profondo, con circa 227B. Una possibile alleanza di riferimento è [NukE] Sinners, circa 28,9B."],
    ["Coordinamento sotto [2HOT]", "[2HOT] è il riferimento principale del server 833. Serve allineamento sul fronte alto, soprattutto contro 921."],
    ["Crescita → poi Warlord", "Tutti Ingegnere nelle settimane W1-W4. Il core combat passerà a Warlord prima della W5, quando inizia la parte più dura della guerra."]
  ],
  categories: ["CRESCITA", "PESCA", "ALTARI", "DIPLOMAZIA", "PROFESSIONE", "GUERRA", "FINALE"],
  dataNotes:
    "Le somme sono parziali e basate sulle principali alleanze rilevate per server. Le classifiche individuali considerano solo i player presenti nei dati disponibili. I valori vanno aggiornati quando arrivano nuovi export o screenshot in-game."
};

const ganttRows = [
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
];

router.get("/", requireAuth, (req, res) => {
  res.render("season6-strategy", {
    title: "Strategia S6",
    user: req.user,
    extraCss: ["/css/season6-strategy.css"],
    extraJs: ["/js/season6-strategy.js"],
    strategyData,
    ganttRows,
    weeks
  });
});

module.exports = router;
