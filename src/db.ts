import { SQL } from "bun";
import { open } from "lmdb";
import { VersionedStore } from "~/utils/versioned-store";

const root = open({ path: "./data" });

/** Sentinel key written to the root LMDB store once SQLite migration completes. */
const SQLITE_MIGRATION_KEY = "_sqlite_migration_done";

export enum ExperimentFlags {
  None = 0,
  RussianKeyboardLayoutFix =  1 << 0,
}

export interface ServerConfig {
  voice: {
    enabled: boolean;
    triggerChannelId: string | null;
    nameTemplate: string;
    categories: string[];
    categoryPermissionSync: boolean;
    promoteServerMods: boolean;
  };
  experiments: ExperimentFlags;
}

export const serverConfigs = new VersionedStore<ServerConfig>({
  db: root,
  name: "server-configs",
  version: 1,
  migrations: {},
  default: { voice: { enabled: false, triggerChannelId: null, nameTemplate: "{username}", categories: [], categoryPermissionSync: false, promoteServerMods: false }, experiments: 0 },
});

export enum VoiceTemporaryRoomAccessMode {
  Open,
  Locked,
  Hidden,
}

export type VoiceTemporaryRoom = {
  guildId: string;
  ownerId: string;
  accessMode: VoiceTemporaryRoomAccessMode;
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
  default: { guildId: "", ownerId: "", accessMode: VoiceTemporaryRoomAccessMode.Open, members: [], whitelist: [], blacklist: [], moderators: [] },
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
        voice: {
          enabled: Boolean(row.voice_enabled),
          triggerChannelId: row.trigger_channel_id ?? null,
          nameTemplate: row.name_template ?? null,
          categories: categoriesByGuild.get(row.guild_id) ?? [],
          categoryPermissionSync: Boolean(row.category_permission_sync),
          promoteServerMods: Boolean(row.promote_server_mods),
        },
        experiments: (row.experiment_keyboard_layout_fix ? ExperimentFlags.RussianKeyboardLayoutFix : 0),
      });
    }

    const accessModeMapper: Record<string, VoiceTemporaryRoomAccessMode> = {
      "open": VoiceTemporaryRoomAccessMode.Open,
      "locked": VoiceTemporaryRoomAccessMode.Locked,
      "hidden": VoiceTemporaryRoomAccessMode.Hidden,
    }

    for (const room of rooms) {
      await voiceTemporaryRooms.put(room.channel_id, {
        guildId: room.guild_id,
        ownerId: room.owner_id,
        accessMode: accessModeMapper[room.access_mode ?? "open"],
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
