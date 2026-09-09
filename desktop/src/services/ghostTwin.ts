export interface GhostTwinConfig {
  entityName: string;
  count: number;
  includeEdgeCases: boolean;
  fields?: Record<string, "name" | "email" | "uuid" | "price" | "status" | "date" | "text">;
}

const FIRST_NAMES = ["Ada", "Alan", "Linus", "Grace", "Tim", "Satoshi", "Guido", "Brendan", "Bjarne", "Ömür", "Gökçe", "Zeynep", "Müller", "François", "Kenji"];
const LAST_NAMES = ["Lovelace", "Turing", "Torvalds", "Hopper", "Berners-Lee", "Nakamoto", "van Rossum", "Eich", "Stroustrup", "Yılmaz", "Kaya", "Schmidt", "Dubois", "Tanaka"];
const DOMAINS = ["example.com", "conductor.dev", "testmail.org", "domain.io", "corp.internal"];
const STATUSES = ["active", "pending", "suspended", "archived", "draft"];

// Edge cases that break production systems
const UNICODE_EDGE_CASES = [
  "Dr. John O'Connor-Smith Jr.",
  "José Ramón Peña-García",
  "Жанна д'Арк",
  "王小明",
  "null",
  "undefined",
  "Robert'); DROP TABLE Students;--",
  "<script>alert('xss')</script>",
  "🚀 🌟 💻 [Unicode Space]",
  " ".repeat(50),
];

export function generateGhostTwinDataset(
  configOrSchema: GhostTwinConfig | Record<string, unknown>,
  countParam?: number
): Record<string, unknown>[] & { records: Record<string, unknown>[] } {
  const records: Record<string, unknown>[] = [];
  const rawCount = typeof countParam === "number" ? countParam : (configOrSchema as any).count;
  const total = Math.max(1, Math.min(typeof rawCount === "number" ? rawCount : 5, 500));
  const includeEdgeCases = (configOrSchema as any).includeEdgeCases ?? true;

  for (let i = 0; i < total; i++) {
    const isEdgeCase = includeEdgeCases && (i % 7 === 0 || i === 0);
    const firstName = isEdgeCase 
      ? UNICODE_EDGE_CASES[i % UNICODE_EDGE_CASES.length] 
      : FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const cleanHandle = firstName.toLowerCase().replace(/[^a-z0-9]/g, "") || `user${i}`;
    const email = isEdgeCase && i % 2 === 0 
      ? `${cleanHandle}+test_edge@${DOMAINS[0]}` 
      : `${cleanHandle}.${lastName.toLowerCase()}@${DOMAINS[i % DOMAINS.length]}`;

    records.push({
      id: `usr_${crypto.randomUUID().slice(0, 12)}`,
      name: `${firstName} ${lastName}`,
      email,
      role: i === 0 ? "admin" : i % 5 === 0 ? "editor" : "member",
      status: STATUSES[i % STATUSES.length],
      balance: isEdgeCase ? (i % 3 === 0 ? 0 : -14.99) : parseFloat((Math.random() * 500).toFixed(2)),
      metadata: {
        lastLogin: new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString(),
        loginCount: isEdgeCase ? 0 : Math.floor(Math.random() * 250),
        isSyntheticTwin: true,
        gdprCompliant: true,
      },
    });
  }

  const result: any = records;
  result.records = records;
  return result;
}
