export type SystemContext = {
  serverDate: string;
  compactDate: string;
  dottedDate: string;
  timezone: "Asia/Shanghai";
};

const SHANGHAI_TIMEZONE = "Asia/Shanghai";

export function getSystemContext(now: Date = new Date()): SystemContext {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    dateParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;

  const { year, month, day } = values;
  return {
    serverDate: `${year}-${month}-${day}`,
    compactDate: `${month}/${day}`,
    dottedDate: `${year}.${month}.${day}`,
    timezone: SHANGHAI_TIMEZONE,
  };
}
