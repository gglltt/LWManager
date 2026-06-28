function getIsoWeekRange(yearRaw, weekRaw) {
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid ISO year");
  if (!Number.isInteger(week) || week < 1 || week > 53) throw new Error("Invalid ISO week");

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  if (start.getUTCFullYear() > year && week > 51) throw new Error("Invalid ISO week for year");

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = { getIsoWeekRange, formatIsoDate };
