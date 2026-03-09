import { MessageFlags } from "discord-api-types/v10";
import { ExperimentFlags } from "~/db";
import type { ModalCtx } from "~/interactions/router";
import { parseComponents } from "~/utils/modal";
import { EXPERIMENTS_MODAL_COMPONENTS } from "~/interactions/commands/settings/experiments";

export async function handleServerExperimentsConfigModal(ctx: ModalCtx) {
  const { interaction, guildId, api, db } = ctx;

  const parsed = parseComponents(EXPERIMENTS_MODAL_COMPONENTS, interaction.data.components);

  const prevConfig = db.serverConfigs.get(guildId, true);
  const enabled = parsed.experiments.some((v) => v === "experiment_keyboard_layout_fix");
  const experiments = enabled
    ? prevConfig.experiments | ExperimentFlags.RussianKeyboardLayoutFix
    : prevConfig.experiments & ~ExperimentFlags.RussianKeyboardLayoutFix;

  await db.serverConfigs.put(guildId, { ...prevConfig, experiments });

  await api.interactions.reply(interaction.id, interaction.token, {
    content: ["Настройки экспериментов обновлены", `-# - Авто-исправление раскладки: ${enabled ? "Включено" : "Выключено"}`].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
