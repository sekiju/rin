import { APILabelComponent, ComponentType } from "discord-api-types/v10";
import type { CommandCtx } from "~/interactions/router";
import { createComponents } from "~/utils/modal";

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

  let config = db.serverConfigs.get(guildId);
  config ||= {
    guild_id: guildId,
    room_channel_id: null,
    room_name_template: null,
    room_category_sync: false,
    server_mods_as_room_mods: false,
    experiment_keyboard_layout_fix: false,
  };

  const experiments: string[] = [];
  if (config.experiment_keyboard_layout_fix) {
    experiments.push("experiment_keyboard_layout_fix");
  }

  await api.interactions.createModal(interaction.id, interaction.token, {
    title: "Настройки экспериментов",
    custom_id: "server-experiments-config-modal",
    components: createComponents(EXPERIMENTS_MODAL_COMPONENTS, { experiments }),
  });
}
