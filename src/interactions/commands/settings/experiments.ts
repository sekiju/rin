import { APILabelComponent, ComponentType } from "discord-api-types/v10";
import type { CommandCtx } from "~/interactions/router";
import { createComponents } from "~/utils/modal";
import { ExperimentFlags } from "~/db";

export const EXPERIMENTS_MODAL_COMPONENTS = [
  {
    type: ComponentType.Label,
    label: "Эксперименты",
    component: {
      type: ComponentType.StringSelect,
      custom_id: "experiments",
      min_values: 0,
      max_values: 1,
      options: [{ label: "Авто-исправление раскладки", value: "experiment_keyboard_layout_fix" }],
      required: false,
    },
  },
] as const satisfies readonly APILabelComponent[];

export async function handleServerSettingsExperimentsCommand(ctx: CommandCtx) {
  const { interaction, guildId, api, db } = ctx;

  const config = db.serverConfigs.get(guildId, true);

  const experiments: string[] = [];
  if (config.experiments & ExperimentFlags.RussianKeyboardLayoutFix) {
    experiments.push("experiment_keyboard_layout_fix");
  }

  await api.interactions.createModal(interaction.id, interaction.token, {
    title: "Настройки экспериментов",
    custom_id: "server-experiments-config-modal",
    components: createComponents(EXPERIMENTS_MODAL_COMPONENTS, { experiments }),
  });
}
