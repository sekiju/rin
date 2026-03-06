import { InteractionRouter } from "./router";
import { handleServerSettingsRoomCommand } from "./commands/server/settings/room";
import { handleRoomSettingsCommand } from "./commands/room/settings";
import { handleRoomMembersCommand } from "./commands/room/members";
import { handleRoomKickCommand } from "./commands/room/kick";
import { handleServerConfigModal } from "./modals/server-config";
import { handleRoomConfigModal } from "./modals/room-config";
import { handleRoomMembersModal } from "./modals/room-members";

export const router = new InteractionRouter()
  .subcommandGroup("server", "settings", "room", handleServerSettingsRoomCommand)
  .subcommand("room", "settings", handleRoomSettingsCommand)
  .subcommand("room", "members", handleRoomMembersCommand)
  .subcommand("room", "kick", handleRoomKickCommand)
  .modal("server-config-modal", handleServerConfigModal)
  .modal(/^voice-room-config-modal:/, handleRoomConfigModal)
  .modal(/^voice-room-members-modal:/, handleRoomMembersModal);
