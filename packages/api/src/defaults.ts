import type { PrismaClient } from "@chordsheet/db";

export const DEFAULT_TEMPLATES: Array<{ name: string; description: string; slots: string[] }> = [
  {
    name: "Catholic Mass",
    description: "Order of the Mass (Roman Rite)",
    slots: [
      "Entrance",
      "Kyrie (Lord, Have Mercy)",
      "Gloria",
      "Responsorial Psalm",
      "Gospel Acclamation",
      "Offertory",
      "Sanctus (Holy, Holy)",
      "Memorial Acclamation",
      "Great Amen",
      "Lord's Prayer",
      "Agnus Dei (Lamb of God)",
      "Communion",
      "Thanksgiving",
      "Recessional",
    ],
  },
  {
    name: "Worship Service",
    description: "Contemporary praise & worship set",
    slots: ["Call to Worship", "Praise", "Praise", "Worship", "Worship", "Offering", "Response", "Closing"],
  },
];

export async function seedDefaultTemplates(db: Pick<PrismaClient, "setlistTemplate">, userId: string) {
  for (const t of DEFAULT_TEMPLATES) {
    await db.setlistTemplate.create({
      data: {
        userId,
        name: t.name,
        description: t.description,
        slots: { create: t.slots.map((label, position) => ({ label, position })) },
      },
    });
  }
}
