import { holidayDB } from "@/lib/db";

const HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-02-18", name: "Chinese New Year Holiday" },
  { date: "2026-03-20", name: "Hari Raya Puasa" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-30", name: "Vesak Day" },
  { date: "2026-06-06", name: "Hari Raya Haji" },
  { date: "2026-08-09", name: "National Day" },
  { date: "2026-11-01", name: "Deepavali" },
  { date: "2026-12-25", name: "Christmas Day" },
];

holidayDB.upsertMany(HOLIDAYS_2026);

process.stdout.write(`Seeded ${HOLIDAYS_2026.length} holidays\n`);
