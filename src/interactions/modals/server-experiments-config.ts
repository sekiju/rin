import { MessageFlags } from "discord-api-types/v10";
import type { ServerConfig } from "~/db";
import type { ModalCtx } from "~/interactions/router";
import { parseComponents } from "~/utils/modal";
import { EXPERIMENTS_MODAL_COMPONENTS } from "~/interactions/commands/settings/experiments";

export async function handleServerExperimentsConfigModal(ctx: ModalCtx) {
  const { interaction, guildId, api, db } = ctx;

  const parsed = parseComponents(EXPERIMENTS_MODAL_COMPONENTS, interaction.data.components);

  const newConfig: Partial<ServerConfig> = {
    guild_id: guildId,
    experiment_keyboard_layout_fix: parsed.experiments.some((v) => v === "experiment_keyboard_layout_fix"),
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
