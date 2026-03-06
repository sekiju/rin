import {
  APIModalInteractionResponseCallbackData,
  ChannelType,
  ComponentType,
  GatewayDispatchEvents,
  InteractionType,
  MessageFlags,
  PermissionFlagsBits,
  SelectMenuDefaultValueType,
  TextInputStyle,
} from "discord-api-types/v10";
import { EventHandler } from "~/core/types";
import { ServerConfig, VoiceTemporaryRoomAccessMode } from "~/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hasPermission = (permissions: bigint, permission: bigint) => (permissions & permission) === permission;

/** Walk a modal component list and return the inner component for a given custom_id. */
function getModalComponent(components: any[], customId: string): any {
  for (const comp of components) {
    // Label wrapper: { type: Label, component: { custom_id, ... } }
    const inner = comp.component ?? comp;
    if (inner?.custom_id === customId) return inner;
    // ActionRow: { type: ActionRow, components: [...] }
    for (const c of comp.components ?? []) {
      if (c.custom_id === customId) return c;
    }
  }
  return null;
}

function buildRoomPermissionOverwrites(
  guildId: string,
  ownerId: string,
  accessMode: VoiceTemporaryRoomAccessMode,
  moderatorIds: string[],
  whitelistIds: string[],
  blacklistIds: string[],
): any[] {
  const perms = PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;

  const everyoneDeny =
    accessMode === "open"
      ? 0n
      : accessMode === "locked"
        ? PermissionFlagsBits.Connect
        : PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;

  const memberOverwrites = new Map<string, { allow: bigint; deny: bigint }>();

  for (const id of whitelistIds) memberOverwrites.set(id, { allow: perms, deny: 0n });
  for (const id of moderatorIds) {
    if (!blacklistIds.includes(id)) memberOverwrites.set(id, { allow: perms, deny: 0n });
  }
  for (const id of blacklistIds) memberOverwrites.set(id, { allow: 0n, deny: perms });

  memberOverwrites.set(ownerId, { allow: perms, deny: 0n });

  return [
    { id: guildId, type: 0, allow: "0", deny: everyoneDeny.toString() },
    ...[...memberOverwrites.entries()].map(([id, { allow, deny }]) => ({
      id,
      type: 1,
      allow: allow.toString(),
      deny: deny.toString(),
    })),
  ];
}

