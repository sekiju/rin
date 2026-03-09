import { EventHandler } from "~/core/types";
import { GatewayDispatchEvents } from "discord-api-types/v10";

const EN_CHARS = " `qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?~";
const RU_CHARS = " ёйцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,Ё";

const keyboardLayoutMap: Record<string, string> = Object.fromEntries(EN_CHARS.split("").map((ch, i) => [ch, RU_CHARS[i]]));

const isProbablyWrongLayout = (text: string): boolean => {
  if (/[а-яА-ЯёЁ]/.test(text)) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  return /[^aeiouy\W0-9_]{4,}/gi.test(text);
};

const fixLayout = (text: string): string =>
  text
    .split("")
    .map((ch) => keyboardLayoutMap[ch] ?? ch)
    .join("");

const handler: EventHandler<GatewayDispatchEvents.MessageCreate, "db"> = {
  event: GatewayDispatchEvents.MessageCreate,
  services: ["db"],
  handler: async ({ data: message, api, db }) => {
    if (message.author.bot || !message.guild_id || !message.content) return;

    const config = db.serverConfigs.get(message.guild_id);
    if (!config?.experiment_keyboard_layout_fix) return;

    if (isProbablyWrongLayout(message.content)) {
      await api.channels.createMessage(message.channel_id, {
        content: fixLayout(message.content),
        allowed_mentions: {},
        message_reference: { message_id: message.id },
      });
    }
  },
};

export default handler;
