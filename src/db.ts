import { SQL } from "bun";
import { open } from "lmdb";
import { VersionedStore } from "~/utils/versioned-store";

const root = open({ path: "./data" });

/** Sentinel key written to the root LMDB store once SQLite migration completes. */
const SQLITE_MIGRATION_KEY = "_sqlite_migration_done";

export interface ServerConfig {
  guild_id: string;
  room_channel_id: string | null;
  room_name_template: string | null;
  room_category_sync: boolean;
  server_mods_as_room_mods: boolean;
  experiment_keyboard_layout_fix: boolean;
}

export const serverConfigs = new VersionedStore<ServerConfig>({
  db: root,
  name: "server-configs",
  version: 1,
  migrations: {},
});

/** Per-guild ordered list of category IDs for temporary room placement. */
export const serverConfigCategories = root.openDB<string[], string>({ name: "server-config-categories" });

export type VoiceTemporaryRoomAccessMode = "open" | "locked" | "hidden";

export type VoiceTemporaryRoom = {
  channel_id: string;
  guild_id: string;
  owner_id: string;
  access_mode: VoiceTemporaryRoomAccessMode;
  /** User IDs currently tracked as members of this room. */
  members: string[];
  /** User IDs on the room whitelist. */
  whitelist: string[];
  /** User IDs on the room blacklist. */
  blacklist: string[];
  /** User IDs who are moderators of this room. */
  moderators: string[];
};

export const voiceTemporaryRooms = new VersionedStore<VoiceTemporaryRoom>({
  db: root,
  name: "voice-temporary-rooms",
  version: 1,
  migrations: {},
});

// ---------------------------------------------------------------------------
// SQLite → LMDB one-time migration
// ---------------------------------------------------------------------------

function groupByKey(rows: any[], keyField: string, valueField: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const key: string = row[keyField];
    const list = map.get(key) ?? [];
    list.push(row[valueField]);
    map.set(key, list);
  }
  return map;
}

async function migrateFromSqlite(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? "sqlite://data.sqlite";
  const sqlitePath = dbUrl.replace(/^sqlite:\/\//, "");

  if (!(await Bun.file(sqlitePath).exists())) return;

  const sqliteDb = new SQL(dbUrl);

  try {
    const [configs, categories, rooms, members, whitelist, blacklist, moderators] = await Promise.all([
      sqliteDb<any[]>`SELECT * FROM server_configs`.catch(() => [] as any[]),
      sqliteDb<any[]>`SELECT * FROM server_config_categories ORDER BY position ASC`.catch(() => [] as any[]),
      sqliteDb<any[]>`SELECT * FROM voice_temporary_rooms`.catch(() => [] as any[]),
      sqliteDb<any[]>`SELECT * FROM voice_temporary_room_members`.catch(() => [] as any[]),
      sqliteDb<any[]>`SELECT * FROM voice_temporary_room_whitelist`.catch(() => [] as any[]),
      sqliteDb<any[]>`SELECT * FROM voice_temporary_room_blacklist`.catch(() => [] as any[]),
      sqliteDb<any[]>`SELECT * FROM voice_temporary_room_moderators`.catch(() => [] as any[]),
    ]);

    const categoriesByGuild = groupByKey(categories, "guild_id", "category_id");
    const membersByChannel = groupByKey(members, "channel_id", "user_id");
    const whitelistByChannel = groupByKey(whitelist, "channel_id", "user_id");
    const blacklistByChannel = groupByKey(blacklist, "channel_id", "user_id");
    const moderatorsByChannel = groupByKey(moderators, "channel_id", "user_id");

    for (const row of configs) {
      await serverConfigs.put(row.guild_id, {
        guild_id: row.guild_id,
        room_channel_id: row.room_channel_id ?? null,
        room_name_template: row.room_name_template ?? null,
        room_category_sync: Boolean(row.room_category_sync),
        server_mods_as_room_mods: Boolean(row.server_mods_as_room_mods),
        experiment_keyboard_layout_fix: Boolean(row.experiment_keyboard_layout_fix),
      });

      const cats = categoriesByGuild.get(row.guild_id);
      if (cats?.length) await serverConfigCategories.put(row.guild_id, cats);
    }

    for (const room of rooms) {
      await voiceTemporaryRooms.put(room.channel_id, {
        channel_id: room.channel_id,
        guild_id: room.guild_id,
        owner_id: room.owner_id,
        access_mode: (room.access_mode ?? "open") as VoiceTemporaryRoomAccessMode,
        members: membersByChannel.get(room.channel_id) ?? [],
        whitelist: whitelistByChannel.get(room.channel_id) ?? [],
        blacklist: blacklistByChannel.get(room.channel_id) ?? [],
        moderators: moderatorsByChannel.get(room.channel_id) ?? [],
      });
    }

    console.info(`[db] Migrated ${configs.length} server config(s) and ${rooms.length} voice room(s) from SQLite to LMDB.`);
  } catch (err) {
    console.error("[db] SQLite → LMDB migration failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function initDb() {
  if (!root.get(SQLITE_MIGRATION_KEY)) {
    await migrateFromSqlite();
    await root.put(SQLITE_MIGRATION_KEY, true);
  }
}
