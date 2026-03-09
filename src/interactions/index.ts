import { InteractionRouter } from "./router";
import { handleServerSettingsRoomCommand } from "~/interactions/commands/settings/room";
import { handleRoomSettingsCommand } from "./commands/room/settings";
import { handleRoomMembersCommand } from "./commands/room/members";
import { handleRoomKickCommand } from "./commands/room/kick";
import { handleRoomConfigModal } from "./modals/room-config";
import { handleRoomMembersModal } from "./modals/room-members";
import { handleServerSettingsExperimentsCommand } from "~/interactions/commands/settings/experiments";
import { handleServerRoomsConfigModal } from "~/interactions/modals/server-rooms-config";
import { handleServerExperimentsConfigModal } from "~/interactions/modals/server-experiments-config";

export const router = new InteractionRouter()
  .subcommand("settings", "experiments", handleServerSettingsExperimentsCommand)
  .subcommand("settings", "room", handleServerSettingsRoomCommand)
  .subcommand("room", "settings", handleRoomSettingsCommand)
  .subcommand("room", "members", handleRoomMembersCommand)
  .subcommand("room", "kick", handleRoomKickCommand)
  .modal("server-experiments-config-modal", handleServerExperimentsConfigModal)
  .modal("server-rooms-config-modal", handleServerRoomsConfigModal)
  .modal(/^voice-room-config-modal:/, handleRoomConfigModal)
  .modal(/^voice-room-members-modal:/, handleRoomMembersModal);
