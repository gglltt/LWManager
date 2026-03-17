const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parseItalianDate(input) {
  if (!input || typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (dt.getFullYear() === Number(y) && dt.getMonth() === Number(m) - 1 && dt.getDate() === Number(d)) {
      return dt;
    }
    return null;
  }

  const itMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (itMatch) {
    const [_, d, m, y] = itMatch;
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    const dt = new Date(year, month - 1, day);
    if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
      return dt;
    }
  }

  return null;
}

router.get("/nuova", requireAuth, (req, res) => {
  res.render("spese/new", {
    user: req.user,
    form: {
      commessaType: "",
      expenseCode: "",
      entryMode: "manual",
      expenseDate: "",
      amount: "",
      note: ""
    },
    message: null,
    error: null
  });
});

router.post("/nuova", requireAuth, (req, res) => {
  const form = {
    commessaType: (req.body.commessaType || "").trim(),
    expenseCode: (req.body.expenseCode || "").trim(),
    entryMode: (req.body.entryMode || "manual").trim(),
    expenseDate: (req.body.expenseDate || "").trim(),
    amount: (req.body.amount || "").trim(),
    note: (req.body.note || "").trim()
  };

  if (!form.commessaType || !form.expenseCode) {
    return res.status(400).render("spese/new", {
      user: req.user,
      form,
      message: null,
      error: "Tipologia commessa e codice spesa sono obbligatori."
    });
  }

  const parsedDate = parseItalianDate(form.expenseDate);
  if (!parsedDate) {
    return res.status(400).render("spese/new", {
      user: req.user,
      form,
      message: null,
      error: "Inserisci una data valida (calendario o formato GG/MM/AAAA)."
    });
  }

  return res.render("spese/new", {
    user: req.user,
    form: {
      commessaType: "",
      expenseCode: "",
      entryMode: "manual",
      expenseDate: "",
      amount: "",
      note: ""
    },
    message: `Spesa registrata (${form.entryMode}) - Data ${parsedDate.toLocaleDateString("it-IT")}`,
    error: null
  });
});

module.exports = router;
