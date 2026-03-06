import { SQL } from "bun";

export type ServerConfig = {
  guild_id: string;
  room_channel_id: string | null;
  room_name_template: string | null;
  room_category_sync: boolean;
  server_mods_as_room_mods: boolean;
};

export const db = new SQL(process.env.DATABASE_URL || "sqlite://tb.sqlite");

export type VoiceTemporaryRoomAccessMode = "open" | "locked" | "hidden";

export type VoiceTemporaryRoom = {
  channel_id: string;
  guild_id: string;
  owner_id: string;
  access_mode: VoiceTemporaryRoomAccessMode;
};

export type VoiceTemporaryRoomModerator = {
  channel_id: string;
  user_id: string;
};

const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS migration_version (
        version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_configs (
        guild_id TEXT PRIMARY KEY,
        room_channel_id TEXT,
        room_name_template TEXT,
        room_category_sync INTEGER NOT NULL DEFAULT 0,
        server_mods_as_room_mods INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS server_config_categories (
        guild_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY(guild_id, category_id)
      );
      CREATE TABLE IF NOT EXISTS voice_temporary_rooms (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        access_mode TEXT NOT NULL DEFAULT 'open'
      );
      CREATE TABLE IF NOT EXISTS voice_temporary_room_whitelist (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY(channel_id, user_id),
        FOREIGN KEY(channel_id) REFERENCES voice_temporary_rooms(channel_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS voice_temporary_room_blacklist (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY(channel_id, user_id),
        FOREIGN KEY(channel_id) REFERENCES voice_temporary_rooms(channel_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS voice_temporary_room_members (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        PRIMARY KEY(channel_id, user_id),
        FOREIGN KEY(channel_id) REFERENCES voice_temporary_rooms(channel_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS voice_temporary_room_moderators (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY(channel_id, user_id),
        FOREIGN KEY(channel_id) REFERENCES voice_temporary_rooms(channel_id) ON DELETE CASCADE
      );
    `,
  },
];

async function runMigrations() {
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set((await db<{ id: number }[]>`SELECT id FROM _migrations`).map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await db.unsafe(migration.sql).catch(() => {});
    await db`INSERT INTO _migrations (id) VALUES (${migration.id})`;
  }
}

export async function initDb() {
  await db.unsafe("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;").catch(() => {});
  await runMigrations();
}

export async function getConfig(guildId: string): Promise<ServerConfig | null> {
  const [row] = await db<any[]>`SELECT * FROM server_configs WHERE guild_id = ${guildId}`;
  if (!row) return null;
  return {
    guild_id: row.guild_id,
    room_channel_id: row.room_channel_id,
    room_name_template: row.room_name_template,
    room_category_sync: Boolean(row.room_category_sync),
    server_mods_as_room_mods: Boolean(row.server_mods_as_room_mods),
  };
}

export async function setConfig(config: ServerConfig) {
  await db`
    INSERT INTO server_configs (guild_id, room_channel_id, room_name_template, room_category_sync, server_mods_as_room_mods)
    VALUES (${config.guild_id}, ${config.room_channel_id}, ${config.room_name_template}, ${config.room_category_sync ? 1 : 0}, ${config.server_mods_as_room_mods ? 1 : 0})
    ON CONFLICT(guild_id) DO UPDATE SET
        room_channel_id=excluded.room_channel_id,
        room_name_template=excluded.room_name_template,
        room_category_sync=excluded.room_category_sync,
        server_mods_as_room_mods=excluded.server_mods_as_room_mods
  `;
}

export async function deleteConfig(guildId: string) {
  await db`DELETE FROM server_configs WHERE guild_id = ${guildId}`;
  await db`DELETE FROM server_config_categories WHERE guild_id = ${guildId}`;
}

export async function getServerConfigCategories(guildId: string): Promise<string[]> {
  const rows = await db<{ category_id: string }[]>`
    SELECT category_id FROM server_config_categories
    WHERE guild_id = ${guildId}
    ORDER BY position ASC
  `;
  return rows.map((r) => r.category_id);
}

export async function setServerConfigCategories(guildId: string, categoryIds: string[]) {
  await db`DELETE FROM server_config_categories WHERE guild_id = ${guildId}`;
  for (let i = 0; i < categoryIds.length; i++) {
    const categoryId = categoryIds[i]!;
    await db`
      INSERT INTO server_config_categories (guild_id, category_id, position)
      VALUES (${guildId}, ${categoryId}, ${i})
    `;
  }
}

export async function getVoiceTemporaryRoom(channelId: string): Promise<VoiceTemporaryRoom | null> {
  const [row] = await db<VoiceTemporaryRoom[]>`SELECT * FROM voice_temporary_rooms WHERE channel_id = ${channelId}`;
  if (!row) return null;
  return { ...row, access_mode: (row.access_mode ?? "open") as VoiceTemporaryRoomAccessMode };
}

export async function getUserCurrentVoiceRoom(userId: string, guildId: string): Promise<VoiceTemporaryRoom | null> {
  const [row] = await db<VoiceTemporaryRoom[]>`
    SELECT vtr.* FROM voice_temporary_rooms vtr
    JOIN voice_temporary_room_members vtrm ON vtr.channel_id = vtrm.channel_id
    WHERE vtrm.user_id = ${userId} AND vtrm.guild_id = ${guildId}
  `;
  if (!row) return null;
  return { ...row, access_mode: (row.access_mode ?? "open") as VoiceTemporaryRoomAccessMode };
}

export async function createVoiceTemporaryRoom(room: VoiceTemporaryRoom) {
  await db`
    INSERT INTO voice_temporary_rooms (channel_id, guild_id, owner_id, access_mode)
    VALUES (${room.channel_id}, ${room.guild_id}, ${room.owner_id}, ${room.access_mode})
  `;
}

export async function setVoiceTemporaryRoomAccessMode(channelId: string, accessMode: VoiceTemporaryRoomAccessMode) {
  await db`UPDATE voice_temporary_rooms SET access_mode = ${accessMode} WHERE channel_id = ${channelId}`;
}

export async function deleteVoiceTemporaryRoom(channelId: string) {
  await db`DELETE FROM voice_temporary_rooms WHERE channel_id = ${channelId}`;
}

export async function addVoiceTemporaryRoomMember(channelId: string, userId: string, guildId: string) {
  await db`
    INSERT OR IGNORE INTO voice_temporary_room_members (channel_id, user_id, guild_id)
    VALUES (${channelId}, ${userId}, ${guildId})
  `;
}

export async function removeUserFromVoiceTemporaryRooms(userId: string, guildId: string): Promise<string | null> {
  const [row] = await db<{ channel_id: string }[]>`
    SELECT channel_id FROM voice_temporary_room_members WHERE user_id = ${userId} AND guild_id = ${guildId}
  `;
  if (!row) return null;
  await db`DELETE FROM voice_temporary_room_members WHERE user_id = ${userId} AND guild_id = ${guildId}`;
  return row.channel_id;
}

export async function countVoiceTemporaryRoomMembers(channelId: string): Promise<number> {
  const [row] = await db<{ count: number }[]>`
    SELECT COUNT(*) as count FROM voice_temporary_room_members WHERE channel_id = ${channelId}
  `;
  return row?.count ?? 0;
}

export async function getEmptyVoiceTemporaryRooms(guildId: string): Promise<string[]> {
  const rows = await db<{ channel_id: string }[]>`
    SELECT vtr.channel_id
    FROM voice_temporary_rooms vtr
    LEFT JOIN voice_temporary_room_members vtrm ON vtr.channel_id = vtrm.channel_id
    WHERE vtr.guild_id = ${guildId} AND vtrm.channel_id IS NULL
  `;
  return rows.map((r) => r.channel_id);
}

export async function addVoiceTemporaryRoomModerator(channelId: string, userId: string) {
  await db`
    INSERT OR IGNORE INTO voice_temporary_room_moderators (channel_id, user_id)
    VALUES (${channelId}, ${userId})
  `;
}

export async function removeVoiceTemporaryRoomModerator(channelId: string, userId: string) {
  await db`DELETE FROM voice_temporary_room_moderators WHERE channel_id = ${channelId} AND user_id = ${userId}`;
}

export async function getVoiceTemporaryRoomModerators(channelId: string): Promise<VoiceTemporaryRoomModerator[]> {
  return db<VoiceTemporaryRoomModerator[]>`SELECT * FROM voice_temporary_room_moderators WHERE channel_id = ${channelId}`;
}

export async function isVoiceTemporaryRoomModerator(channelId: string, userId: string): Promise<boolean> {
  const [row] = await db<{ count: number }[]>`
    SELECT COUNT(*) as count FROM voice_temporary_room_moderators WHERE channel_id = ${channelId} AND user_id = ${userId}
  `;
  return (row?.count ?? 0) > 0;
}

export async function setVoiceTemporaryRoomModerators(channelId: string, userIds: string[]) {
  await db`DELETE FROM voice_temporary_room_moderators WHERE channel_id = ${channelId}`;
  for (const userId of userIds) {
    await db`INSERT OR IGNORE INTO voice_temporary_room_moderators (channel_id, user_id) VALUES (${channelId}, ${userId})`;
  }
}

export async function getVoiceTemporaryRoomWhitelist(channelId: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`SELECT user_id FROM voice_temporary_room_whitelist WHERE channel_id = ${channelId}`;
  return rows.map((r) => r.user_id);
}

export async function setVoiceTemporaryRoomWhitelist(channelId: string, userIds: string[]) {
  await db`DELETE FROM voice_temporary_room_whitelist WHERE channel_id = ${channelId}`;
  for (const userId of userIds) {
    await db`INSERT OR IGNORE INTO voice_temporary_room_whitelist (channel_id, user_id) VALUES (${channelId}, ${userId})`;
  }
}

export async function getVoiceTemporaryRoomBlacklist(channelId: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`SELECT user_id FROM voice_temporary_room_blacklist WHERE channel_id = ${channelId}`;
  return rows.map((r) => r.user_id);
}

export async function setVoiceTemporaryRoomBlacklist(channelId: string, userIds: string[]) {
  await db`DELETE FROM voice_temporary_room_blacklist WHERE channel_id = ${channelId}`;
  for (const userId of userIds) {
    await db`INSERT OR IGNORE INTO voice_temporary_room_blacklist (channel_id, user_id) VALUES (${channelId}, ${userId})`;
  }
}
