import { ModalSubmitLabelComponent, MessageFlags, APIModalSubmitStringSelectComponent } from "discord-api-types/v10";
import type { ServerConfig } from "~/db";
import type { ModalCtx } from "~/interactions/router";

export async function handleServerExperimentsConfigModal(ctx: ModalCtx) {
  const { interaction, guildId, api, db } = ctx;

  const values = ((interaction.data.components[0] as ModalSubmitLabelComponent).component as APIModalSubmitStringSelectComponent).values;

  const newConfig: Partial<ServerConfig> = {
    guild_id: guildId,
    experiment_keyboard_layout_fix: values.some((v) => v === "experiment_keyboard_layout_fix"),
  };

  const prevConfig = await db.getConfig(guildId);
  await db.setConfig({ ...prevConfig, ...newConfig });

  await api.interactions.reply(interaction.id, interaction.token, {
    content: [
      "Настройки экспериментов обновлены",
      `-# - Авто-исправление раскладки: ${newConfig.experiment_keyboard_layout_fix ? "Включено" : "Выключено"}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
