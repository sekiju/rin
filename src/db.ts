import { open } from "lmdb";
import { VersionedStore } from "~/utils/versioned-store";

const root = open({ path: "./data" });

export enum ExperimentFlags {
  None = 0,
  RussianKeyboardLayoutFix = 1 << 0,
}

export interface ServerConfig {
  voice: {
    enabled: boolean;
    triggerChannelId: string | null;
    nameTemplate: string;
    categories: string[];
    categoryPermissionSync: boolean;
  };
  experiments: ExperimentFlags;
}

export const serverConfigs = new VersionedStore<ServerConfig>({
  db: root,
  name: "server-configs",
  version: 1,
  migrations: {},
  default: {
    voice: { enabled: false, triggerChannelId: null, nameTemplate: "{username}", categories: [], categoryPermissionSync: false },
    experiments: 0,
  },
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
  default: {
    guildId: "",
    ownerId: "",
    accessMode: VoiceTemporaryRoomAccessMode.Open,
    members: [],
    whitelist: [],
    blacklist: [],
    moderators: [],
  },
});
