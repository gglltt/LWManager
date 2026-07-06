const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { createEventLog } = require("../utils/eventLog");
const { getConfig, validateConfig, syncProdToQa } = require("../services/syncProdToQa");

const router = express.Router();

function statusKey(resultOrKey) {
  const key = typeof resultOrKey === "string" ? resultOrKey : resultOrKey?.error;
  return key || "sync_failed";
}

router.get("/", requireAuth, requireAdmin, (req, res) => {
  const config = getConfig();
  res.render("admin/index", {
    user: req.user,
    syncEnabled: config.enabled,
    syncConfigError: validateConfig(config),
    syncMessage: req.query.syncMessage || "",
    syncStatus: req.query.syncStatus || ""
  });
});

router.post("/sync-prod-to-qa", requireAuth, requireAdmin, async (req, res) => {
  const t = res.locals.t || ((key) => key);
  const confirmation = String(req.body.confirmation || "").trim();

  if (confirmation !== "ALLINEA QA") {
    return res.redirect(`/admin?syncStatus=error&syncMessage=${encodeURIComponent(t("sync_confirmation_required"))}`);
  }

  const validationError = validateConfig();
  if (validationError) {
    await createEventLog(req, "sync_prod_to_qa", `userLevel=${req.user.authLevel}|success=false|error=${validationError}`);
    return res.redirect(`/admin?syncStatus=error&syncMessage=${encodeURIComponent(t(statusKey(validationError)))}`);
  }

  const result = await syncProdToQa();
  const details = [
    `userLevel=${req.user.authLevel}`,
    `success=${result.success}`,
    `collections=${result.collections.join(",")}`,
    `totalDocuments=${result.totalDocuments}`,
    `documentsByCollection=${JSON.stringify(result.documentsByCollection)}`,
    result.error ? `error=${result.error}` : "error="
  ].join("|");
  await createEventLog(req, "sync_prod_to_qa", details);

  const messageKey = result.success ? "sync_success" : statusKey(result);
  return res.redirect(`/admin?syncStatus=${result.success ? "success" : "error"}&syncMessage=${encodeURIComponent(t(messageKey))}`);
});

module.exports = router;
