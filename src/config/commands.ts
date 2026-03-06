import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  RESTPutAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";

export const applicationCommands = [
  {
    name: "settings", // TODO: Вынести в /server settings room
    description: "Настройки голосовых каналов на сервере",
    type: ApplicationCommandType.ChatInput,
    options: [],
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
  },
  {
    name: "room",
    description: "Управление голосовой комнатой",
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: "settings",
        description: "Настройки текущей голосовой комнаты",
        type: ApplicationCommandOptionType.Subcommand,
        options: [],
      },
      {
        name: "members",
        description: "Управление списками участников комнаты",
        type: ApplicationCommandOptionType.Subcommand,
        options: [],
      },
      {
        name: "kick",
        description: "Кикнуть участника из голосовой комнаты",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "user",
            description: "Участник для кика",
            type: ApplicationCommandOptionType.User,
            required: true,
          },
        ],
      },
    ],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
  },
] satisfies RESTPutAPIApplicationCommandsJSONBody;