const handler: EventHandler<GatewayDispatchEvents.InteractionCreate, "db"> = {
  event: GatewayDispatchEvents.InteractionCreate,
  services: ["db"],
  handler: async ({ data: interaction, api, db }) => {
    const guildId = interaction.guild_id;
    if (!guildId) return;

    const invokerId: string = (interaction as any).member?.user?.id ?? (interaction as any).user?.id;

    // ── /settings ────────────────────────────────────────────────────────────

    if (interaction.type === InteractionType.ApplicationCommand && interaction.data.name === "settings") {
      let config = await db.getConfig(guildId);
      config ||= { guild_id: guildId, voice_channel_id: null, room_name_template: null };

      const categoryIds = await db.getServerConfigCategories(guildId);

      const modal: APIModalInteractionResponseCallbackData = {
        title: "Настройки сервера",
        custom_id: "server-config-modal",
        components: [
          {
            type: ComponentType.Label,
            label: "Голосовой канал",
            description: "Канал для создания временных комнат",
            component: {
              type: ComponentType.ChannelSelect,
              custom_id: "room_channel",
              min_values: 0,
              max_values: 1,
              channel_types: [ChannelType.GuildVoice],
              default_values: config.voice_channel_id ? [{ id: config.voice_channel_id, type: SelectMenuDefaultValueType.Channel }] : [],
              required: false,
            },
          },
          {
            type: ComponentType.Label,
            label: "Категории комнат",
            description: "Категории для временных комнат по приоритету (если категория заполнена — следующая)",
            component: {
              type: ComponentType.ChannelSelect,
              custom_id: "room_categories",
              min_values: 0,
              max_values: 10,
              channel_types: [ChannelType.GuildCategory],
              default_values: categoryIds.map((id) => ({ id, type: SelectMenuDefaultValueType.Channel })),
              required: false,
            },
          },
          {
            type: ComponentType.Label,
            label: "Шаблон имени комнаты",
            component: {
              type: ComponentType.TextInput,
              custom_id: "room_name_template",
              style: TextInputStyle.Short,
              placeholder: "{username}",
              ...(config.room_name_template ? { value: config.room_name_template } : {}),
              required: false,
              max_length: 100,
            },
          },
        ],
      };

      // TODO: Нужно добавить опции: синхронизация с категорией + модерация сервера дискорд (они должны будут автоматически получать роли модераторов комнат)

      await api.interactions.createModal(interaction.id, interaction.token, modal);

      // ── server-config-modal submit ────────────────────────────────────────────
    } else if (interaction.type === InteractionType.ModalSubmit && interaction.data.custom_id === "server-config-modal") {
      const newConfig: ServerConfig = { guild_id: guildId, voice_channel_id: null, room_name_template: null };
      let newCategoryIds: string[] = [];

      for (const component of interaction.data.components) {
        if ((component as any).type === ComponentType.Label) {
          const c = (component as any).component ?? component;
          if (!c) continue;
          if (c.type === ComponentType.ChannelSelect) {
            if (c.custom_id === "room_channel" && Array.isArray(c.values) && c.values.length > 0) newConfig.voice_channel_id = c.values[0]!;
            if (c.custom_id === "room_categories" && Array.isArray(c.values)) newCategoryIds = c.values;
          }
        } else if (component.type === ComponentType.ActionRow) {
          for (const inner of component.components) {
            if (inner.type === ComponentType.TextInput && inner.custom_id === "room_name_template") {
              newConfig.room_name_template = inner.value?.trim() || null;
            }
          }
        }
      }

      const prevConfig = await db.getConfig(guildId);
      const voiceRoomChanged = newConfig.voice_channel_id !== prevConfig?.voice_channel_id;

      const resolvedChannel = interaction.data.resolved?.channels?.[newConfig.voice_channel_id];
      const requiredPerms = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers;
      if (voiceRoomChanged && !hasPermission(BigInt(resolvedChannel?.permissions || "0"), requiredPerms)) {
        await api.interactions.reply(interaction.id, interaction.token, {
          content: `У бота недостаточно прав для канала <#${newConfig.voice_channel_id}>. Необходимые права: Просмотр канала, Управление каналом, Перемещение участников.\n-# Настройки не были изменены.`,
          allowed_mentions: {},
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await db.setConfig({ ...(prevConfig || {}), ...newConfig });
      await db.setServerConfigCategories(guildId, newCategoryIds);

      const categoriesText = newCategoryIds.length > 0 ? newCategoryIds.map((id) => `<#${id}>`).join(", ") : "*(Не заданы)*";
      const templateText = newConfig.room_name_template ? `\`${newConfig.room_name_template}\`` : "*(По умолчанию)*";

      await api.interactions.reply(interaction.id, interaction.token, {
        content: [
          "Настройки обновлены",
          `-# - Голосовой канал для создания комнат: ${newConfig.voice_channel_id ? `<#${newConfig.voice_channel_id}>` : "*(Не задан)*"}`,
          `-# - Категории комнат: ${categoriesText}`,
          `-# - Шаблон имени комнаты: ${templateText}`,
        ].join("\n"),
        allowed_mentions: {},
        flags: MessageFlags.Ephemeral,
      });

      // ── /room settings ────────────────────────────────────────────────────────
    } else if (interaction.type === InteractionType.ApplicationCommand && interaction.data.name === "room") {
      const subcommand = (interaction.data as any).options?.[0]?.name as string | undefined;

      if (subcommand === "settings") {
        const room = await db.getUserCurrentVoiceRoom(invokerId, guildId);
        if (!room) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Вы не находитесь в голосовой комнате.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const isMod = room.owner_id === invokerId || (await db.isVoiceTemporaryRoomModerator(room.channel_id, invokerId));
        if (!isMod) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Вы не являетесь владельцем или модератором этой комнаты.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const channel = (await api.channels.get(room.channel_id).catch(() => null)) as any;

        const accessModeDefaults = (current: VoiceTemporaryRoomAccessMode) => [
          { label: "Открытый", value: "open", default: current === "open" },
          { label: "Закрытый", value: "locked", default: current === "locked" },
          { label: "Невидимый", value: "hidden", default: current === "hidden" },
        ];

        const modal: APIModalInteractionResponseCallbackData = {
          title: "Настройки комнаты",
          custom_id: `voice-room-config-modal:${room.channel_id}`,
          components: [
            {
              type: ComponentType.Label,
              label: "Название канала",
              component: {
                type: ComponentType.TextInput,
                custom_id: "channel_name",
                style: TextInputStyle.Short,
                value: channel?.name ?? "",
                min_length: 2,
                max_length: 100,
                required: true,
              },
            },
            {
              type: ComponentType.Label,
              label: "Кол-во участников",
              description: "Оставьте пустым — без ограничений",
              component: {
                type: ComponentType.TextInput,
                custom_id: "user_limit",
                style: TextInputStyle.Short,
                value: channel?.user_limit ? String(channel.user_limit) : "",
                max_length: 2,
                required: false,
              },
            },
            {
              type: ComponentType.Label,
              label: "Доступ к каналу",
              component: {
                type: ComponentType.StringSelect,
                custom_id: "access_mode",
                required: true,
                options: accessModeDefaults(room.access_mode),
              },
            },
          ],
        };

        // TODO: NSFW канал

        await api.interactions.createModal(interaction.id, interaction.token, modal);

        // ── /room members ──────────────────────────────────────────────────────
      } else if (subcommand === "members") {
        const room = await db.getUserCurrentVoiceRoom(invokerId, guildId);
        if (!room) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Вы не находитесь в голосовой комнате.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const isMod = room.owner_id === invokerId || (await db.isVoiceTemporaryRoomModerator(room.channel_id, invokerId));
        if (!isMod) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Вы не являетесь владельцем или модератором этой комнаты.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const moderators = await db.getVoiceTemporaryRoomModerators(room.channel_id);
        const whitelist = await db.getVoiceTemporaryRoomWhitelist(room.channel_id);
        const blacklist = await db.getVoiceTemporaryRoomBlacklist(room.channel_id);

        const toDefaultUsers = (ids: string[]) => ids.map((id) => ({ id, type: SelectMenuDefaultValueType.User }));

        const modal: APIModalInteractionResponseCallbackData = {
          title: "Участники комнаты",
          custom_id: `voice-room-members-modal:${room.channel_id}`,
          components: [
            {
              type: ComponentType.Label,
              label: "Модераторы",
              component: {
                type: ComponentType.UserSelect,
                custom_id: "moderators",
                min_values: 0,
                max_values: 10,
                default_values: toDefaultUsers(moderators.map((m) => m.user_id)),
                required: false,
              },
            },
            {
              type: ComponentType.Label,
              label: "Белый список",
              component: {
                type: ComponentType.UserSelect,
                custom_id: "user_whitelist",
                min_values: 0,
                max_values: 10,
                default_values: toDefaultUsers(whitelist),
                required: false,
              },
            },
            {
              type: ComponentType.Label,
              label: "Чёрный список",
              component: {
                type: ComponentType.UserSelect,
                custom_id: "user_blacklist",
                min_values: 0,
                max_values: 10,
                default_values: toDefaultUsers(blacklist),
                required: false,
              },
            },
          ],
        };

        await api.interactions.createModal(interaction.id, interaction.token, modal);

        // ── /room kick ──────────────────────────────────────────────────────────
      } else if (subcommand === "kick") {
        const targetUserId = (interaction.data as any).options?.[0]?.options?.[0]?.value as string | undefined;
        if (!targetUserId) return;

        const room = await db.getUserCurrentVoiceRoom(invokerId, guildId);
        if (!room) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Вы не находитесь в голосовой комнате.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const isMod = room.owner_id === invokerId || (await db.isVoiceTemporaryRoomModerator(room.channel_id, invokerId));
        if (!isMod) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Вы не являетесь владельцем или модератором этой комнаты.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (targetUserId === invokerId) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Нельзя кикнуть себя.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (targetUserId === room.owner_id) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Нельзя кикнуть владельца комнаты.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const targetRoom = await db.getUserCurrentVoiceRoom(targetUserId, guildId);
        if (targetRoom?.channel_id !== room.channel_id) {
          await api.interactions.reply(interaction.id, interaction.token, {
            content: "Этот участник не находится в вашей комнате.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await api.guilds.editMember(guildId, targetUserId, { channel_id: null });

        await api.interactions.reply(interaction.id, interaction.token, {
          content: `Участник <@${targetUserId}> кикнут из комнаты.`,
          allowed_mentions: {},
          flags: MessageFlags.Ephemeral,
        });
      }

      // ── voice-room-config-modal submit ────────────────────────────────────────
    } else if (interaction.type === InteractionType.ModalSubmit && interaction.data.custom_id.startsWith("voice-room-config-modal:")) {
      const channelId = interaction.data.custom_id.split(":")[1]!;

      const room = await db.getVoiceTemporaryRoom(channelId);
      if (!room) {
        await api.interactions.reply(interaction.id, interaction.token, {
          content: "Комната больше не существует.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const isMod = room.owner_id === invokerId || (await db.isVoiceTemporaryRoomModerator(channelId, invokerId));
      if (!isMod) {
        await api.interactions.reply(interaction.id, interaction.token, {
          content: "Вы не являетесь владельцем или модератором этой комнаты.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const comps = interaction.data.components as any[];

      const channelName: string = getModalComponent(comps, "channel_name")?.value ?? "";
      const userLimitRaw: string = getModalComponent(comps, "user_limit")?.value ?? "";
      const accessMode = (getModalComponent(comps, "access_mode")?.values?.[0] ?? "open") as VoiceTemporaryRoomAccessMode;

      const userLimit = Math.max(0, Math.min(99, parseInt(userLimitRaw) || 0));

      // Fetch current lists from DB to rebuild permission overwrites
      const moderatorIds = (await db.getVoiceTemporaryRoomModerators(channelId)).map((m: any) => m.user_id);
      const whitelistIds = await db.getVoiceTemporaryRoomWhitelist(channelId);
      const blacklistIds = await db.getVoiceTemporaryRoomBlacklist(channelId);

      const permissionOverwrites = buildRoomPermissionOverwrites(
        guildId,
        room.owner_id,
        accessMode,
        moderatorIds,
        whitelistIds,
        blacklistIds,
      );

      await api.channels.edit(channelId, {
        name: channelName || undefined,
        user_limit: userLimit,
        permission_overwrites: permissionOverwrites,
      });

      await db.setVoiceTemporaryRoomAccessMode(channelId, accessMode);

      const accessModeLabel = { open: "Открытый", locked: "Закрытый", hidden: "Невидимый" }[accessMode];

      await api.interactions.reply(interaction.id, interaction.token, {
        content: [
          "Настройки комнаты обновлены",
          `-# - Название: ${channelName}`,
          `-# - Кол-во участников: ${userLimit === 0 ? "Без ограничений" : userLimit}`,
          `-# - Доступ: ${accessModeLabel}`,
        ].join("\n"),
        allowed_mentions: {},
        flags: MessageFlags.Ephemeral,
      });

      // ── voice-room-members-modal submit ───────────────────────────────────────
    } else if (interaction.type === InteractionType.ModalSubmit && interaction.data.custom_id.startsWith("voice-room-members-modal:")) {
      const channelId = interaction.data.custom_id.split(":")[1]!;

      const room = await db.getVoiceTemporaryRoom(channelId);
      if (!room) {
        await api.interactions.reply(interaction.id, interaction.token, {
          content: "Комната больше не существует.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const isMod = room.owner_id === invokerId || (await db.isVoiceTemporaryRoomModerator(channelId, invokerId));
      if (!isMod) {
        await api.interactions.reply(interaction.id, interaction.token, {
          content: "Вы не являетесь владельцем или модератором этой комнаты.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const comps = interaction.data.components as any[];

      const moderatorIds: string[] = getModalComponent(comps, "moderators")?.values ?? [];
      const whitelistIds: string[] = getModalComponent(comps, "user_whitelist")?.values ?? [];
      const blacklistIds: string[] = getModalComponent(comps, "user_blacklist")?.values ?? [];

      const permissionOverwrites = buildRoomPermissionOverwrites(
        guildId,
        room.owner_id,
        room.access_mode,
        moderatorIds,
        whitelistIds,
        blacklistIds,
      );

      // TODO: Нужна проверка чтобы один пользователь не был в нескольких списках.

      await api.channels.edit(channelId, { permission_overwrites: permissionOverwrites });

      await db.setVoiceTemporaryRoomModerators(channelId, moderatorIds);
      await db.setVoiceTemporaryRoomWhitelist(channelId, whitelistIds);
      await db.setVoiceTemporaryRoomBlacklist(channelId, blacklistIds);

      const mention = (ids: string[]) => (ids.length > 0 ? ids.map((id) => `<@${id}>`).join(", ") : "*(Нет)*");

      await api.interactions.reply(interaction.id, interaction.token, {
        content: [
          "Список участников обновлён",
          `-# - Модераторы: ${mention(moderatorIds)}`,
          `-# - Белый список: ${mention(whitelistIds)}`,
          `-# - Чёрный список: ${mention(blacklistIds)}`,
        ].join("\n"),
        allowed_mentions: {},
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default handler;
